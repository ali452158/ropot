import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionIdByToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/trades?sessionId=<token>&limit=50
 */
export async function GET(req: NextRequest) {
  const sessionToken = req.nextUrl.searchParams.get("sessionId") || "";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  if (!sessionToken) {
    return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
  }
  const id = await getSessionIdByToken(sessionToken);
  if (!id) {
    return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
  }
  const trades = await db.trade.findMany({
    where: { sessionId: id },
    orderBy: { openedAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ ok: true, trades });
}
