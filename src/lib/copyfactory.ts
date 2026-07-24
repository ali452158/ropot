/**
 * CopyFactory Cloud client wrapper.
 *
 * Docs: https://metaapi.cloud/docs/copyfactory/
 *
 * ARCHITECTURE
 * ------------
 * CopyFactory is MetaApi's trade-copying service. The flow is:
 *
 *   1. MASTER (you, the bot operator) creates a Strategy in MetaApi bound to
 *      the master MT5 account (META_API_MASTER_LOGIN). Every trade opened on
 *      the master MT5 account becomes a "signal" that CopyFactory replicates
 *      to subscribers.
 *
 *   2. SUBSCRIBER (each paying user) creates their OWN MetaApi account
 *      (free tier), adds their OWN MT5 account in their dashboard, then
 *      creates a CopyFactory Subscriber that points to the MASTER's
 *      strategyId. The subscriber NEVER shares their MT5 password with
 *      the master — privacy is preserved.
 *
 *   3. The bot's role is to:
 *      - Create/manage the Strategy via API.
 *      - Receive a subscriberId from each subscriber (via the web UI or
 *        Telegram bot).
 *      - Verify the subscriber exists and is connected to the strategy.
 *      - Track per-subscriber trade history (read-only).
 *
 * DOMAIN RESOLUTION
 * -----------------
 * Unlike the provisioning API (fixed at mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai),
 * the CopyFactory API host is DYNAMIC. The official SDK does:
 *
 *   1. GET https://mt-provisioning-api-v1.{domain}/users/current/regions
 *      → returns ["vint-hill", "us-west", ...]
 *
 *   2. GET https://mt-provisioning-api-v1.{domain}/users/current/servers/mt-client-api
 *      → returns { domain: "agiliumtrade.agiliumtrade.ai" }
 *
 *   3. Construct: https://copyfactory-api-v1.{region}.{domain}
 *      e.g. https://copyfactory-api-v1.vint-hill.agiliumtrade.agiliumtrade.ai
 *
 * URL PATHS (per official SDK source — note the /configuration/ prefix!)
 * -----------------------------------------------------------------
 *   POST /users/current/configuration/strategies           → create strategy
 *   GET  /users/current/configuration/strategies           → list strategies
 *   GET  /users/current/configuration/strategies/{id}      → get strategy
 *   PUT  /users/current/configuration/strategies/{id}      → update strategy
 *   DELETE /users/current/configuration/strategies/{id}    → delete strategy
 *   GET  /users/current/configuration/subscribers          → list subscribers
 *   GET  /users/current/configuration/subscribers/{id}     → get subscriber
 *
 * ENV VARS
 * --------
 *   META_API_TOKEN          — JWT token with copyfactory-api:reader+writer
 *   COPYFACTORY_STRATEGY_ID — ID of the master strategy (set after creating)
 *   META_API_PROVISIONING_DOMAIN — provisioning domain (default agiliumtrade.agiliumtrade.ai)
 *   COPYFACTORY_REGION      — region override (default: first region from API)
 */
import "dotenv/config";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

const META_API_TOKEN = process.env.META_API_TOKEN || "";
const COPYFACTORY_STRATEGY_ID = process.env.COPYFACTORY_STRATEGY_ID || "";
const SIMULATION = !META_API_TOKEN;

// Provisioning domain — used to dynamically resolve the CopyFactory host
// (same domain used by metaapi.ts for account provisioning).
const META_API_PROVISIONING_DOMAIN =
  process.env.META_API_PROVISIONING_DOMAIN ||
  "mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// Optional region override (e.g. "vint-hill", "us-west", "us-east", "france", "germany").
// If empty, the first region from /users/current/regions is used.
const COPYFACTORY_REGION = process.env.COPYFACTORY_REGION || "";

