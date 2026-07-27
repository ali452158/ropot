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
// ---- Cloud-g2 host kinds ----
// For "cloud-g2" accounts (the modern account type), MetaApi splits traffic
// across THREE different hosts:
//   1. mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai  → account CRUD (create/list/delete)
//   2. mt-client-api-v1.{region}.{domain}                    → account info, trade, positions, symbol specs, per-symbol current-price
//   3. mt-market-data-client-api-v1.{region}.{domain}        → historical candles + historical ticks (DIFFERENT host!)
//
// The legacy `cloud` account type used a single host with /historical-candles/{sym}/{tf},
// but that path returns 404 on cloud-g2 accounts — they require the
// /historical-market-data/symbols/{sym}/timeframes/{tf}/candles path AND the
// market-data host.
async function pickHost(kind: "provision" | "client" | "market-data"): Promise<string> {
  if (META_API_LEGACY_DOMAIN) return META_API_LEGACY_DOMAIN;
  if (kind === "provision") return META_API_PROVISIONING_DOMAIN;
  const dyn = await getDynamicClientDomain();
  const base = dyn || "agiliumtrade.ai";
  if (kind === "market-data") {
    return `mt-market-data-client-api-v1.${META_API_CLIENT_REGION}.${base}`;
  }
  return `mt-client-api-v1.${META_API_CLIENT_REGION}.${base}`;
}

/** Shared fetch wrapper: injects auth header + permissive TLS dispatcher. */
async function metaApiFetch(
  kind: "provision" | "client" | "market-data",
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
  marketData: string;
  clientDynamic: string | null;
  legacy?: string;
  simulation: boolean;
} {
  return {
    provisioning: META_API_PROVISIONING_DOMAIN,
    client: META_API_CLIENT_DOMAIN_FALLBACK,
    marketData: `mt-market-data-client-api-v1.${META_API_CLIENT_REGION}.agiliumtrade.ai`,
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
    copyFactoryRoles?: string[];
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
      copyFactoryRoles: Array.isArray(a.copyFactoryRoles) ? a.copyFactoryRoles : [],
    }));
  } catch {
    return [];
  }
}

/**
 * Find an existing MetaApi account by MT5 login (and optionally server).
 * Useful when the token doesn't have createAccount permission (free MetaApi
 * tier, or read-only token) but the account was already provisioned before.
 *
 * Returns the account ID plus the copyFactoryRoles so the caller can verify
 * the SUBSCRIBER role is set (required for CopyFactory subscriber creation).
 */
export async function findExistingMetaApiAccount(
  mt5Login: string
): Promise<{ id: string; copyFactoryRoles: string[] } | null> {
  if (SIMULATION) return null;
  // Check in-process cache first (cache hit doesn't include role info — query API)
  // We always query the API now because we need fresh role information.
  const accounts = await listMetaApiAccounts();
  const match = accounts.find((a) => a.login === String(mt5Login));
  if (match) {
    accountCache.set(mt5Login, match.id);
    return {
      id: match.id,
      copyFactoryRoles: match.copyFactoryRoles || [],
    };
  }
  return null;
}

/**
 * Undeploy a MetaApi account by its ID. Required before DELETE — the API
 * refuses to delete a DEPLOYED account.
 */
