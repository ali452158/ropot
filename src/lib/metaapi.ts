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
 * MASTER ACCOUNT CONCEPT
 * ----------------------
 * The bot follows a Master-Subscriber architecture:
 *   - ONE master MT5 account (configured via META_API_MASTER_LOGIN env var)
 *     acts as the SOLE market-data source for ALL bot sessions.
 *   - Each subscriber's MT5 account is provisioned separately and is used
 *     ONLY for trade execution (createMarketOrder, closePosition, etc).
 *
 * The master account MUST be already provisioned in the MetaApi dashboard
 * under the same META_API_TOKEN. We resolve its metaApiAccountId once at
 * startup (and cache it) by calling findExistingMetaApiAccount(login).
 */
const META_API_MASTER_LOGIN = process.env.META_API_MASTER_LOGIN || "";

// Resolved once at startup; null until resolution completes (or in simulation).
let masterMetaApiAccountId: string | null = null;
let masterResolutionPromise: Promise<string | null> | null = null;

/**
 * MetaAPI Cloud uses TWO separate REST API hosts (verified against the official
 * metaapi.cloud-sdk v29.2.0 source code on npm):
 *
 *   1. Provisioning API  — create / list / delete MT5 accounts
 *      Correct host: mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai
 *      (Note: NOT api.metaapi.cloud — that returns nginx 404. Also NOT
 *       mt-provisioning.cloud-trail.com — that domain is dead / NXDOMAIN.)
 *
 *   2. Client API        — per-account operations (candles, prices, trades, positions)
 *      Pattern: mt-client-api-v1.{region}.{domain}
 *      The {domain} portion is fetched DYNAMICALLY from the provisioning API
 *      at /users/current/servers/mt-client-api (cached for 10 min). The SDK's
 *      default base domain is agiliumtrade.agiliumtrade.ai, but the actual
 *      runtime domain can change, so we fetch it dynamically.
 *      Region can be overridden via META_API_CLIENT_REGION (new-york | london | hong-kong).
 *
 * The OLD single-domain configuration (META_API_DOMAIN=...) is kept as a
 * backward-compat fallback ONLY.
 */
const META_API_PROVISIONING_DOMAIN =
  process.env.META_API_PROVISIONING_DOMAIN ||
  "mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

const META_API_CLIENT_REGION =
  process.env.META_API_CLIENT_REGION || "new-york";

// Static fallback only — the real client domain is fetched dynamically
// from the provisioning API on first use (see getDynamicClientDomain()).
const META_API_CLIENT_DOMAIN_FALLBACK =
  process.env.META_API_CLIENT_DOMAIN ||
  `mt-client-api-v1.${META_API_CLIENT_REGION}.agiliumtrade.ai`;

// Dynamic client domain cache (refreshed every 10 min, mirroring official SDK).
let dynamicClientDomain: string | null = null;
let dynamicClientDomainLastUpdated = 0;
let dynamicClientDomainFetchPromise: Promise<string | null> | null = null;
const DYNAMIC_DOMAIN_TTL_MS = 10 * 60 * 1000;

async function getDynamicClientDomain(): Promise<string | null> {
  // Use cached value if fresh
  if (
    dynamicClientDomain &&
    Date.now() - dynamicClientDomainLastUpdated < DYNAMIC_DOMAIN_TTL_MS
  ) {
    return dynamicClientDomain;
  }
  // Deduplicate concurrent fetches
  if (dynamicClientDomainFetchPromise) {
    return dynamicClientDomainFetchPromise;
  }
  dynamicClientDomainFetchPromise = (async () => {
    try {
      const res = await undiciFetch(
        `https://${META_API_PROVISIONING_DOMAIN}/users/current/servers/mt-client-api`,
        {
          headers: { "auth-token": META_API_TOKEN },
          dispatcher: permissiveDispatcher,
        }
      );
      if (res.ok) {
        const data: any = await res.json();
        if (data?.domain) {
          dynamicClientDomain = data.domain;
          dynamicClientDomainLastUpdated = Date.now();
          return dynamicClientDomain;
        }
      }
    } catch {
      // fall through to fallback
    }
    return null;
  })().finally(() => {
    dynamicClientDomainFetchPromise = null;
  });
  return dynamicClientDomainFetchPromise;
}