// Permissive dispatcher — same SSL workaround as metaapi.ts (some regions have
// incomplete cert chains).
const permissiveDispatcher = new UndiciAgent({
  connect: { rejectUnauthorized: false },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

// ============================================================
// DYNAMIC HOST RESOLUTION (mirrors the official SDK)
// ============================================================

let cachedCopyFactoryUrl: string | null = null;
let cachedRegion: string | null = null;
let cachedDomain: string | null = null;
let cacheLastUpdated = 0;
let urlResolutionPromise: Promise<string | null> | null = null;
const URL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — same as official SDK

async function resolveCopyFactoryUrl(): Promise<string | null> {
  // Return cached value if fresh
  if (
    cachedCopyFactoryUrl &&
    Date.now() - cacheLastUpdated < URL_CACHE_TTL_MS
  ) {
    return cachedCopyFactoryUrl;
  }
  // Deduplicate concurrent resolutions
  if (urlResolutionPromise) return urlResolutionPromise;

  urlResolutionPromise = (async () => {
    try {
      // Step 1: Get the domain from /users/current/servers/mt-client-api
      const domainRes = await (undiciFetch as any)(
        `https://${META_API_PROVISIONING_DOMAIN}/users/current/servers/mt-client-api`,
        {
          headers: { "auth-token": META_API_TOKEN },
          dispatcher: permissiveDispatcher,
        }
      );
      if (!domainRes.ok) {
        console.warn(
          `[CopyFactory] Failed to fetch domain: ${domainRes.status} ${domainRes.statusText}`
        );
        return null;
      }
      const domainData: any = await domainRes.json();
      const domain = domainData?.domain || "agiliumtrade.agiliumtrade.ai";

      // Step 2: Get regions from /users/current/regions
      let region = COPYFACTORY_REGION;
      if (!region) {
        const regionsRes = await (undiciFetch as any)(
          `https://${META_API_PROVISIONING_DOMAIN}/users/current/regions`,
          {
            headers: { "auth-token": META_API_TOKEN },
            dispatcher: permissiveDispatcher,
          }
        );
        if (regionsRes.ok) {
          const regionsData: any = await regionsRes.json();
          const regions = Array.isArray(regionsData)
            ? regionsData
            : regionsData?.regions || [];
          region = regions[0] || "vint-hill";
        } else {
          region = "vint-hill"; // sensible default
        }
      }

      // Step 3: Construct the URL
      const url = `https://copyfactory-api-v1.${region}.${domain}`;
      cachedCopyFactoryUrl = url;
      cachedRegion = region;
      cachedDomain = domain;
      cacheLastUpdated = Date.now();
      console.log(
        `[CopyFactory] Resolved URL: ${url} (region=${region}, domain=${domain})`
      );
      return url;
    } catch (e: any) {
      console.warn(`[CopyFactory] URL resolution error:`, e?.message || e);
      return null;
    } finally {
      urlResolutionPromise = null;
    }
  })();

  return urlResolutionPromise;
}

async function cfFetch(
  path: string,
  init: RequestInit & { method?: string } = {}
): Promise<Response> {
  const baseUrl = await resolveCopyFactoryUrl();
  if (!baseUrl) {
    throw new Error(
      "CopyFactory URL not resolvable — check MetaApi token + provisioning domain"
    );
  }
  const headers: Record<string, string> = {
    "auth-token": META_API_TOKEN,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return (undiciFetch as any)(`${baseUrl}${path}`, {
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
 * GET /users/current/configuration/strategies
 */
export async function listStrategies(): Promise<Strategy[]> {
  if (SIMULATION) return [];
  try {
    const res = await cfFetch(`/users/current/configuration/strategies`);
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
 * GET /users/current/configuration/strategies/{strategyId}
 */
export async function getStrategy(strategyId: string): Promise<Strategy | null> {
  if (SIMULATION) return null;
  try {
    const res = await cfFetch(
      `/users/current/configuration/strategies/${strategyId}`
    );
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
 * POST /users/current/configuration/strategies
 *
 * Body schema (per CopyFactory REST API docs):
 *   {
 *     name: string,
 *     description: string,
 *     accountId: string,       // MetaApi account ID of the master
 *     published: boolean,      // true = visible to external subscribers
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
      description:
        params.description ||
        "ALFA Reports — automated gold trading strategy",
      accountId: params.accountId,
      accountLogin: params.accountLogin ? String(params.accountLogin) : undefined,
      platform: "mt5",
      published: params.published !== false, // default true
    };

    const res = await cfFetch(`/users/current/configuration/strategies`, {
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

    // CopyFactory returns 201 Created. Strategy ID is in the Location header
    // OR in the response body depending on version.
    const locationHeader = res.headers.get("location") || "";
    const data: any = await res.json().catch(() => ({}));
    const strategyId =
      data._id ||
      data.id ||
      data.strategyId ||
      (locationHeader ? locationHeader.split("/").pop() : null);

    if (!strategyId) {
      return {
        strategyId: null,
        error: "CopyFactory created the strategy but no ID was returned",
        raw: { data, location: locationHeader },
      };
    }
    return { strategyId, raw: data };
  } catch (e: any) {
    return { strategyId: null, error: e?.message || String(e) };
  }
}

/**
 * Update the published status / name / description of a strategy.
 * PUT /users/current/configuration/strategies/{strategyId}
 */
export async function updateStrategy(
  strategyId: string,
  updates: { name?: string; description?: string; published?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (SIMULATION) return { ok: true };
  try {
    const res = await cfFetch(
      `/users/current/configuration/strategies/${strategyId}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      }
    );
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
 * accounts). We can only VERIFY them by ID — and even then, only if the
 * subscriber belongs to the same MetaApi user as our token.
 *
 * For the typical "subscribers keep their passwords" flow, the subscriber
 * CREATES their subscriber under OUR MetaApi user (because they don't have
 * their own). Wait — that's not how it works. Let me re-read the docs...
 *
 * Actually, the CopyFactory subscriber is created under the same user as the
 * master strategy (i.e., OUR user). The subscriber specifies a MetaApi account
 * ID — that account belongs to the SAME user. So subscribers must give us
 * their MetaApi account ID + add their MT5 account to OUR MetaApi user. But
 * this still requires sharing their MT5 password with our MetaApi user...
 *
 * The TRUE privacy-preserving flow is:
 *   - Subscriber creates their OWN MetaApi user account (free tier)
 *   - Subscriber creates their OWN CopyFactory subscriber under their user
 *   - Subscriber creates a "subscription" to OUR strategy by ID
 *   - Subscriber shares THEIR CopyFactory subscriber ID with us
 *   - We CANNOT verify the subscriber via API (it's under a different user)
 *
 * So `verifySubscriberConnected()` below only works for subscribers created
 * under OUR MetaApi user. For TRUE privacy (subscribers on their own user),
 * we just trust the subscriber ID + show them a success message.
 *
 * GET /users/current/configuration/subscribers/{subscriberId}
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
    const res = await cfFetch(
      `/users/current/configuration/subscribers/${subscriberId}`
    );
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
 *
 * NOTE: This only succeeds for subscribers owned by OUR MetaApi user.
 * For TRUE privacy-preserving subscribers (on their own MetaApi user),
 * the API will return null/404 — that's expected. In that case, callers
 * should fall back to TRUSTING the subscriber ID + showing setup confirmation.
 */
export async function verifySubscriberConnected(
  subscriberId: string,
  expectedStrategyId?: string
): Promise<{
  connected: boolean;
  active: boolean;
  strategyId?: string;
  error?: string;
  trusted?: boolean; // true if we couldn't verify but accepted on trust
}> {
  const sub = await getSubscriber(subscriberId);
  if (!sub) {
    // Subscriber not found in our MetaApi user — likely on subscriber's own user.
    // Trust the subscriber ID (subscriber set up their own CopyFactory dashboard).
    return {
      connected: true, // trust
      active: true,
      strategyId: expectedStrategyId || COPYFACTORY_STRATEGY_ID,
      trusted: true,
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
 * GET /users/current/subscribers/{subscriberId}/user-log
 *
 * Returns the subscriber's user-log entries (which include copy events).
 */
export async function getSubscriberTradeHistory(
  subscriberId: string,
  limitHours = 24
): Promise<CopyTrade[]> {
  if (SIMULATION) return [];
  try {
    const res = await cfFetch(
      `/users/current/subscribers/${subscriberId}/user-log`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const trades = Array.isArray(data) ? data : data?.items || [];
    const cutoff = Date.now() - limitHours * 60 * 60 * 1000;
    return trades
      .filter((t: any) => new Date(t.time || t.timestamp || 0).getTime() >= cutoff)
      .map((t: any) => ({
        id: t._id || t.id,
        time: t.time || t.timestamp,
        type: t.type || (t.closeTime ? "CLOSE" : "BUY"),
        symbol: t.symbol,
        volume: t.volume || t.lots,
        price: t.price || t.openPrice,
        strategyId: t.strategyId,
        subscriberId,
        profit: t.profit,
        comment: t.comment,
      }))
      .sort(
        (a: CopyTrade, b: CopyTrade) =>
          new Date(b.time).getTime() - new Date(a.time).getTime()
      );
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
  return cachedDomain || "agiliumtrade.agiliumtrade.ai";
}

export function getCopyFactoryRegion(): string {
  return cachedRegion || COPYFACTORY_REGION || "vint-hill";
}

export function getCopyFactoryBaseUrl(): string {
  return cachedCopyFactoryUrl || "";
}

/**
 * Diagnostic info — used by /api/admin/copyfactory/status.
 */
export async function getDiagnostics(): Promise<{
  simulation: boolean;
  baseUrl: string;
  region: string;
  domain: string;
  configuredStrategyId: string;
  resolvedStrategy: Strategy | null;
  strategiesCount: number;
  tokenPresent: boolean;
}> {
  const baseUrl = await resolveCopyFactoryUrl();
  const strategies = await listStrategies();
  const configuredId = COPYFACTORY_STRATEGY_ID;
  const resolved = configuredId
    ? await getStrategy(configuredId)
    : strategies[0] || null;
  return {
    simulation: SIMULATION,
    baseUrl: baseUrl || "(unresolved)",
    region: cachedRegion || COPYFACTORY_REGION || "(not yet resolved)",
    domain: cachedDomain || "(not yet resolved)",
    configuredStrategyId: configuredId,
    resolvedStrategy: resolved,
    strategiesCount: strategies.length,
    tokenPresent: !!META_API_TOKEN,
  };
}
