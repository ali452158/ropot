import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listActiveSessions, getActiveSessionCount } from "@/lib/bot-runner";
import { listProvisionedLogins } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sessions
 *
 * Operator-only endpoint. Lists:
 *   - All MT5 sessions ever created (most recent first)
 *   - Which subscribers have a bot CURRENTLY running
 *   - Which MT5 logins are currently provisioned in MetaAPI
 *
 * Auth: X-Admin-Token header must match ADMIN_API_TOKEN env var.
 *
 * Response:
 *   {
 *     ok: true,
 *     activeBotCount: number,
 *     activeBots: [{ sessionToken, mt5Login, symbol, timeframe, highFrequencyMode, hasOpenPosition }],
 *     recentSessions: [{ id, mt5Login, mt5Server, status, createdAt, ... }],
 *     provisionedLogins: string[]
 *   }
 */
export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // All recent MT5 sessions (last 100)
  const recentSessions = await db.mT5Session.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      sessionId: true,
      mt5Login: true,
      mt5Server: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Active bot loops right now (in-process)
  const activeBots = listActiveSessions();

  // MT5 logins provisioned in MetaAPI (in-process cache, current worker only)
  const provisionedLogins = listProvisionedLogins();

  return NextResponse.json({
    ok: true,
    activeBotCount: getActiveSessionCount(),
    activeBots,
    recentSessions,
    provisionedLogins,
  });
}
