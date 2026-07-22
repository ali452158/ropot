import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateActivationCode } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/codes/generate
 *
 * This endpoint is reserved for the Telegram bot (server-to-server) to create
 * new monthly activation codes. It is protected by a shared secret in the
 * X-Admin-Token header (the same secret the Telegram bot uses).
 *
 * Body (optional): { count?: number, notes?: string }
 * Returns: { ok: true, codes: [{ code, expiresAt }] }
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
