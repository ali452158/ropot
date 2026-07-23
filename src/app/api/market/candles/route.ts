import { NextRequest, NextResponse } from "next/server";
import {
  getCandles,
  isSimulationMode,
  getMasterLogin,
  getCachedMasterMetaApiAccountId,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/candles?symbol=XAUUSD&timeframe=M1&limit=30[&sessionId=<token>]
 *
 * ARCHITECTURE: Candles are ALWAYS fetched through the MASTER account
 * (configured via META_API_MASTER_LOGIN). The `sessionId` parameter is
 * accepted for backwards compatibility but IGNORED — market data is
 * symbol-global and shared across all bot sessions.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "XAUUSD";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "M1";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 30);
  // sessionId accepted for back-compat but ignored — always uses master.
  // const sessionToken = req.nextUrl.searchParams.get("sessionId") || "";

  const candles = await getCandles(symbol, timeframe, limit);
  const masterLogin = getMasterLogin();
  const masterId = getCachedMasterMetaApiAccountId();
  return NextResponse.json({
    ok: true,
    candles,
    mode: isSimulationMode() ? "SIMULATION" : "LIVE",
    viaAccount: masterLogin
      ? `master:${masterLogin}`
      : masterId
        ? `master:${masterId}`
        : "any",
  });
}
