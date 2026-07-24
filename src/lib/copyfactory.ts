/**
 * CopyFactory Cloud client wrapper.
 *
 * Docs: https://metaapi.cloud/docs/copyfactory/
 *
 * ARCHITECTURE
 * ------------
 * CopyFactory is MetaApi's trade-copying service. The flow is:
 *
 *   1. MASTER (you, the bot operator) creates a Strategy in the MetaApi
 *      dashboard. The Strategy is bound to the master MT5 account
 *      (META_API_MASTER_LOGIN). Every trade opened on the master MT5
 *      account becomes a "signal" that CopyFactory can replicate to
 *      subscribers.
 *
 *   2. SUBSCRIBER (each paying user) creates their OWN MetaApi account
 *      (free tier), adds their OWN MT5 account in their dashboard, then
 *      creates a CopyFactory Subscriber that points to the MASTER's
 *      strategyId. The subscriber NEVER shares their MT5 password with
 *      the master — privacy is preserved.
 *
 *   3. The bot's role is to:
 *      - Create/manage the Strategy via API (optional — can also be done
 *        manually in the dashboard).
 *      - Receive a subscriberId from each subscriber (via the web UI or
 *        Telegram bot).
 *      - Optionally verify the subscriber exists and is active.
 *      - Track per-subscriber trade history (read-only, via MetaStats
 *        API or CopyFactory's trade events).
 *
 * ENV VARS
 * --------
 *   META_API_TOKEN          — JWT token with copyfactory-api:reader+writer
 *   COPYFACTORY_STRATEGY_ID — ID of the master strategy (set after creating
 *                              the strategy in the dashboard)
 */
import "dotenv/config";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

const META_API_TOKEN = process.env.META_API_TOKEN || "";
const COPYFACTORY_STRATEGY_ID = process.env.COPYFACTORY_STRATEGY_ID || "";
const SIMULATION = !META_API_TOKEN;

// CopyFactory API uses a dedicated domain (separate from provisioning/client APIs).
// Docs: https://metaapi.cloud/docs/copyfactory/rest-api/
const COPYFACTORY_DOMAIN =
  process.env.COPYFACTORY_DOMAIN ||
  "copyfactory.cloud-trail.com";

