import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentPrice,
  isSimulationMode,
  getMasterLogin,
  getCachedMasterMetaApiAccountId,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/price?symbol=XAUUSD[&sessionId=<token>]
 *
 * ARCHITECTURE: Price is ALWAYS fetched through the MASTER account
 * (configured via META_API_MASTER_LOGIN). The `sessionId` parameter is
 * accepted for backwards compatibility but IGNORED — market data is
 * symbol-global and shared across all bot sessions.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "XAUUSD";
  // sessionId accepted for back-compat but ignored — always uses master.
  // const sessionToken = req.nextUrl.searchParams.get("sessionId") || "";

  const tick = await getCurrentPrice(symbol);
  if (!tick) {
    return NextResponse.json({ ok: false, error: "no price" }, { status: 502 });
  }
  const masterLogin = getMasterLogin();
  const masterId = getCachedMasterMetaApiAccountId();
  return NextResponse.json({
    ok: true,
    tick,
    mode: isSimulationMode() ? "SIMULATION" : "LIVE",
    viaAccount: masterLogin
      ? `master:${masterLogin}`
      : masterId
        ? `master:${masterId}`
        : "any",
  });
}