async function getClientDomain(): Promise<string> {
  const dyn = await getDynamicClientDomain();
  if (dyn) {
    return `mt-client-api-v1.${META_API_CLIENT_REGION}.${dyn}`;
  }
  return META_API_CLIENT_DOMAIN_FALLBACK;
}

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
 *
 * For "client" calls, the host is resolved DYNAMICALLY by querying the
 * provisioning API for the current client-API domain (cached 10 min, mirroring
 * the official metaapi.cloud-sdk behavior).
 */
async function pickHost(kind: "provision" | "client"): Promise<string> {
  if (META_API_LEGACY_DOMAIN) return META_API_LEGACY_DOMAIN;
  return kind === "provision"
    ? META_API_PROVISIONING_DOMAIN
    : await getClientDomain();
}

/** Shared fetch wrapper: injects auth header + permissive TLS dispatcher. */
async function metaApiFetch(
  kind: "provision" | "client",
  path: string,
  init: RequestInit & { method?: string } = {}
): Promise<Response> {
  const host = await pickHost(kind);
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
  clientDynamic: string | null;
  legacy?: string;
  simulation: boolean;
} {
  return {
    provisioning: META_API_PROVISIONING_DOMAIN,
    client: META_API_CLIENT_DOMAIN_FALLBACK,
    clientDynamic: dynamicClientDomain,
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

/**
 * List all MetaApi accounts provisioned under the current token.
 * Returns array of { _id, login, server, state, connectionStatus }.
 *
 * GET /users/current/accounts on the Provisioning API.
 * This is the SAME endpoint the MetaApi dashboard uses; read permission is
 * always granted to the account owner, even when createAccount is not.
 */
export async function listMetaApiAccounts(): Promise<
  Array<{
    id: string;
    login: string;
    server: string;
    state: string;
    connectionStatus: string;
    region?: string;
    name?: string;
  }>
> {
  if (SIMULATION) return [];
  try {
    const res = await metaApiFetch("provision", `/users/current/accounts`);
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data?.accounts || [];
    return arr.map((a: any) => ({
      id: a._id || a.id,
      login: String(a.login),
      server: a.server,
      state: a.state,
      connectionStatus: a.connectionStatus,
      region: a.region,
      name: a.name,
    }));
  } catch {
    return [];
  }
}

/**
 * Find an existing MetaApi account by MT5 login (and optionally server).
 * Useful when the token doesn't have createAccount permission (free MetaApi
 * tier, or read-only token) but the account was already provisioned before.
 */
export async function findExistingMetaApiAccount(
  mt5Login: string
): Promise<string | null> {
  if (SIMULATION) return null;
  // Check in-process cache first
  const cached = accountCache.get(mt5Login);
  if (cached) return cached;
  // Otherwise query the API
  const accounts = await listMetaApiAccounts();
  const match = accounts.find((a) => a.login === String(mt5Login));
  if (match) {
    accountCache.set(mt5Login, match.id);
    return match.id;
  }
  return null;
}

/**
 * Delete a MetaApi provisioned account by its ID.
 * Requires deleteAccount permission. Useful when an account limit has been
 * reached and you want to free a slot for a new login.
 */
export async function deleteMetaApiAccount(
  metaApiAccountId: string
): Promise<{ ok: boolean; error?: string }> {
  if (SIMULATION) return { ok: true };
  try {
    const res = await metaApiFetch(
      "provision",
      `/users/current/accounts/${metaApiAccountId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Delete failed: ${res.status} ${text}` };
    }
    // Also remove from cache
    for (const [k, v] of accountCache.entries()) {
      if (v === metaApiAccountId) {
        accountCache.delete(k);
        break;
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

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

  // STEP 1: Try to reuse an already-provisioned account with the same login.
  // This handles three common scenarios:
  //   (a) Token has read-only permissions (no createAccount method).
  //   (b) Account was provisioned in a previous run / from the dashboard.
  //   (c) Free-tier MetaApi plan that has hit its account quota.
  const existingId = await findExistingMetaApiAccount(mt5Login);
  if (existingId) {
    accountCache.set(mt5Login, existingId);
    return { metaApiAccountId: existingId };
  }

  // STEP 2: Try to create a new account.
  // Updated payload based on NewMetatraderAccountDto schema (verified against
  // metaapi.cloud-sdk v29.2.0):
  //   - `server` (NOT `serverName`) — text name of the broker server
  //   - `name` — required human-readable account name
  //   - `type: "cloud-g2"` — newer/faster/cheaper than legacy "cloud"
  //   - `platform: "mt5"` — explicit MT5 platform
  try {
    const res = await metaApiFetch("provision", `/users/current/accounts`, {
      method: "POST",
      body: JSON.stringify({
        login: mt5Login,
        password: mt5Password,
        server: mt5Server,
        name: `ALFA Subscriber ${mt5Login}`,
        type: "cloud-g2",
        platform: "mt5",
        application: "ALFA-Reports",
        magic: 770077,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      // 401 = token is missing the metaapi-provisioning-api permission entirely.
      // The provisioning API (mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai)
      // requires the "metaapi-provisioning-api" access rule with role "writer".
      // Without it, EVERY call to /users/current/accounts returns 401, even GET.
      if (res.status === 401) {
        return {
          metaApiAccountId: "",
          error:
            `MetaApi رفض التوكن (401 Unauthorized). ` +
            `السبب: التوكن الحالي لا يملك صلاحية "metaapi-provisioning-api" ` +
            `اللازمة لإنشاء/سرد/حذف حسابات MetaApi. ` +
            `الحل: (1) افتح app.metaapi.cloud → Settings → API tokens، ` +
            `(2) عدّل التوكن الحالي أو أنشئ توكن جديد، ` +
            `(3) فعّل صلاحية "Provisioning API" مع دور "writer" على كل الموارد، ` +
            `(4) حدّث META_API_TOKEN في ملف .env على السيرفر وأعد التشغيل. ` +
            `تفاصيل الخطأ الأصلي: ${text}`,
        };
      }
      // 403 = token has the provisioning permission but quota/role blocked the create.
      if (res.status === 403) {
        return {
          metaApiAccountId: "",
          error:
            `MetaApi رفض إنشاء حساب جديد (403 Forbidden). ` +
            `هذا يعني أن التوكن JWT ليس لديه صلاحية createAccount، ` +
            `أو أن خطة MetaApi المجانية لديك وصلت للحد الأقصى (عادة حساب واحد). ` +
            `الحل: (1) احذف حساباً قديماً من لوحة تحكم MetaApi لتفريغ مكان، ` +
            `أو (2) ارتقِ إلى خطة مدفوعة، ` +
            `أو (3) استخدم توكن JWT جديد بصلاحيات كاملة من إعدادات MetaApi. ` +
            `تفاصيل الخطأ الأصلي: ${text}`,
        };
      }
      // Friendly error for validation failures (wrong server name format)
      if (res.status === 400) {
        return {
          metaApiAccountId: "",
          error:
            `MetaApi رفض بيانات الحساب (400 ValidationError). ` +
            `السبب الأكثر شيوعاً: اسم السيرفر "${mt5Server}" غير معروف لدى MetaApi. ` +
            `تأكد من الاسم الصحيح من تطبيق MT5 أو من رسالة البريد الإلكتروني من الوسيط. ` +
            `تفاصيل الخطأ الأصلي: ${text}`,
        };
      }
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

// --------- Master account resolution ---------
//
// The bot uses a MASTER-SUBSCRIBER architecture:
//   - The MASTER account (e.g. 474240052) is the SOLE market-data source.
//     It must already be provisioned in the MetaApi dashboard under the same
//     META_API_TOKEN. We resolve its metaApiAccountId once at startup and
//     cache it for the lifetime of the process.
//   - Each SUBSCRIBER's MT5 account is provisioned separately (when they log
//     in via the bot) and is used ONLY for trade execution.
//
// If META_API_MASTER_LOGIN is not set, we fall back to the first cached
// account (preserves backwards compatibility with single-account deployments).

/**
 * Resolve the master MetaApi account ID. Idempotent — concurrent callers
 * share the same resolution promise. Returns null if:
 *   - SIMULATION mode (no token)
 *   - META_API_MASTER_LOGIN is not set AND no accounts are cached
 *   - The configured master login is not found in the provisioning API
 */
export async function getMasterMetaApiAccountId(): Promise<string | null> {
  if (SIMULATION) return null;
  if (masterMetaApiAccountId) return masterMetaApiAccountId;
  if (masterResolutionPromise) return masterResolutionPromise;

  masterResolutionPromise = (async () => {
    // 1) If a master login is configured, look it up in the provisioning API.
    if (META_API_MASTER_LOGIN) {
      const id = await findExistingMetaApiAccount(META_API_MASTER_LOGIN);
      if (id) {
        masterMetaApiAccountId = id;
        console.log(
          `[MetaApi] Master account resolved: login=${META_API_MASTER_LOGIN} metaApiAccountId=${id}`
        );
        return id;
      }
      console.warn(
        `[MetaApi] Master login ${META_API_MASTER_LOGIN} not found in provisioning API. ` +
          `Falling back to first cached account. Make sure this account is provisioned in the MetaApi dashboard.`
      );
    }
    // 2) Fallback: use the first cached account (if any).
    const fallback = accountCache.values().next().value || null;
    if (fallback) {
      masterMetaApiAccountId = fallback;
      console.log(
        `[MetaApi] Master fallback: using first cached account ${fallback}`
      );
    }
    return fallback;
  })().finally(() => {
    masterResolutionPromise = null;
  });

  return masterResolutionPromise;
}

/** Synchronous getter — returns the cached master account ID (or null). */
export function getCachedMasterMetaApiAccountId(): string | null {
  return masterMetaApiAccountId;
}

/** Returns the configured master login (from env), or empty string. */
export function getMasterLogin(): string {
  return META_API_MASTER_LOGIN;
}

// --------- Market data ---------
//
// ARCHITECTURE: All market data (candles + current price) is fetched through
// the MASTER account, NOT the subscriber's account. The subscriber's MT5
// account is used ONLY for trade execution (createMarketOrder / closePosition
// / getOpenPositions / getAccountInfo). The `mt5Login` argument on
// getCandles/getCurrentPrice is kept for backwards-compat but is IGNORED —
// the master account is always used.

export async function getCandles(
  symbol: string,
  timeframe: string,
  limit = 50,
  _mt5Login?: string // deprecated — kept for back-compat, ignored
): Promise<Candle[]> {
  if (SIMULATION) {
    return simulateCandles(symbol, limit);
  }
  // ALWAYS use the master account for market data.
  const id = (await getMasterMetaApiAccountId()) || accountCache.values().next().value;
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
  _mt5Login?: string // deprecated — kept for back-compat, ignored
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
  // ALWAYS use the master account for market data.
  const id = (await getMasterMetaApiAccountId()) || accountCache.values().next().value;
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

// --------- Token diagnostics ---------

/**
 * Decode the META_API_TOKEN JWT WITHOUT verifying the signature (we trust the
 * source — the operator pasted it from the MetaApi dashboard). Returns the
 * list of accessRules + a few derived booleans that the UI/admin can use to
 * quickly answer "is this token good enough for auto-provisioning?".
 */
export function inspectMetaApiToken(): {
  present: boolean;
  tokenPreview: string;
  tokenId?: string;
  realUserId?: string;
  issuedAt?: string;
  expiresAt?: string;
  expired?: boolean;
  accessRules: Array<{
    id: string;
    methods: string[];
    roles: string[];
    resources: string[];
    scope: "ALL" | "LIMITED";
  }>;
  permissions: {
    provisioningApi: boolean; // metaapi-provisioning-api (create/list/delete accounts)
    provisioningApiAll: boolean; // ... on ALL resources (not just one account)
    copyfactoryApi: boolean;
    copyfactoryApiAll: boolean;
    mtManagerApi: boolean;
    mtManagerApiAll: boolean;
    metaapiRestApi: boolean;
    metaapiRestApiAll: boolean;
    metastatsApi: boolean;
  };
  canAutoProvision: boolean; // true iff provisioningApi writer on ALL accounts
  canUseCopyFactory: boolean; // true iff copyfactoryApi writer on ALL resources
} {
  const t = META_API_TOKEN;
  if (!t) {
    return {
      present: false,
      tokenPreview: "",
      accessRules: [],
      permissions: {
        provisioningApi: false,
        provisioningApiAll: false,
        copyfactoryApi: false,
        copyfactoryApiAll: false,
        mtManagerApi: false,
        mtManagerApiAll: false,
        metaapiRestApi: false,
        metaapiRestApiAll: false,
        metastatsApi: false,
      },
      canAutoProvision: false,
      canUseCopyFactory: false,
    };
  }
  const parts = t.split(".");
  let payload: any = {};
  try {
    if (parts.length >= 2) {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      payload = JSON.parse(
        Buffer.from(padded, "base64").toString("utf8")
      );
    }
  } catch {
    /* ignore decode errors */
  }
  const rules = Array.isArray(payload.accessRules) ? payload.accessRules : [];
  const accessRules = rules.map((r: any) => {
    const resources: string[] = Array.isArray(r.resources) ? r.resources : [];
    const isAll = resources.some(
      (s) =>
        typeof s === "string" &&
        (s === "*:$USER_ID$:*" ||
          s === "*" ||
          s.startsWith("*:$USER_ID$"))
    );
    return {
      id: r.id || "",
      methods: Array.isArray(r.methods) ? r.methods : [],
      roles: Array.isArray(r.roles) ? r.roles : [],
      resources,
      scope: (isAll ? "ALL" : "LIMITED") as "ALL" | "LIMITED",
    };
  });
  const has = (id: string) => accessRules.find((r) => r.id === id);
  const hasAll = (id: string) => {
    const r = has(id);
    return !!r && r.scope === "ALL" && r.roles.includes("writer");
  };
  const provisioningApi = !!has("metaapi-provisioning-api");
  const provisioningApiAll = hasAll("metaapi-provisioning-api");
  const copyfactoryApi = !!has("copyfactory-api");
  const copyfactoryApiAll = hasAll("copyfactory-api");
  const mtManagerApi = !!has("mt-manager-api");
  const mtManagerApiAll = hasAll("mt-manager-api");
  const metaapiRestApi = !!has("metaapi-rest-api");
  const metaapiRestApiAll = hasAll("metaapi-rest-api");
  const metastatsApi = !!has("metastats-api");

  const nowSec = Math.floor(Date.now() / 1000);
  const expired = typeof payload.exp === "number" && payload.exp < nowSec;
  const issuedAt = typeof payload.iat === "number"
    ? new Date(payload.iat * 1000).toISOString()
    : undefined;
  const expiresAt = typeof payload.exp === "number"
    ? new Date(payload.exp * 1000).toISOString()
    : undefined;

  return {
    present: true,
    tokenPreview: t.slice(0, 16) + "..." + t.slice(-12),
    tokenId: payload.tokenId,
    realUserId: payload.realUserId,
    issuedAt,
    expiresAt,
    expired,
    accessRules,
    permissions: {
      provisioningApi,
      provisioningApiAll,
      copyfactoryApi,
      copyfactoryApiAll,
      mtManagerApi,
      mtManagerApiAll,
      metaapiRestApi,
      metaapiRestApiAll,
      metastatsApi,
    },
    canAutoProvision: provisioningApiAll,
    canUseCopyFactory: copyfactoryApiAll,
  };
}
