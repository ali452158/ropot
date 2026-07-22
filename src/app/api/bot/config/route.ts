import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionByToken, getSessionIdByToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/config?sessionId=<token>
 * POST /api/bot/config { sessionId: <token>, ...patch }
 */

export async function GET(req: NextRequest) {
  const sessionToken = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionToken) {
    return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
  }
  const id = await getSessionIdByToken(sessionToken);
  if (!id) {
    return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
  }
  let cfg = await db.botConfig.findUnique({ where: { sessionId: id } });
  if (!cfg) {
    cfg = await db.botConfig.create({
      data: {
        sessionId: id,
        symbol: "XAUUSD",
        timeframe: "M1",
        lotSize: 0.01,
        tpPips: 10,
        slPips: 7,
        autoTpSl: true,
        timeExitMinutes: 2,
        minWickRatio: 0.5,
        maxSpreadPips: 3.0,
        highFrequencyMode: false,
        botRunning: false,
      },
    });
  }
  return NextResponse.json({ ok: true, config: cfg });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionToken = String(body?.sessionId || "");
    if (!sessionToken) {
      return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
    }
    const id = await getSessionIdByToken(sessionToken);
    if (!id) {
      return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    }

    const patch: any = {};
    const allowed = [
      "symbol",
      "timeframe",
      "lotSize",
      "tpPips",
      "slPips",
      "autoTpSl",
      "timeExitMinutes",
      "minWickRatio",
      "maxSpreadPips",
      "highFrequencyMode",
    ] as const;
    for (const k of allowed) {
      if (k in body) {
        // @ts-ignore dynamic
        patch[k] = body[k];
      }
    }

    const cfg = await db.botConfig.upsert({
      where: { sessionId: id },
      update: patch,
      create: {
        sessionId: id,
        symbol: patch.symbol || "XAUUSD",
        timeframe: patch.timeframe || "M1",
        lotSize: patch.lotSize ?? 0.01,
        tpPips: patch.tpPips ?? 10,
        slPips: patch.slPips ?? 7,
        autoTpSl: patch.autoTpSl ?? true,
        timeExitMinutes: patch.timeExitMinutes ?? 2,
        minWickRatio: patch.minWickRatio ?? 0.5,
        maxSpreadPips: patch.maxSpreadPips ?? 3.0,
        highFrequencyMode: patch.highFrequencyMode ?? false,
        botRunning: false,
      },
    });
    return NextResponse.json({ ok: true, config: cfg });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
