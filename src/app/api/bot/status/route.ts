import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionIdByToken } from "@/lib/session";
import { isBotRunning } from "@/lib/bot-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/status
 * Body: { sessionId: string }   (public token)
 */
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
    const cfg = await db.botConfig.findUnique({ where: { sessionId: id } });
    const trades = await db.trade.findMany({
      where: { sessionId: id },
      orderBy: { openedAt: "desc" },
      take: 50,
    });
    const wins = trades.filter(
      (t) => t.status === "CLOSED_TP" || (t.profitPips != null && t.profitPips > 0)
    ).length;
    const losses = trades.filter(
      (t) => t.status === "CLOSED_SL" || (t.profitPips != null && t.profitPips < 0)
    ).length;
    const totalPips = trades.reduce((s, t) => s + (t.profitPips || 0), 0);
    const closedTrades = trades.filter((t) => t.status !== "OPEN" && t.status !== "ERROR");
    const winRate = closedTrades.length
      ? (wins / closedTrades.length) * 100
      : 0;

    return NextResponse.json({
      ok: true,
      running: isBotRunning(sessionToken),
      botRunning: cfg?.botRunning || false,
      botStartedAt: cfg?.botStartedAt?.toISOString() || null,
      trades,
      stats: {
        total: trades.length,
        wins,
        losses,
        winRate,
        totalPips,
        openCount: trades.filter((t) => t.status === "OPEN").length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
