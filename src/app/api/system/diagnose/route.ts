import { NextResponse } from "next/server";
import {
  getMetaApiHosts,
  isSimulationMode,
  getMasterLogin,
  listMetaApiAccounts,
  getMasterMetaApiAccountId,
  getCachedMasterMetaApiAccountId,
  getCandles,
  getCurrentPrice,
  getCachedMetaApiAccountId,
} from "@/lib/metaapi";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/system/diagnose
 *
 * Full self-diagnostic. Reports:
 *   - All MetaApi accounts provisioned under the token (state, connectionStatus, server, region, roles)
 *   - Master account resolution status (was META_API_MASTER_LOGIN found?)
 *   - Master account deployment + connection status
 *   - XAUUSD price-fetch test through the master account
 *   - XAUUSD candle-fetch test through the master account
 *   - Subscriber account info test (the first MT5Session in the DB)
 *
 * Designed to be hit via curl from the VPS:
 *   curl http://localhost:3000/api/system/diagnose | jq
 */
export async function GET() {
  const hosts = getMetaApiHosts();
  if (hosts.simulation) {
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      message: "No META_API_TOKEN set — running in simulation mode.",
    });
  }

  const masterLogin = getMasterLogin();

  // 1) List ALL MetaApi accounts under the token.
  let allAccounts: any[] = [];
  try {
    allAccounts = await listMetaApiAccounts();
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      mode: "LIVE",
      error: `Failed to list MetaApi accounts: ${e?.message || e}`,
      hosts,
    });
  }

  // 2) Find the master account by login.
  const masterAccount = masterLogin
    ? allAccounts.find((a) => String(a.login) === String(masterLogin))
    : null;

  // 3) Resolve master via the cached resolution path (same as production code).
  let resolvedMasterId: string | null = null;
  try {
    resolvedMasterId = await getMasterMetaApiAccountId();
  } catch {
    /* ignore */
  }

  // 4) Test fetching XAUUSD candles through the master account.
  let candleTest: any = null;
  try {
    const candles = await getCandles("XAUUSD", "M1", 5);
    candleTest = {
      ok: candles.length > 0,
      count: candles.length,
      sample: candles[0]
        ? {
            time: candles[0].time,
            open: candles[0].open,
            high: candles[0].high,
            low: candles[0].low,
            close: candles[0].close,
          }
        : null,
    };
  } catch (e: any) {
    candleTest = { ok: false, error: e?.message || String(e) };
  }

  // 5) Test fetching the current XAUUSD price through the master account.
  let priceTest: any = null;
  try {
    const tick = await getCurrentPrice("XAUUSD");
    priceTest = tick
      ? { ok: true, bid: tick.bid, ask: tick.ask, time: tick.time }
      : { ok: false, error: "getCurrentPrice returned null" };
  } catch (e: any) {
    priceTest = { ok: false, error: e?.message || String(e) };
  }

  // 6) Test fetching account info for any subscriber in the DB.
  let subscriberTest: any = null;
  try {
    const session = await db.mT5Session.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (session) {
      const id = session.metaApiAccountId || getCachedMetaApiAccountId(session.mt5Login);
      subscriberTest = {
        mt5Login: session.mt5Login,
        mt5Server: session.mt5Server,
        metaApiAccountId: id || null,
        cachedInProcess: !!getCachedMetaApiAccountId(session.mt5Login),
      };
    } else {
      subscriberTest = { ok: false, error: "No MT5Session rows in DB" };
    }
  } catch (e: any) {
    subscriberTest = { ok: false, error: e?.message || String(e) };
  }

  // 7) Build the verdict.
  const verdict: string[] = [];
  if (!masterLogin) {
    verdict.push("❌ META_API_MASTER_LOGIN is not set — bot can't fetch market data.");
  } else if (!masterAccount) {
    verdict.push(
      `❌ Master login ${masterLogin} is NOT provisioned under this token. Provision it in the MetaApi dashboard first.`
    );
  } else {
    if (masterAccount.state !== "DEPLOYED") {
      verdict.push(
        `❌ Master account ${masterLogin} state=${masterAccount.state} (must be DEPLOYED). Deploy it in the MetaApi dashboard.`
      );
    }
    if (masterAccount.connectionStatus !== "CONNECTED") {
      verdict.push(
        `❌ Master account ${masterLogin} connectionStatus=${masterAccount.connectionStatus} (must be CONNECTED). Check MT5 credentials / broker server.`
      );
    }
  }
  if (candleTest && !candleTest.ok) {
    verdict.push("❌ getCandles(XAUUSD) failed — master account cannot stream market data.");
  }
  if (priceTest && !priceTest.ok) {
    verdict.push("❌ getCurrentPrice(XAUUSD) failed — bot will not be able to enter trades.");
  }
  if (verdict.length === 0) {
    verdict.push("✅ All checks passed — master account is live and streaming XAUUSD prices.");
  }

  return NextResponse.json({
    ok: true,
    mode: "LIVE",
    timestamp: new Date().toISOString(),
    hosts,
    master: {
      configuredLogin: masterLogin,
      foundInProvisioning: !!masterAccount,
      account: masterAccount
        ? {
            id: masterAccount.id,
            login: masterAccount.login,
            server: masterAccount.server,
            state: masterAccount.state,
            connectionStatus: masterAccount.connectionStatus,
            region: masterAccount.region,
            copyFactoryRoles: masterAccount.copyFactoryRoles,
          }
        : null,
      resolvedMetaApiAccountId: resolvedMasterId,
      cachedMetaApiAccountId: getCachedMasterMetaApiAccountId(),
    },
    allAccounts: allAccounts.map((a) => ({
      id: a.id,
      login: a.login,
      server: a.server,
      state: a.state,
      connectionStatus: a.connectionStatus,
      region: a.region,
      copyFactoryRoles: a.copyFactoryRoles,
    })),
    candleTest,
    priceTest,
    subscriberTest,
    verdict,
  });
}
