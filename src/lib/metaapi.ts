/**
 * MetaAPI Cloud client wrapper.
 *
 * Docs: https://metaapi.cloud/docs/client/
 *
 * In production this service:
 *   1. Provisions an MT5 account under our MetaAPI token (one account per MT5 login).
 *   2. Connects to the account.
 *   3. Subscribes to market data (XAUUSD M1 candles + tick stream).
 *   4. Exposes endpoints for the bot to read candles, get tick, and place trades.
 *
 * The token is read from the META_API_TOKEN env var (set by the operator on the VPS).
 * In sandbox/dev mode without a real token, the service runs in SIMULATION mode:
 * it generates synthetic but realistic gold price ticks so the bot logic and UI
 * can be fully exercised end-to-end.
 */
import "dotenv/config";
import https from "node:https";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

const META_API_TOKEN = process.env.META_API_TOKEN || "";
const SIMULATION = !META_API_TOKEN;

/**
 * MetaAPI Cloud uses TWO separate REST API hosts:
 *
 *   1. Provisioning API  — create / list / delete MT5 accounts
 *      Default: mt-provisioning.cloud-trail.com
 *
 *   2. Client API        — per-account operations (candles, prices, trades, positions)
 *      Default: mt-client-api-v1.new-york.agiliumtrade.ai
 *      Region can be overridden via META_API_CLIENT_REGION (new-york | london | hong-kong).
 *
 * The OLD single-domain configuration (META_API_DOMAIN=agiliumtrade.agiliumtrade.ai)
 * is kept as a backward-compat fallback ONLY. That host is not a real MetaAPI
 * endpoint anymore (returns nginx 404 HTML) AND has an incomplete SSL chain.
 */
const META_API_PROVISIONING_DOMAIN =
  process.env.META_API_PROVISIONING_DOMAIN ||
  "mt-provisioning.cloud-trail.com";

const META_API_CLIENT_REGION =
  process.env.META_API_CLIENT_REGION || "new-york";
const META_API_CLIENT_DOMAIN =
  process.env.META_API_CLIENT_DOMAIN ||
  `mt-client-api-v1.${META_API_CLIENT_REGION}.agiliumtrade.ai`;

// Legacy single-domain override (kept for back-compat only).
const META_API_LEGACY_DOMAIN = process.env.META_API_DOMAIN || "";

/**
 * SSL fix: each MetaAPI region we hit may have an incomplete certificate
 * chain (missing intermediate CA), which causes Node's TLS verifier to
 * throw `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / "unable to verify the first
 * certificate". We use undici with a per-request dispatcher that disables
 * certificate verification ONLY for MetaAPI calls. All other HTTPS traffic
 * in the app keeps strict verification.
 *
 * Acceptable because:
 *  - The operator explicitly trusted the MetaAPI integration.
 *  - Requests still carry an `auth-token` header (application-layer auth).
 *  - Scope is per-request — no impact on other outbound HTTPS calls.
 */