// Permissive dispatcher — same SSL workaround as metaapi.ts (some regions have
// incomplete cert chains).
const permissiveDispatcher = new UndiciAgent({
  connect: { rejectUnauthorized: false },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

async function cfFetch(
  path: string,
  init: RequestInit & { method?: string } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "auth-token": META_API_TOKEN,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return (undiciFetch as any)(`https://${COPYFACTORY_DOMAIN}${path}`, {
    ...init,
    headers,
    dispatcher: permissiveDispatcher,
  }) as unknown as Response;
}

// ============================================================
// TYPES
// ============================================================

export type Strategy = {
  _id: string;
  name: string;
  description?: string;
  accountId: string;
  accountLogin: string;
  platform: string;
  published: boolean;
  subscribersCount?: number;
  profitability?: number;
  roi?: number;
};

export type Subscriber = {
  _id: string;
  name: string;
  accountId: string;
  accountLogin: string;
  platform: string;
  strategies: Array<{
    strategyId: string;
    name?: string;
    active: boolean;
    skipCopyOpenPositions?: boolean;
    maxTradeRisk?: number;
    minTradeRisk?: number;
    reverse?: boolean;
    reduceTradeRiskToZeroOnStopOut?: boolean;
    currency?: string;
    executionRisk?: number;
  }>;
  state: string;
  connectionStatus?: string;
};

export type CopyTrade = {
  id: string;
  time: string;
  type: "BUY" | "SELL" | "CLOSE" | "MODIFY";
  symbol: string;
  volume: number;
  price: number;
  strategyId: string;
  subscriberId: string;
  profit?: number;
  comment?: string;
};

// ============================================================
// STRATEGY MANAGEMENT (master side)
// ============================================================

/**
 * List all strategies owned by the current token.
 * GET /users/current/strategies
 */
export async function listStrategies(): Promise<Strategy[]> {
  if (SIMULATION) return [];
  try {
    const res = await cfFetch(`/users/current/strategies`);
    if (!res.ok) {
      console.warn(`[CopyFactory] listStrategies failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data?.items || [];
    return arr.map((s: any) => ({
      _id: s._id || s.id,
      name: s.name,
      description: s.description,
      accountId: s.accountId,
      accountLogin: String(s.accountLogin || ""),
      platform: s.platform || "mt5",
      published: !!s.published,
      subscribersCount: s.subscribersCount,
      profitability: s.profitability,
      roi: s.roi,
    }));
  } catch (e) {
    console.warn(`[CopyFactory] listStrategies error:`, e);
    return [];
  }
}

/**
 * Get the configured master strategy ID (from env or first available).
 * Used at startup to verify the strategy exists.
 */
export async function getMasterStrategyId(): Promise<string | null> {
  if (COPYFACTORY_STRATEGY_ID) return COPYFACTORY_STRATEGY_ID;
  const strategies = await listStrategies();
  return strategies[0]?._id || null;
}

/**
 * Get details of a specific strategy.
 * GET /users/current/strategies/{strategyId}
 */
export async function getStrategy(strategyId: string): Promise<Strategy | null> {
  if (SIMULATION) return null;
  try {
    const res = await cfFetch(`/users/current/strategies/${strategyId}`);
    if (!res.ok) return null;
    const s = await res.json();
    return {
      _id: s._id || s.id,
      name: s.name,
      description: s.description,
      accountId: s.accountId,
      accountLogin: String(s.accountLogin || ""),
      platform: s.platform || "mt5",
      published: !!s.published,
      subscribersCount: s.subscribersCount,
      profitability: s.profitability,
      roi: s.roi,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new CopyFactory strategy bound to the master MetaApi account.
 * POST /users/current/strategies
 *
 * Body schema (per CopyFactory REST API docs):
 *   {
 *     name: string,
 *     description: string,
 *     accountId: string,       // MetaApi account ID of the master
 *     published: boolean,      // true = visible to external subscribers
 *     symbols: ["*"],          // trade all symbols the master opens
 *     ...extra: any
 *   }
 *
 * Returns the created strategy ID, or null on failure.
 */
export async function createStrategy(params: {
  name: string;
  description?: string;
  accountId: string; // master MetaApi account ID
  accountLogin?: string;
  published?: boolean;
  riskOptions?: Record<string, unknown>;
}): Promise<{ strategyId: string | null; error?: string; raw?: unknown }> {
  if (SIMULATION) {
    return {
      strategyId: `sim-strategy-${Date.now()}`,
      raw: { simulated: true },
    };
  }
  try {
    const body = {
      name: params.name,
      description: params.description || "ALFA Reports — automated gold trading strategy",
      accountId: params.accountId,
      accountLogin: params.accountLogin ? String(params.accountLogin) : undefined,
      platform: "mt5",
      published: params.published !== false, // default true
      symbols: ["*"], // copy all symbols the master opens
      // Default risk management — let subscribers override on their side.
      riskOptions: params.riskOptions || {
        maxDailyDrawdown: 0.2, // 20% of subscriber equity
        maxOverallDrawdown: 0.3, // 30% of subscriber equity
        maxTradeRisk: 0.05, // 5% of equity per trade
      },
    };

    const res = await cfFetch(`/users/current/strategies`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        strategyId: null,
        error: `CopyFactory API ${res.status}: ${txt || res.statusText}`,
        raw: { status: res.status, body: txt },
      };
    }

    // CopyFactory returns 201 Created with the strategy ID in the body.
    const data: any = await res.json().catch(() => ({}));
    const strategyId = data._id || data.id || data.strategyId;
    if (!strategyId) {
      return {
        strategyId: null,
        error: "CopyFactory created the strategy but no ID was returned",
        raw: data,
      };
    }
    return { strategyId, raw: data };
  } catch (e: any) {
    return { strategyId: null, error: e?.message || String(e) };
  }
}

/**
 * Update the published status of a strategy.
 * PUT /users/current/strategies/{strategyId}
 */
export async function updateStrategy(
  strategyId: string,
  updates: { name?: string; description?: string; published?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (SIMULATION) return { ok: true };
  try {
    const res = await cfFetch(`/users/current/strategies/${strategyId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${txt}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============================================================
// SUBSCRIBER VERIFICATION (bot side — read-only)
// ============================================================

/**
 * Verify that a subscriber exists and is connected to our strategy.
 *
 * IMPORTANT: Subscribers are created by each subscriber in their OWN MetaApi
 * dashboard. We CANNOT create them from our side (they belong to other users'
 * accounts). We can only VERIFY them by ID.
 *
 * GET /users/current/subscribers/{subscriberId}
 *
 * Returns null if not found, or if the subscriber is not connected to any
 * of our strategies.
 */
export async function getSubscriber(
  subscriberId: string
): Promise<Subscriber | null> {
  if (SIMULATION) {
    return {
      _id: subscriberId,
      name: `Simulated Subscriber ${subscriberId}`,
      accountId: "sim-account",
      accountLogin: "000000",
      platform: "mt5",
      strategies: [
        {
          strategyId: COPYFACTORY_STRATEGY_ID || "sim-strategy",
          active: true,
        },
      ],
      state: "ACTIVE",
    };
  }
  try {
    const res = await cfFetch(`/users/current/subscribers/${subscriberId}`);
    if (!res.ok) return null;
    const s = await res.json();
    return {
      _id: s._id || s.id,
      name: s.name,
      accountId: s.accountId,
      accountLogin: String(s.accountLogin || ""),
      platform: s.platform || "mt5",
      strategies: s.strategies || [],
      state: s.state || "UNKNOWN",
      connectionStatus: s.connectionStatus,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a subscriber is connected to our master strategy.
 * Returns { connected, active, strategyId, error }
 */
export async function verifySubscriberConnected(
  subscriberId: string,
  expectedStrategyId?: string
): Promise<{
  connected: boolean;
  active: boolean;
  strategyId?: string;
  error?: string;
}> {
  const sub = await getSubscriber(subscriberId);
  if (!sub) {
    return {
      connected: false,
      active: false,
      error: "Subscriber غير موجود في CopyFactory. تأكد من الـ Subscriber ID.",
    };
  }

  // Find a strategy entry that matches our master strategy.
  const expected = expectedStrategyId || COPYFACTORY_STRATEGY_ID;
  const matching = expected
    ? sub.strategies.find((s) => s.strategyId === expected)
    : sub.strategies[0];

  if (!matching) {
    return {
      connected: false,
      active: false,
      error: `Subscriber غير مرتبط بالاستراتيجية المتوقعة (${expected || "any"}). ` +
        `الاستراتيجيات المرتبطة: ${sub.strategies.map((s) => s.strategyId).join(", ") || "لا يوجد"}`,
    };
  }

  return {
    connected: true,
    active: !!matching.active,
    strategyId: matching.strategyId,
  };
}

// ============================================================
// TRADE HISTORY (per subscriber, read-only)
// ============================================================

/**
 * Get recent copied trades for a subscriber.
 * GET /users/current/subscribers/{subscriberId}/history/by-month/{YYYY-MM-DD}
 *
 * Returns trades copied to this subscriber in the last `limitHours` of time.
 * Useful for the dashboard to show each subscriber their copied trade history.
 */
export async function getSubscriberTradeHistory(
  subscriberId: string,
  limitHours = 24
): Promise<CopyTrade[]> {
  if (SIMULATION) return [];
  try {
    // CopyFactory returns trades by date — we fetch the current month + previous
    // to cover the typical 24h-7d lookback.
    const now = new Date();
    const dates: string[] = [];
    for (let i = 0; i < Math.ceil(limitHours / 24) + 1; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }

    const allTrades: CopyTrade[] = [];
    for (const date of dates) {
      const res = await cfFetch(
        `/users/current/subscribers/${subscriberId}/history/by-month/${date}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const trades = Array.isArray(data) ? data : data?.trades || [];
      for (const t of trades) {
        allTrades.push({
          id: t._id || t.id,
          time: t.time || t.openTime,
          type: t.type || (t.closeTime ? "CLOSE" : "BUY"),
          symbol: t.symbol,
          volume: t.volume || t.lots,
          price: t.price || t.openPrice,
          strategyId: t.strategyId,
          subscriberId,
          profit: t.profit,
          comment: t.comment,
        });
      }
    }

    // Filter to last N hours + sort newest first
    const cutoff = Date.now() - limitHours * 60 * 60 * 1000;
    return allTrades
      .filter((t) => new Date(t.time).getTime() >= cutoff)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } catch {
    return [];
  }
}

// ============================================================
// DIAGNOSTICS
// ============================================================

export function isSimulationMode(): boolean {
  return SIMULATION;
}

export function getConfiguredStrategyId(): string {
  return COPYFACTORY_STRATEGY_ID;
}

export function getCopyFactoryDomain(): string {
  return COPYFACTORY_DOMAIN;
}

/**
 * Diagnostic info — used by /api/admin/copyfactory/status.
 */
export async function getDiagnostics(): Promise<{
  simulation: boolean;
  domain: string;
  configuredStrategyId: string;
  resolvedStrategy: Strategy | null;
  strategiesCount: number;
  tokenPresent: boolean;
}> {
  const strategies = await listStrategies();
  const configuredId = COPYFACTORY_STRATEGY_ID;
  const resolved = configuredId
    ? await getStrategy(configuredId)
    : strategies[0] || null;
  return {
    simulation: SIMULATION,
    domain: COPYFACTORY_DOMAIN,
    configuredStrategyId: configuredId,
    resolvedStrategy: resolved,
    strategiesCount: strategies.length,
    tokenPresent: !!META_API_TOKEN,
  };
}
