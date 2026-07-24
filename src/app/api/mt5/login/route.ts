import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildDeviceFingerprint,
  getClientIp,
  hashPassword,
} from "@/lib/security";
import { newSessionToken } from "@/lib/codes";
import {
  provisionMetaApiAccount,
  getAccountInfo,
  isSimulationMode,
  getMasterMetaApiAccountId,
  getMasterLogin,
  findExistingMetaApiAccount,
} from "@/lib/metaapi";
import { startBot } from "@/lib/bot-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mt5/login
 * Body: { code: string, mt5Login: string, mt5Password: string, mt5Server: string }
 *
 * ARCHITECTURE — MT5-login-bound activation codes:
 *   1. Each activation code is generated with a bound `mt5Login` (by admin/telegram bot).
 *   2. When the subscriber logs in:
 *      - The code must match the mt5Login they enter (security check).
 *      - MetaApi provisions (or reuses) an account for this mt5Login.
 *      - With a strong MetaApi token (writer role + mt-server resource), provisioning
 *        works automatically — no manual pre-add in the dashboard needed.
 *      - With a weaker token, the dashboard-pre-added account is reused automatically
 *        (see findExistingMetaApiAccount in metaapi.ts).
 *   3. Auto-starts the bot loop so trading begins immediately.
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

    // 1) Validate the activation code — must be UNUSED or ACTIVE.
    const row = await db.activationCode.findUnique({ where: { code } });
    if (!row || (row.status !== "UNUSED" && row.status !== "ACTIVE")) {
      return NextResponse.json(
        { ok: false, error: "كود التفعيل غير صالح أو منتهي الصلاحية" },
        { status: 403 }
      );
    }

    // 2) If the code is bound to a specific mt5Login, enforce the match.
    //    This is the security guarantee: a code generated for login X cannot
    //    be used to login with login Y.
    if (row.mt5Login && row.mt5Login !== mt5Login) {
      return NextResponse.json(
        {
          ok: false,
          error: `هذا الكود مرتبط بحساب MT5 رقم ${row.mt5Login} فقط. لا يمكن استخدامه مع حساب آخر.`,
        },
        { status: 403 }
      );
    }

    // 3) Compute device fingerprint (for audit logging — not used as auth gate).
    const fp = buildDeviceFingerprint(req.headers, getClientIp(req.headers));

    // 4) Provision the MetaApi account for this MT5 login.
    //    (Also fires-and-forgets the master-account warm-up so that market
    //    data is ready by the time the bot starts its first tick.)
    const provision = await provisionMetaApiAccount(
      mt5Login,
      mt5Password,
      mt5Server
    );
    if (!provision.metaApiAccountId) {
      // Friendly error: distinguish "not pre-added" from "real API failure".
      const existing = await findExistingMetaApiAccount(mt5Login).catch(() => null);
      if (!existing) {
        return NextResponse.json(
          {
            ok: false,
            error:
              `لم يتم العثور على حساب MT5 رقم ${mt5Login} في MetaApi.\n` +
              `الحل: أضف الحساب يدوياً من لوحة تحكم MetaApi (Add Account)، ` +
              `ثم حاول مرة أخرى. تفاصيل الخطأ: ${provision.error || "غير معروف"}`,
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { ok: false, error: provision.error || "فشل في ربط حساب MT5" },
        { status: 502 }
      );
    }

    // 4b) Fire-and-forget: warm up the master account in parallel.
    if (!isSimulationMode() && getMasterLogin()) {
      getMasterMetaApiAccountId().catch(() => {});
    }

    // 5) Test the account info.
    const info = await getAccountInfo(mt5Login, provision.metaApiAccountId);
    if (!info) {
      return NextResponse.json(
        { ok: false, error: "تم إنشاء الحساب لكن تعذر جلب معلوماته. تحقق من بيانات MT5." },
        { status: 502 }
      );
    }

    // 6) Mark the code as ACTIVE (if it was UNUSED) — first-use binding.
    if (row.status === "UNUSED") {
      await db.activationCode.update({
        where: { code },
        data: {
          status: "ACTIVE",
          activatedAt: new Date(),
          deviceFingerprint: fp,
          deviceInfo: req.headers.get("user-agent") || "unknown",
          // Persist the bound mt5Login if it wasn't set at generation time.
          mt5Login: row.mt5Login || mt5Login,
        },
      });
    }

    // 7) Create the session row.
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

    // 8) Create a default bot config — botRunning=true for auto-start.
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
        highFrequencyMode: false,
        botRunning: true,
        botStartedAt: new Date(),
      },
    });

    // 9) AUTO-START the bot loop. Each subscriber's account starts trading
    //    immediately after a successful MT5 login.
    const startResult = await startBot(sessionToken);
    if (!startResult.ok) {
      console.warn(
        `[mt5/login] auto-start failed for ${mt5Login}:`,
        startResult.error
      );
    } else {
      console.log(`[mt5/login] bot auto-started for ${mt5Login} (session ${sessionToken.slice(0, 8)}...)`);
    }

    return NextResponse.json({
      ok: true,
      sessionId: sessionToken,
      mode: isSimulationMode() ? "SIMULATION" : "LIVE",
      botAutoStarted: startResult.ok,
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