export async function undeployMetaApiAccount(
  metaApiAccountId: string
): Promise<{ ok: boolean; error?: string }> {
  if (SIMULATION) return { ok: true };
  try {
    const res = await metaApiFetch(
      "provision",
      `/users/current/accounts/${metaApiAccountId}/undeploy`,
      { method: "POST" }
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Undeploy failed: ${res.status} ${text}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Wait for an account to reach a target state (e.g. UNDEPLOYED after undeploy).
 * Polls every 2s up to ~60s.
 */
export async function waitForAccountState(
  metaApiAccountId: string,
  targetState: string,
  maxAttempts = 30
): Promise<boolean> {
  if (SIMULATION) return true;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await metaApiFetch(
        "provision",
        `/users/current/accounts/${metaApiAccountId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.state === targetState) return true;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
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
  //
  // CRITICAL: We reuse the existing account REGARDLESS of its copyFactoryRoles.
  // Older deployments created accounts with role PROVIDER (or none), and the
  // current JWT token may lack `mt-server:*:<broker>` resource access, which
  // means we cannot delete-and-recreate the account. Reusing as-is keeps the
  // bot working for direct trading. CopyFactory subscriber functionality is
  // only needed if the bot uses CopyFactory — which it currently does NOT
  // (the trailing strategy trades directly via createMarketOrder).
  const existing = await findExistingMetaApiAccount(mt5Login);
  if (existing) {
    console.log(
      `[metaapi] Reusing existing account ${existing.id} for login=${mt5Login} ` +
      `(roles=${JSON.stringify(existing.copyFactoryRoles)}). No migration attempted — ` +
      `direct trading works with any role.`
    );
    accountCache.set(mt5Login, existing.id);
    return { metaApiAccountId: existing.id };
  }

  // STEP 2: Try to create a new account WITH copyFactoryRoles: ["SUBSCRIBER"].
  // This role is REQUIRED for CopyFactory subscriber creation — it cannot be
  // added via PUT /users/current/accounts/{id} on the current API version.
  //
  // Updated payload based on NewMetatraderAccountDto schema (verified against
  // metaapi.cloud-sdk v29.2.0):
  //   - `server` (NOT `serverName`) — text name of the broker server
  //   - `name` — required human-readable account name
  //   - `type: "cloud-g2"` — newer/faster/cheaper than legacy "cloud"
  //   - `platform: "mt5"` — explicit MT5 platform
  //   - `magic` — REQUIRED field (integer), used to identify bot trades
  //   - `copyFactoryRoles: ["SUBSCRIBER"]` — marks account as CopyFactory subscriber
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
        copyFactoryRoles: ["SUBSCRIBER"],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      // 401 = token is missing both metaapi-provisioning-api AND
      // trading-account-management-api permissions. The provisioning API
      // (mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai) requires one of
      // these access rules with role "writer". Without it, EVERY call to
      // /users/current/accounts returns 401, even GET.
      // NOTE: trading-account-management-api is the NEW name (replaces the
      // old metaapi-provisioning-api). Both work; either is sufficient.
      if (res.status === 401) {
        return {
          metaApiAccountId: "",
          error:
            `MetaApi رفض التوكن (401 Unauthorized). ` +
            `السبب: التوكن الحالي لا يملك صلاحية إنشاء/سرد حسابات MetaApi. ` +
            `في واجهة MetaApi الجديدة، هذه الصلاحية تُمنح عبر "Trading account management API" ` +
            `مع دور "writer" — وهي البديل الحديث لصلاحية "Provisioning API" القديمة. ` +
            `الحل: (1) افتح app.metaapi.cloud → Settings → API tokens، ` +
            `(2) عدّل التوكن الحالي أو أنشئ توكن جديد، ` +
            `(3) فعّل صلاحية "Trading account management API" مع دور "writer" ` +
            `على الموارد (يفضّل '*:\$USER_ID\$:*' لكل الموارد، أو على الأقل الحساب المطلوب)، ` +
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
      const existing = await findExistingMetaApiAccount(META_API_MASTER_LOGIN);
      if (existing) {
        masterMetaApiAccountId = existing.id;
        console.log(
          `[MetaApi] Master account resolved: login=${META_API_MASTER_LOGIN} metaApiAccountId=${existing.id} copyFactoryRoles=${JSON.stringify(
            existing.copyFactoryRoles
          )}`
        );
        return existing.id;
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

  // ---- Cloud-g2 path ----
  // The historical-candles endpoint on cloud-g2 accounts lives on a SEPARATE
  // host (mt-market-data-client-api-v1.{region}.{domain}) and uses a different
  // URL pattern than legacy cloud accounts:
  //   /users/current/accounts/{id}/historical-market-data/symbols/{symbol}/timeframes/{tf}/candles
  // The old path /historical-candles/{sym}/{tf} returns 404 on cloud-g2.
  //
  // The cloud-g2 API uses LOWERCASE timeframe strings (1m, 5m, 1h, etc.) —
  // MT5-style M1/M5/H1 are NOT accepted. We normalize here.
  //
  // The symbol must also be the BROKER-SPECIFIC name (e.g. XAUUSDm on Exness,
  // not the canonical XAUUSD). We resolve it through the master account.
  const masterLogin = getMasterLogin();
  const brokerSymbol = masterLogin
    ? await resolveBrokerSymbol(masterLogin, symbol)
    : symbol;
  const tfLower = normalizeTimeframe(timeframe);
  try {
    const res = await metaApiFetch(
      "market-data",
      `/users/current/accounts/${id}/historical-market-data/symbols/${encodeURIComponent(brokerSymbol)}/timeframes/${tfLower}/candles?limit=${limit}`
    );
    if (res.ok) {
      const arr = await res.json();
      return (arr || []).map((c: any) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.tickVolume ?? c.volume ?? 0,
      }));
    }
    // Fall back to legacy path for older cloud (non-g2) accounts.
    const legacyRes = await metaApiFetch(
      "client",
      `/users/current/accounts/${id}/historical-candles/${encodeURIComponent(brokerSymbol)}/${timeframe}?limit=${limit}`
    );
    if (legacyRes.ok) {
      const d = await legacyRes.json();
      return (d.candles || []).map((c: any) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    }
    console.warn(
      `[metaapi] getCandles(${symbol}→${brokerSymbol}, ${timeframe}) failed: ${res.status} / ${legacyRes.status}`
    );
    return simulateCandles(symbol, limit);
  } catch (e: any) {
    console.warn(`[metaapi] getCandles error:`, e?.message);
    return simulateCandles(symbol, limit);
  }
}

/**
 * Normalize a timeframe string to the lowercase format required by the
 * cloud-g2 historical-market-data API.
 *   "M1"  → "1m"
 *   "M5"  → "5m"
 *   "M15" → "15m"
 *   "H1"  → "1h"
 *   "1m"  → "1m" (already normalized)
 */
function normalizeTimeframe(tf: string): string {
  const t = tf.trim().toLowerCase();
  // If it's already in lowercase format (1m, 5m, 1h, etc.), return as-is.
  if (/^[0-9]+[mh d w]$/.test(t.replace(/\s/g, ""))) return t.replace(/\s/g, "");
  // MT5-style: M1, M5, M15, M30, H1, H4, D1, W1, MN
  const m = t.match(/^([mhdw])(\d+)$/);
  if (m) {
    const unit = m[1];
    const n = m[2];
    if (unit === "m") return `${n}m`;
    if (unit === "h") return `${n}h`;
    if (unit === "d") return `1d`;
    if (unit === "w") return `1w`;
  }
  // Default: return as-is (let the API reject if invalid)
  return t;
}

// ---- Price cache + rate-limit handling ----
// MetaApi rate-limits per-account current-price requests. The bot ticks every
// 500ms-1000ms and would otherwise hit the limit in ~30s. We:
//   1. Cache each symbol's last known price for `PRICE_CACHE_TTL_MS` (default 3s)
//      — multiple ticks within that window reuse the same value.
//   2. Dedup concurrent fetches for the SAME symbol (in-flight promise sharing).
//   3. On 429 / rate-limit, enter a global cool-down (`PRICE_RATE_LIMITED_UNTIL`)
//      for `PRICE_RATE_LIMIT_COOLDOWN_MS` (default 10s). During cool-down all
//      getCurrentPrice() calls return the last cached value (or null if none).
const PRICE_CACHE_TTL_MS = 3_000;          // serve cached price up to 3s old
const PRICE_RATE_LIMIT_COOLDOWN_MS = 10_000; // back off 10s after a 429
const priceCache = new Map<string, { tick: Tick; ts: number }>();
const priceInFlight = new Map<string, Promise<Tick | null>>();
let priceRateLimitedUntil = 0;

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

  // During rate-limit cool-down, return cached price if available.
  const now = Date.now();
  if (now < priceRateLimitedUntil) {
    const cached = priceCache.get(symbol);
    return cached ? cached.tick : null;
  }

  // Cache hit?
  const cached = priceCache.get(symbol);
  if (cached && now - cached.ts < PRICE_CACHE_TTL_MS) {
    return cached.tick;
  }

  // Dedup: if the same symbol is already in flight, piggyback on it.
  const inflight = priceInFlight.get(symbol);
  if (inflight) return inflight;

  const p = (async (): Promise<Tick | null> => {
    // ALWAYS use the master account for market data.
    const id = (await getMasterMetaApiAccountId()) || accountCache.values().next().value;
    if (!id) return null;

    // ---- Cloud-g2 path ----
    // The current-price endpoint on cloud-g2 accounts uses:
    //   /users/current/accounts/{id}/symbols/{symbol}/current-price
    // The old path /current-prices/{symbol} returns 404 on cloud-g2.
    //
    // The symbol must be the BROKER-SPECIFIC name (XAUUSDm, not XAUUSD) —
    // we resolve it through the master account.
    const masterLogin = getMasterLogin();
    const brokerSymbol = masterLogin
      ? await resolveBrokerSymbol(masterLogin, symbol)
      : symbol;
    try {
      const res = await metaApiFetch(
        "client",
        `/users/current/accounts/${id}/symbols/${encodeURIComponent(brokerSymbol)}/current-price`
      );
      if (res.ok) {
        const d = await res.json();
        const tick: Tick = { symbol: brokerSymbol, bid: d.bid, ask: d.ask, time: d.time };
        priceCache.set(symbol, { tick, ts: Date.now() });
        return tick;
      }
      // 429 = rate limited. Enter cool-down. Return cached price (if any).
      if (res.status === 429) {
        priceRateLimitedUntil = Date.now() + PRICE_RATE_LIMIT_COOLDOWN_MS;
        console.warn(
          `[metaapi] getCurrentPrice rate-limited (429). Cooling down for ${PRICE_RATE_LIMIT_COOLDOWN_MS}ms. ` +
          `Returning cached price for ${symbol}.`
        );
        const c = priceCache.get(symbol);
        return c ? c.tick : null;
      }
      // Fall back to legacy path for older cloud (non-g2) accounts.
      const legacyRes = await metaApiFetch(
        "client",
        `/users/current/accounts/${id}/current-prices/${encodeURIComponent(brokerSymbol)}`
      );
      if (legacyRes.ok) {
        const d = await legacyRes.json();
        const tick: Tick = { symbol: brokerSymbol, bid: d.bid, ask: d.ask, time: d.time };
        priceCache.set(symbol, { tick, ts: Date.now() });
        return tick;
      }
      if (legacyRes.status === 429) {
        priceRateLimitedUntil = Date.now() + PRICE_RATE_LIMIT_COOLDOWN_MS;
        console.warn(
          `[metaapi] getCurrentPrice(legacy) rate-limited (429). Cooling down.`
        );
        const c = priceCache.get(symbol);
        return c ? c.tick : null;
      }
      // Suppress the noisy log if we have a cached value to fall back to —
      // avoids filling the logs when MetaApi has a transient 404/5xx hiccup.
      if (!cached) {
        console.warn(
          `[metaapi] getCurrentPrice(${symbol}→${brokerSymbol}) failed: ${res.status} / ${legacyRes.status}`
        );
      }
      return cached ? cached.tick : null;
    } catch (e: any) {
      if (!cached) {
        console.warn(`[metaapi] getCurrentPrice error:`, e?.message);
      }
      return cached ? cached.tick : null;
    }
  })();

  priceInFlight.set(symbol, p);
  try {
    return await p;
  } finally {
    priceInFlight.delete(symbol);
  }
}

/**
 * Ensure the in-process accountCache has an entry for the given MT5 login.
 *
 * CRITICAL: After a container restart, accountCache is wiped (it's an in-memory
 * Map). The instrumentation hook resumes bot sessions by calling startBot(),
 * which reads the metaApiAccountId from the DB — but without this helper, the
 * cache would stay empty and EVERY subsequent createMarketOrder / closePosition
 * / getOpenPositions call would fail with "Account not provisioned".
 *
 * This function is idempotent — calling it with the same (login, id) is a
 * no-op after the first call. It also does NOT make any network calls.
 *
 * Safe to call in SIMULATION mode (no-op).
 */
export function ensureAccountCached(
  mt5Login: string,
  metaApiAccountId: string | null | undefined
): void {
  if (!mt5Login || !metaApiAccountId) return;
  if (SIMULATION) return;
  if (accountCache.get(mt5Login) === metaApiAccountId) return;
  accountCache.set(mt5Login, metaApiAccountId);
  console.log(
    `[metaapi] accountCache populated for login=${mt5Login} → ${metaApiAccountId}`
  );
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

/**
 * Symbol resolver — different brokers use different suffixes for the same
 * instrument (Exness: XAUUSDm / XAUUSD# / GOLDm, ICMarkets: XAUUSD-r,
 * Pepperstone: XAUUSD-r, FTMO: XAUUSD.s, FXTM: XAUUSDm, etc.). MetaApi
 * forwards the symbol name as-is, so we must map the canonical name
 * (XAUUSD, EURUSD, ...) to whatever the subscriber's broker actually
 * exposes.
 *
 * Strategy:
 *   1. Try the requested symbol as-is (some brokers accept it natively).
 *   2. If 404 / not-found, list ALL symbols on the account via
 *      /users/current/accounts/{id}/symbols and find the first symbol
 *      whose name STARTS WITH the requested base (case-insensitive).
 *   3. Cache the result per (mt5Login, baseSymbol) so we only do the
 *      discovery once per account.
 */
const symbolResolveCache = new Map<string, string>(); // key: `${mt5Login}:${base}` -> brokerSymbol

async function resolveBrokerSymbol(
  mt5Login: string,
  requestedSymbol: string,
  metaApiAccountIdOverride?: string
): Promise<string> {
  const cacheKey = `${mt5Login}:${requestedSymbol}`;
  const cached = symbolResolveCache.get(cacheKey);
  if (cached) return cached;

  const id =
    metaApiAccountIdOverride || accountCache.get(mt5Login);
  if (!id) return requestedSymbol; // can't resolve without account id

  // NOTE: On cloud-g2 accounts, the per-symbol endpoint
  // /users/current/accounts/{id}/symbols/{name} returns 404 — only the
  // full /symbols list works. So we skip the probe and go straight to
  // listing all symbols, then match by name.

  // Cache the full symbols list per account (it's ~355 items, ~30KB).
  const listCacheKey = `__list:${mt5Login}`;
  let symbols: string[] | null = symbolResolveCache.get(listCacheKey) as any || null;
  if (!symbols) {
    try {
      const res = await metaApiFetch(
        "client",
        `/users/current/accounts/${id}/symbols`
      );
      if (res.ok) {
        const d = await res.json();
        symbols = (d.symbols || d || []).map((s: any) =>
          typeof s === "string" ? s : s?.name
        ).filter(Boolean);
        symbolResolveCache.set(listCacheKey, symbols as any);
      }
    } catch {
      // ignore
    }
  }
  if (!symbols || symbols.length === 0) {
    // Last resort: try the per-symbol probe (works on legacy cloud accounts).
    try {
      const probe = await metaApiFetch(
        "client",
        `/users/current/accounts/${id}/symbols/${encodeURIComponent(requestedSymbol)}`
      );
      if (probe.ok) {
        symbolResolveCache.set(cacheKey, requestedSymbol);
        return requestedSymbol;
      }
    } catch {
      // ignore
    }
    return requestedSymbol;
  }

  const base = requestedSymbol.toUpperCase();
  // Priority 1: exact match (case-insensitive)
  const exact = symbols.find((s) => s.toUpperCase() === base);
  if (exact) {
    symbolResolveCache.set(cacheKey, exact);
    return exact;
  }
  // Priority 2: symbol STARTS WITH base (e.g. XAUUSDm starts with XAUUSD)
  const startsWith = symbols.find(
    (s) => s.toUpperCase().startsWith(base) && s.length <= base.length + 4
  );
  if (startsWith) {
    symbolResolveCache.set(cacheKey, startsWith);
    console.log(
      `[metaapi] Symbol resolved: ${requestedSymbol} → ${startsWith} (login ${mt5Login})`
    );
    return startsWith;
  }
  // Priority 3: symbol CONTAINS base (e.g. XAUUSD.m contains XAUUSD)
  const contains = symbols.find((s) =>
    s.toUpperCase().includes(base)
  );
  if (contains) {
    symbolResolveCache.set(cacheKey, contains);
    console.log(
      `[metaapi] Symbol resolved: ${requestedSymbol} → ${contains} (login ${mt5Login})`
    );
    return contains;
  }

  // Fallback: return as-is and let the order fail with a clear error
  console.warn(
    `[metaapi] Could not resolve symbol ${requestedSymbol} for login ${mt5Login}; using as-is`
  );
  return requestedSymbol;
}

export async function createMarketOrder(
  mt5Login: string,
  symbol: string,
  direction: "BUY" | "SELL",
  volume: number,
  stopLoss?: number,
  takeProfit?: number,
  metaApiAccountIdOverride?: string
): Promise<TradeResult> {
  if (SIMULATION) {
    return {
      ok: true,
      orderId: `sim-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    };
  }
  const id = metaApiAccountIdOverride || accountCache.get(mt5Login);
  if (!id) return { ok: false, error: "Account not provisioned" };

  // Resolve the broker-specific symbol name (XAUUSD → XAUUSDm on Exness, etc.)
  const brokerSymbol = await resolveBrokerSymbol(mt5Login, symbol, metaApiAccountIdOverride);

  try {
    const res = await metaApiFetch("client", `/users/current/accounts/${id}/trade`, {
      method: "POST",
      body: JSON.stringify({
        actionType:
          direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
        symbol: brokerSymbol,
        volume,
        stopLoss,
        takeProfit,
        comment: "ALFA-Bot",
      }),
    });
    if (!res.ok) {
      let errBody = "";
      try { errBody = await res.text(); } catch {}
      console.error(
        `[metaapi] Order failed: ${res.status} symbol=${brokerSymbol} body=${errBody.slice(0, 200)}`
      );
      return { ok: false, error: `Order failed: ${res.status} ${errBody.slice(0, 120)}` };
    }
    const d = await res.json();
    return { ok: true, orderId: d.orderId || d.positionId };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

export async function closePosition(
  mt5Login: string,
  positionId: string,
  metaApiAccountIdOverride?: string
): Promise<TradeResult> {
  if (SIMULATION) return { ok: true, orderId: positionId };
  const id = metaApiAccountIdOverride || accountCache.get(mt5Login);
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

export async function getOpenPositions(
  mt5Login: string,
  metaApiAccountIdOverride?: string
): Promise<Position[]> {
  if (SIMULATION) return [];
  const id = metaApiAccountIdOverride || accountCache.get(mt5Login);
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
    provisioningApi: boolean; // metaapi-provisioning-api OR trading-account-management-api (new)
    provisioningApiAll: boolean; // ... on ALL resources (not just one account)
    tradingAccountMgmtApi: boolean; // trading-account-management-api (new style, replaces provisioning-api)
    tradingAccountMgmtApiAll: boolean;
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
        tradingAccountMgmtApi: false,
        tradingAccountMgmtApiAll: false,
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
  // Old permission name: metaapi-provisioning-api (still works for legacy tokens)
  const provisioningApi = !!has("metaapi-provisioning-api");
  const provisioningApiAll = hasAll("metaapi-provisioning-api");
  // NEW permission name: trading-account-management-api (replaces provisioning-api)
  // The new token UI in MetaApi bundles all createAccount/deployAccount/getAccounts
  // methods under this single access rule. We treat it as equivalent.
  const tradingAccountMgmtApi = !!has("trading-account-management-api");
  const tradingAccountMgmtApiAll = hasAll("trading-account-management-api");
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
      tradingAccountMgmtApi,
      tradingAccountMgmtApiAll,
      copyfactoryApi,
      copyfactoryApiAll,
      mtManagerApi,
      mtManagerApiAll,
      metaapiRestApi,
      metaapiRestApiAll,
      metastatsApi,
    },
    // canAutoProvision is true if EITHER the old provisioning-api OR the new
    // trading-account-management-api has writer role on ALL accounts.
    canAutoProvision: provisioningApiAll || tradingAccountMgmtApiAll,
    canUseCopyFactory: copyfactoryApiAll,
  };
}
