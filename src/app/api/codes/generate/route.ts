import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateActivationCode } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/codes/generate
 *
 * Server-to-server endpoint for the Telegram bot / admin panel to create
 * new activation codes. Protected by X-Admin-Token header.
 *
 * Body options:
 *   { count?: number, notes?: string }                            // generic codes (no mt5Login)
 *   { mt5Login: string, expiresDays?: number, notes?: string }    // MT5-bound code (single)
 *
 * MT5-bound codes:
 *   - Generated when a subscriber pays (Telegram bot creates one).
 *   - The code can ONLY be used with the specified mt5Login.
 *   - Subscriber's MT5 account is auto-provisioned in MetaApi on first login.
 *
 * Returns:
 *   - For generic (count>1):  { ok: true, codes: [{ code, createdAt }] }
 *   - For mt5Login-bound:     { ok: true, code, mt5Login, expiresAt }
 */
export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN || process.env.TELEGRAM_ADMIN_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));

    // ===== Branch A: MT5-login-bound single code (preferred flow) =====
    const mt5Login = String(body?.mt5Login || "").trim();
    if (mt5Login) {
      const expiresDays = Math.min(Math.max(Number(body?.expiresDays || 30), 1), 365);
      const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
      const notes = String(body?.notes || `Bound to MT5 ${mt5Login}`);
      const code = generateActivationCode();

      await db.activationCode.create({
        data: {
          code,
          status: "UNUSED",
          mt5Login,
          expiresAt,
          createdBy: "telegram-bot",
          notes,
        },
      });

      return NextResponse.json({
        ok: true,
        code,
        mt5Login,
        expiresAt: expiresAt.toISOString(),
      });
    }

    // ===== Branch B: Generic bulk codes (legacy / admin-only) =====
    const count = Math.min(Number(body?.count || 1), 50);
    const notes = String(body?.notes || "telegram-bot");
    const codes: { code: string; createdAt: string }[] = [];
    for (let i = 0; i < count; i++) {
      const code = generateActivationCode();
      await db.activationCode.create({
        data: {
          code,
          status: "UNUSED",
          createdBy: "telegram-bot",
          notes,
        },
      });
      codes.push({ code, createdAt: new Date().toISOString() });
    }
    return NextResponse.json({ ok: true, codes });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

/** GET — list all codes (admin only) */
export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN || process.env.TELEGRAM_ADMIN_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const codes = await db.activationCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ ok: true, codes });
}
