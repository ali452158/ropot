import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildDeviceFingerprint, getClientIp } from "@/lib/security";
import { daysRemaining, isExpired } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/activation/status
 * Body: { code: string }
 *
 * Lightweight status check (does NOT bind a device). Used on page reload
 * to figure out which stage to show.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ ok: false, error: "missing code" }, { status: 400 });
    }
    const row = await db.activationCode.findUnique({ where: { code } });
    if (!row) {
      return NextResponse.json({ ok: false, error: "code not found" }, { status: 404 });
    }
    if (row.status === "ACTIVE" && isExpired(row.expiresAt)) {
      await db.activationCode.update({
        where: { id: row.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({
        ok: true,
        status: "EXPIRED",
        daysRemaining: 0,
      });
    }
    const fp = buildDeviceFingerprint(req.headers, getClientIp(req.headers));
    const deviceMatch = row.status === "ACTIVE" && row.deviceFingerprint === fp;
    return NextResponse.json({
      ok: true,
      status: row.status,
      activatedAt: row.activatedAt?.toISOString() || null,
      expiresAt: row.expiresAt?.toISOString() || null,
      daysRemaining: daysRemaining(row.expiresAt),
      deviceMatch,
      deviceId: fp,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
