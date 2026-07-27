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
  try {
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
          timeExitMinutes: 1,
          minWickRatio: 0.5,
          maxSpreadPips: 3.0,
          highFrequencyMode: true,
          // Simplified-UI defaults:
          tradeDirection: "AUTO",
          maxOpenPositions: 3,
          maxLossStreak: 5,
          lastLossStreak: 0,
          instabilityStop: false,
          // Pyramid-strategy defaults:
          pyramidProfitUsd: 2.0,
          pyramidMaxTrades: 6,
          pyramidAnchorCount: 2,
          // Trailing-strategy defaults:
          strategyType: "trailing",
          autoPairScan: false,
          scanSymbols: "XAUUSD",
          atrPeriod: 14,
          atrMultiplier: 1.5,
          emaFast: 9,
          emaSlow: 21,
          minAtrPrice: 0.1,
          breakevenAtr: 0.8,
          maxTradeMinutes: 1,
          botRunning: false,
        },
      });
    }
    return NextResponse.json({ ok: true, config: cfg });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
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
      // Simplified-UI fields (user-selected):
      "tradeDirection",
      "maxOpenPositions",
      "maxLossStreak",
      // Pyramid-strategy fields (user-selected):
      "pyramidProfitUsd",
      "pyramidMaxTrades",
      "pyramidAnchorCount",
      // Engine-managed fields (server updates these; user cannot set directly):
      "lastLossStreak",
      "instabilityStop",
      // Trailing-strategy fields:
      "strategyType",
      "autoPairScan",
      "scanSymbols",
      "atrPeriod",
      "atrMultiplier",
      "emaFast",
      "emaSlow",
      "minAtrPrice",
      "breakevenAtr",
      "maxTradeMinutes",
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
        timeExitMinutes: patch.timeExitMinutes ?? 1,
        minWickRatio: patch.minWickRatio ?? 0.5,
        maxSpreadPips: patch.maxSpreadPips ?? 3.0,
        highFrequencyMode: patch.highFrequencyMode ?? true,
        tradeDirection: patch.tradeDirection ?? "AUTO",
        maxOpenPositions: patch.maxOpenPositions ?? 3,
        maxLossStreak: patch.maxLossStreak ?? 5,
        lastLossStreak: patch.lastLossStreak ?? 0,
        instabilityStop: patch.instabilityStop ?? false,
        // Pyramid-strategy:
        pyramidProfitUsd: patch.pyramidProfitUsd ?? 2.0,
        pyramidMaxTrades: patch.pyramidMaxTrades ?? 6,
        pyramidAnchorCount: patch.pyramidAnchorCount ?? 2,
        strategyType: patch.strategyType ?? "trailing",
        autoPairScan: patch.autoPairScan ?? false,
        scanSymbols: patch.scanSymbols ?? "XAUUSD",
        atrPeriod: patch.atrPeriod ?? 14,
        atrMultiplier: patch.atrMultiplier ?? 1.5,
        emaFast: patch.emaFast ?? 9,
        emaSlow: patch.emaSlow ?? 21,
        minAtrPrice: patch.minAtrPrice ?? 0.1,
        breakevenAtr: patch.breakevenAtr ?? 0.8,
        maxTradeMinutes: patch.maxTradeMinutes ?? 1,
        botRunning: false,
      },
    });
    return NextResponse.json({ ok: true, config: cfg });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
