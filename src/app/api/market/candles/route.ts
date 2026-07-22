import { NextRequest, NextResponse } from "next/server";
import { getCandles, isSimulationMode } from "@/lib/metaapi";
import { getSessionByToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/candles?symbol=XAUUSD&timeframe=M1&limit=30[&sessionId=<token>]
 *
 * If sessionId is provided, candles are fetched through THAT subscriber's own
 * MetaAPI account. Otherwise we fall back to any cached account, and finally
 * to simulation mode.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "XAUUSD";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "M1";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 30);
  const sessionToken = req.nextUrl.searchParams.get("sessionId") || "";

  let mt5Login: string | undefined;
  if (sessionToken) {
    const session = await getSessionByToken(sessionToken);
    if (session) mt5Login = session.mt5Login;
  }

  const candles = await getCandles(symbol, timeframe, limit, mt5Login);
  return NextResponse.json({
    ok: true,
    candles,
    mode: isSimulationMode() ? "SIMULATION" : "LIVE",
    viaAccount: mt5Login || "any",
  });
}
