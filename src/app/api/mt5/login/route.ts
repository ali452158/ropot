import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildDeviceFingerprint,
  getClientIp,
  hashPassword,
} from "@/lib/security";
import { newSessionToken } from "@/lib/codes";
import { provisionMetaApiAccount, getAccountInfo, isSimulationMode } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mt5/login
 * Body: { code: string, mt5Login: string, mt5Password: string, mt5Server: string }
 *
 * - Validates the activation code + device fingerprint (already-bound).
 * - Provisions a MetaAPI account for this MT5 login (or reuses cached one).
 * - Creates a new MT5Session row.
 * - Returns the sessionId for the client to use in subsequent requests.
 *
 * The MT5 plain password is hashed and stored; the original is discarded
 * after being forwarded to MetaAPI at provisioning time.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").trim().toUpperCase();
    const mt5Login = String(body?.mt5Login || "").trim();
    const mt5Password = String(body?.mt5Password || "");
    const mt5Server = String(body?.mt5Server || "").trim();

    if (!code || !mt5Login || !mt5Password || !mt5Server) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال جميع بيانات MT5 (ID / Password / Server)" },
        { status: 400 }
      );
    }

    // 1) Validate the activation code.
    const row = await db.activationCode.findUnique({ where: { code } });
    if (!row || row.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "كود التفعيل غير صالح أو منتهي الصلاحية" },
        { status: 403 }
      );
    }
    const fp = buildDeviceFingerprint(req.headers, getClientIp(req.headers));
    if (row.deviceFingerprint !== fp) {
      return NextResponse.json(
        { ok: false, error: "هذا الكود مرتبط بجهاز آخر" },
        { status: 403 }
      );
    }

    // 2) Provision the MetaAPI account for this MT5 login.
    const provision = await provisionMetaApiAccount(
      mt5Login,
      mt5Password,
      mt5Server
    );
    if (!provision.metaApiAccountId) {
      return NextResponse.json(
        { ok: false, error: provision.error || "فشل في ربط حساب MT5" },
        { status: 502 }
      );
    }

    // 3) Test the account info.
    const info = await getAccountInfo(mt5Login, provision.metaApiAccountId);
    if (!info) {
      return NextResponse.json(
        { ok: false, error: "تم إنشاء الحساب لكن تعذر جلب معلوماته. تحقق من بيانات MT5." },
        { status: 502 }
      );
    }

    // 4) Create the session row.
    const sessionToken = newSessionToken();
    const session = await db.mT5Session.create({
      data: {
        sessionId: sessionToken,
        activationCodeId: row.id,
        mt5Login,
        mt5Server,
        mt5PasswordHash: hashPassword(mt5Password),
        metaApiAccountId: provision.metaApiAccountId,
        deviceId: fp,
        status: "ACTIVE",
      },
    });

    // 5) Create a default bot config for this session.
    await db.botConfig.upsert({
      where: { sessionId: session.id },
      update: {},
      create: {
        sessionId: session.id,
        symbol: "XAUUSD",
        timeframe: "M1",
        lotSize: 0.01,
        tpPips: 10,
        slPips: 7,
        autoTpSl: true,
        timeExitMinutes: 2,
        minWickRatio: 0.5,
        maxSpreadPips: 3.0,
        botRunning: false,
      },
    });

    return NextResponse.json({
      ok: true,
      sessionId: sessionToken,
      mode: isSimulationMode() ? "SIMULATION" : "LIVE",
      account: {
        login: info.login,
        server: info.server,
        balance: info.balance,
        equity: info.equity,
        currency: info.currency,
        leverage: info.leverage,
        connected: info.connected,
      },
    });
  } catch (e: any) {
    console.error("[mt5/login] error:", e);
    return NextResponse.json(
      { ok: false, error: `حدث خطأ غير متوقع: ${e?.message || e}` },
      { status: 500 }
    );
  }
}
