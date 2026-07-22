import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionByToken, getSessionIdByToken } from "@/lib/session";
import { getAccountInfo } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mt5/account
 * Body: { sessionId: string }   (the public session token)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionToken = String(body?.sessionId || "");
    if (!sessionToken) {
      return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
    }
    const session = await getSessionByToken(sessionToken);
    if (!session) {
      return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    }
    const info = await getAccountInfo(session.mt5Login, session.metaApiAccountId || undefined);
    if (!info) {
      return NextResponse.json({ ok: false, error: "account info unavailable" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, account: info });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
