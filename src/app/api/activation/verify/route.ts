import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildDeviceFingerprint,
  getClientIp,
} from "@/lib/security";
import { addDays, daysRemaining, isExpired } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/activation/verify
 * Body: { code: string }
 *
 * Verifies an activation code:
 *   - Code must exist
 *   - Status must be UNUSED or ACTIVE (used codes are bound to one device only)
 *   - If status is ACTIVE, the requesting device must match the bound device
 *   - If status is EXPIRED or REVOKED, reject
 *
 * On first successful verification from an UNUSED code, we bind the device
 * and set expiresAt = now + 30 days.
 *
 * Returns:
 *   { ok: true, deviceId, status, expiresAt, daysRemaining }
 *   { ok: false, error }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال كود التفعيل" },
        { status: 400 }
      );
    }

    const row = await db.activationCode.findUnique({ where: { code } });

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "كود التفعيل غير موجود. تأكد من الكود وحاول مرة أخرى." },
        { status: 404 }
      );
    }

    if (row.status === "REVOKED") {
      return NextResponse.json(
        { ok: false, error: "هذا الكود ملغي. تواصل مع الدعم." },
        { status: 403 }
      );
    }

    const fp = buildDeviceFingerprint(req.headers, getClientIp(req.headers));

    // First-time activation: bind the device and start the 30-day clock.
    if (row.status === "UNUSED") {
      const now = new Date();
      const expiresAt = addDays(now, 30);
      await db.activationCode.update({
        where: { id: row.id },
        data: {
          status: "ACTIVE",
          deviceFingerprint: fp,
          deviceInfo: req.headers.get("user-agent") || "",
          activatedAt: now,
          expiresAt,
        },
      });
      return NextResponse.json({
        ok: true,
        deviceId: fp,
        status: "ACTIVE",
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        daysRemaining: 30,
        message: "تم تفعيل الكود بنجاح! صلاحية الكود 30 يوماً.",
      });
    }

    // Revisit from an already-active code: device must match.
    if (row.status === "ACTIVE") {
      if (isExpired(row.expiresAt)) {
        await db.activationCode.update({
          where: { id: row.id },
          data: { status: "EXPIRED" },
        });
        return NextResponse.json(
          { ok: false, error: "انتهت صلاحية هذا الكود." },
          { status: 403 }
        );
      }
      if (row.deviceFingerprint !== fp) {
        return NextResponse.json(
          {
            ok: false,
            error: "هذا الكود مرتبط بجهاز آخر. كل كود يعمل على جهاز واحد فقط.",
          },
          { status: 403 }
        );
      }
      return NextResponse.json({
        ok: true,
        deviceId: fp,
        status: "ACTIVE",
        activatedAt: row.activatedAt?.toISOString() || null,
        expiresAt: row.expiresAt?.toISOString() || null,
        daysRemaining: daysRemaining(row.expiresAt),
        message: "تم التحقق من الكود. تابع تسجيل الدخول إلى MT5.",
      });
    }

    // EXPIRED
    return NextResponse.json(
      { ok: false, error: "انتهت صلاحية هذا الكود." },
      { status: 403 }
    );
  } catch (e: any) {
    console.error("[activation/verify] error:", e);
    return NextResponse.json(
      { ok: false, error: `حدث خطأ غير متوقع: ${e?.message || e}` },
      { status: 500 }
    );
  }
}
