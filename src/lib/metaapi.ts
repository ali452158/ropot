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

const META_API_TOKEN = process.env.META_API_TOKEN || "";
const META_API_DOMAIN =
  process.env.META_API_DOMAIN || "agiliumtrade.agiliumtrade.ai";
const SIMULATION = !META_API_TOKEN;

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
    const res = await fetch(`https://${META_API_DOMAIN}/users/current/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "auth-token": META_API_TOKEN,
      },
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
      const res = await fetch(
        `https://${META_API_DOMAIN}/users/current/accounts/${metaApiAccountId}`,
        {
          headers: { "auth-token": META_API_TOKEN },
        }
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
    const res = await fetch(
      `https://${META_API_DOMAIN}/users/current/accounts/${id}/account-information`,
      { headers: { "auth-token": META_API_TOKEN } }
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
    const res = await fetch(
      `https://${META_API_DOMAIN}/users/current/accounts/${id}/historical-candles/${symbol}/${timeframe}?limit=${limit}`,
      { headers: { "auth-token": META_API_TOKEN } }
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
    const res = await fetch(
      `https://${META_API_DOMAIN}/users/current/accounts/${id}/current-prices/${symbol}`,
      { headers: { "auth-token": META_API_TOKEN } }
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
    const res = await fetch(
      `https://${META_API_DOMAIN}/users/current/accounts/${id}/trade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "auth-token": META_API_TOKEN,
        },
        body: JSON.stringify({
          actionType:
            direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
          symbol,
          volume,
          stopLoss,
          takeProfit,
          comment: "ALFA-Bot",
        }),
      }
    );
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
    const res = await fetch(
      `https://${META_API_DOMAIN}/users/current/accounts/${id}/trade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "auth-token": META_API_TOKEN,
        },
        body: JSON.stringify({
          actionType: "POSITION_CLOSE_ID",
          positionId,
        }),
      }
    );
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
    const res = await fetch(
      `https://${META_API_DOMAIN}/users/current/accounts/${id}/positions`,
      { headers: { "auth-token": META_API_TOKEN } }
    );
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
