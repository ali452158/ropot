import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrice, isSimulationMode } from "@/lib/metaapi";
import { getSessionByToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/price?symbol=XAUUSD[&sessionId=<token>]
 *
 * If sessionId is provided, market data is fetched through THAT subscriber's
 * own MetaAPI account. Otherwise we fall back to any cached account, and
 * finally to simulation mode.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "XAUUSD";
  const sessionToken = req.nextUrl.searchParams.get("sessionId") || "";

  let mt5Login: string | undefined;
  if (sessionToken) {
    const session = await getSessionByToken(sessionToken);
    if (session) mt5Login = session.mt5Login;
  }

  const tick = await getCurrentPrice(symbol, mt5Login);
  if (!tick) {
    return NextResponse.json({ ok: false, error: "no price" }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    tick,
    mode: isSimulationMode() ? "SIMULATION" : "LIVE",
    viaAccount: mt5Login || "any",
  });
}
