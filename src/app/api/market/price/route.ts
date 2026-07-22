import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrice, isSimulationMode } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/price?symbol=XAUUSD */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "XAUUSD";
  const tick = await getCurrentPrice(symbol);
  if (!tick) {
    return NextResponse.json({ ok: false, error: "no price" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, tick, mode: isSimulationMode() ? "SIMULATION" : "LIVE" });
}