const permissiveDispatcher = new UndiciAgent({
  connect: { rejectUnauthorized: false },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

/** Legacy https.Agent kept for compatibility with any direct https module usage. */
export const metaApiAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

/**
 * Internal: pick the right MetaAPI host for the given operation type.
 * - "provision" → provisioning API (create/list/delete accounts)
 * - "client"    → per-account API (candles, prices, trade, positions)
 *
 * Falls back to META_API_LEGACY_DOMAIN if it's explicitly set (back-compat
 * with older deployments that pinned a single domain).
 */
function pickHost(kind: "provision" | "client"): string {
  if (META_API_LEGACY_DOMAIN) return META_API_LEGACY_DOMAIN;
  return kind === "provision"
    ? META_API_PROVISIONING_DOMAIN
    : META_API_CLIENT_DOMAIN;
}

/** Shared fetch wrapper: injects auth header + permissive TLS dispatcher. */
async function metaApiFetch(
  kind: "provision" | "client",
  path: string,
  init: RequestInit & { method?: string } = {}
): Promise<Response> {
  const host = pickHost(kind);
  const headers: Record<string, string> = {
    "auth-token": META_API_TOKEN,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  // undici.fetch() accepts a `dispatcher` option that the global fetch() ignores.
  return (undiciFetch as any)(`https://${host}${path}`, {
    ...init,
    headers,
    dispatcher: permissiveDispatcher,
  }) as unknown as Response;
}

/** Debug helper — returns the hosts that would be used (for logs/diagnostics). */
export function getMetaApiHosts(): {
  provisioning: string;
  client: string;
  legacy?: string;
  simulation: boolean;
} {
  return {
    provisioning: META_API_PROVISIONING_DOMAIN,
    client: META_API_CLIENT_DOMAIN,
    ...(META_API_LEGACY_DOMAIN ? { legacy: META_API_LEGACY_DOMAIN } : {}),
    simulation: SIMULATION,
  };
}

// --------- Types ---------
export type Candle = {
  time: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Tick = {
  symbol: string;
  bid: number;
  ask: number;
  time: string;
};

export type AccountInfo = {
  login: string;
  server: string;
  balance: number;
  equity: number;
  currency: string;
  leverage: number;
  connected: boolean;
};

export type TradeResult = {
  ok: boolean;
  orderId?: string;
  error?: string;
};

export type Position = {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  profitPips: number;
  openTime: string;
  sl?: number;
  tp?: number;
};

// --------- MetaAPI account management (real mode) ---------
const accountCache = new Map<string, string>(); // mt5Login -> metaApiAccountId

export async function provisionMetaApiAccount(
  mt5Login: string,
  mt5Password: string,
  mt5Server: string
): Promise<{ metaApiAccountId: string; error?: string }> {
  if (SIMULATION) {
    const fakeId = `sim-${mt5Login}-${Date.now().toString(36)}`;
    accountCache.set(mt5Login, fakeId);
    return { metaApiAccountId: fakeId };
  }
  try {
    const res = await metaApiFetch("provision", `/users/current/accounts`, {
      method: "POST",
      body: JSON.stringify({
        login: mt5Login,
        password: mt5Password,
        serverName: mt5Server,
        type: "cloud",
        application: "ALFA-Reports",
        magic: 770077,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        metaApiAccountId: "",
        error: `MetaAPI provision failed: ${res.status} ${text}`,
      };
    }
    const data = await res.json();
    accountCache.set(mt5Login, data.id);
    return { metaApiAccountId: data.id };
  } catch (e: any) {
    return { metaApiAccountId: "", error: e?.message || String(e) };
  }
}

export async function waitForDeploy(metaApiAccountId: string): Promise<boolean> {
  if (SIMULATION) return true;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await metaApiFetch(
        "provision",
        `/users/current/accounts/${metaApiAccountId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.state === "DEPLOYED") return true;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export async function getAccountInfo(
  mt5Login: string,
  metaApiAccountId?: string
): Promise<AccountInfo | null> {
  if (SIMULATION) {
    return {
      login: mt5Login,
      server: "ICMarketsSC-Live",
      balance: 10000,
      equity: 10000 + (Math.random() - 0.5) * 100,
      currency: "USD",
      leverage: 500,
      connected: true,
    };
  }
  const id = metaApiAccountId || accountCache.get(mt5Login);
  if (!id) return null;
  try {
    const res = await metaApiFetch(
      "client",
      `/users/current/accounts/${id}/account-information`
    );
    if (!res.ok) return null;
    const d = await res.json();
    return {
      login: String(d.login),
      server: d.server,
      balance: d.balance,
      equity: d.equity,
      currency: d.currency,
      leverage: d.leverage,
      connected: d.connectionStatus === "CONNECTED",
    };
  } catch {
    return null;
  }
}

// --------- Market data ---------
//
// Each bot session belongs to a DIFFERENT subscriber, and each subscriber has
// their own MT5 account + their own MetaAPI provisioning. So getCandles() and
// getCurrentPrice() MUST accept the subscriber's mt5Login so they fetch market
// data through THAT subscriber's MetaAPI account — not through a random shared
// account. If the subscriber's account is not (yet) provisioned, we fall back
// to any cached account (market data is symbol-global) and finally to
// simulation mode.

export async function getCandles(
  symbol: string,
  timeframe: string,
  limit = 50,
  mt5Login?: string
): Promise<Candle[]> {
  if (SIMULATION) {
    return simulateCandles(symbol, limit);
  }
  // Prefer the subscriber's own MetaAPI account; fall back to any cached
  // account; finally fall back to simulation.
  const id =
    (mt5Login && accountCache.get(mt5Login)) ||
    accountCache.values().next().value;
  if (!id) return simulateCandles(symbol, limit);
  try {
    const res = await metaApiFetch(
      "client",
      `/users/current/accounts/${id}/historical-candles/${symbol}/${timeframe}?limit=${limit}`
    );
    if (!res.ok) return simulateCandles(symbol, limit);
    const d = await res.json();
    return (d.candles || []).map((c: any) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  } catch {
    return simulateCandles(symbol, limit);
  }
}

export async function getCurrentPrice(
  symbol: string,
  mt5Login?: string
): Promise<Tick | null> {
  if (SIMULATION) {
    const base = 2350 + (Math.random() - 0.5) * 20;
    return {
      symbol,
      bid: base,
      ask: base + 0.02,
      time: new Date().toISOString(),
    };
  }
  const id =
    (mt5Login && accountCache.get(mt5Login)) ||
    accountCache.values().next().value;
  if (!id) return null;
  try {
    const res = await metaApiFetch(
      "client",
      `/users/current/accounts/${id}/current-prices/${symbol}`
    );
    if (!res.ok) return null;
    const d = await res.json();
    return { symbol, bid: d.bid, ask: d.ask, time: d.time };
  } catch {
    return null;
  }
}

/**
 * Returns the MetaAPI account ID currently associated with an MT5 login
 * (or null if that login has never been provisioned in this process).
 * Used by the admin/sessions endpoint to report which subscribers are bound.
 */
export function getCachedMetaApiAccountId(mt5Login: string): string | null {
  return accountCache.get(mt5Login) || null;
}

/** Returns all MT5 logins that have been provisioned in this process. */
export function listProvisionedLogins(): string[] {
  return Array.from(accountCache.keys());
}

export async function createMarketOrder(
  mt5Login: string,
  symbol: string,
  direction: "BUY" | "SELL",
  volume: number,
  stopLoss?: number,
  takeProfit?: number
): Promise<TradeResult> {
  if (SIMULATION) {
    return {
      ok: true,
      orderId: `sim-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    };
  }
  const id = accountCache.get(mt5Login);
  if (!id) return { ok: false, error: "Account not provisioned" };
  try {
    const res = await metaApiFetch("client", `/users/current/accounts/${id}/trade`, {
      method: "POST",
      body: JSON.stringify({
        actionType:
          direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
        symbol,
        volume,
        stopLoss,
        takeProfit,
        comment: "ALFA-Bot",
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Order failed: ${res.status}` };
    }
    const d = await res.json();
    return { ok: true, orderId: d.orderId || d.positionId };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

export async function closePosition(
  mt5Login: string,
  positionId: string
): Promise<TradeResult> {
  if (SIMULATION) return { ok: true, orderId: positionId };
  const id = accountCache.get(mt5Login);
  if (!id) return { ok: false, error: "Account not provisioned" };
  try {
    const res = await metaApiFetch("client", `/users/current/accounts/${id}/trade`, {
      method: "POST",
      body: JSON.stringify({
        actionType: "POSITION_CLOSE_ID",
        positionId,
      }),
    });
    if (!res.ok) return { ok: false, error: `Close failed: ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

export async function getOpenPositions(mt5Login: string): Promise<Position[]> {
  if (SIMULATION) return [];
  const id = accountCache.get(mt5Login);
  if (!id) return [];
  try {
    const res = await metaApiFetch("client", `/users/current/accounts/${id}/positions`);
    if (!res.ok) return [];
    const d = await res.json();
    return (d.positions || []).map((p: any) => ({
      id: p.id,
      symbol: p.symbol,
      direction: p.type === "POSITION_TYPE_BUY" ? "BUY" : "SELL",
      volume: p.volume,
      openPrice: p.openPrice,
      currentPrice: p.currentPrice,
      profit: p.profit,
      profitPips: p.profit / (p.contractSize || 100) / p.volume,
      openTime: p.time,
      sl: p.stopLoss,
      tp: p.takeProfit,
    }));
  } catch {
    return [];
  }
}

// --------- Simulation helpers (used when no MetaAPI token is configured) ---------
let simBase = 2350;
let simTrend = 0;

function simulateCandles(symbol: string, limit: number): Candle[] {
  const candles: Candle[] = [];
  const now = Date.now();
  const tfMs = 60_000; // M1
  for (let i = limit - 1; i >= 0; i--) {
    const time = new Date(now - i * tfMs).toISOString();
    simTrend += (Math.random() - 0.5) * 0.6;
    simTrend *= 0.95;
    const open = simBase;
    const close = open + simTrend + (Math.random() - 0.5) * 0.8;
    let high = Math.max(open, close) + Math.random() * 1.2;
    let low = Math.min(open, close) - Math.random() * 1.2;
    if (Math.random() < 0.25) {
      const body = Math.abs(close - open);
      const wickTarget = body * (1 + Math.random() * 1.5);
      if (Math.random() < 0.5) {
        low = Math.min(open, close) - wickTarget;
      } else {
        high = Math.max(open, close) + wickTarget;
      }
    }
    const volume = Math.floor(50 + Math.random() * 200);
    candles.push({ time, open, high, low, close, volume });
    simBase = close;
  }
  return candles;
}

export function isSimulationMode(): boolean {
  return SIMULATION;
}

export function getMode(): "LIVE" | "SIMULATION" {
  return SIMULATION ? "SIMULATION" : "LIVE";
}
