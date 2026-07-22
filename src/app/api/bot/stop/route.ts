import { NextRequest, NextResponse } from "next/server";
import { getSessionIdByToken } from "@/lib/session";
import { stopBot } from "@/lib/bot-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/stop
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
    const res = await stopBot(sessionToken);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Bot stopped" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
