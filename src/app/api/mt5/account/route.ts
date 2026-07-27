import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionByToken, getSessionIdByToken } from "@/lib/session";
import {
  getAccountInfo,
  ensureAccountCached,
  findExistingMetaApiAccount,
  getCachedMetaApiAccountId,
  isSimulationMode,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mt5/account
 * Body: { sessionId: string }   (the public session token)
 *
 * Returns the live MT5 account info (balance, equity, leverage, server,
 * connection status). Used by the dashboard for periodic refresh.
 *
 * Robustness: if the in-memory accountCache is cold (e.g., right after a
 * container restart and the instrumentation auto-resume hasn't fired yet),
 * we re-resolve the metaApiAccountId from the provisioning API by login.
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

    // Use the persisted metaApiAccountId if we have it; otherwise fall back
    // to the in-memory cache; otherwise try to resolve it from the
    // provisioning API by login (this handles the cold-start edge case).
    let metaApiAccountId =
      session.metaApiAccountId ||
      getCachedMetaApiAccountId(session.mt5Login) ||
      undefined;

    if (!metaApiAccountId && !isSimulationMode()) {
      const existing = await findExistingMetaApiAccount(session.mt5Login);
      if (existing?.id) {
        metaApiAccountId = existing.id;
        // Persist the resolved id back to the session row so future calls
        // don't need to hit the provisioning API again.
        try {
          await db.mT5Session.update({
            where: { id: session.id },
            data: { metaApiAccountId: existing.id },
          });
        } catch {
          /* ignore DB update failure — best-effort */
        }
      }
    }

    // Ensure the in-memory cache is populated (idempotent).
    if (metaApiAccountId) {
      ensureAccountCached(session.mt5Login, metaApiAccountId);
    }

    const info = await getAccountInfo(session.mt5Login, metaApiAccountId);
    if (!info) {
      return NextResponse.json(
        { ok: false, error: "account info unavailable" },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, account: info });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
