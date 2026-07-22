import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCandles, getCurrentPrice, isSimulationMode } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/candles?symbol=XAUUSD&timeframe=M1&limit=30
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "XAUUSD";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "M1";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 30);
  const candles = await getCandles(symbol, timeframe, limit);
  return NextResponse.json({ ok: true, candles, mode: isSimulationMode() ? "SIMULATION" : "LIVE" });
}
