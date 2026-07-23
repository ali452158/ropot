import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildDeviceFingerprint,
  getClientIp,
  hashPassword,
} from "@/lib/security";
import { newSessionToken } from "@/lib/codes";
import { provisionMetaApiAccount, getAccountInfo, isSimulationMode, getMasterMetaApiAccountId, getMasterLogin } from "@/lib/metaapi";
import { startBot } from "@/lib/bot-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mt5/login
 * Body: { code: string, mt5Login: string, mt5Password: string, mt5Server: string }
 *
 * - Validates the activation code + device fingerprint (already-bound).
 * - Provisions a MetaAPI account for this MT5 login (or reuses cached one).
 * - Creates a new MT5Session row.
 * - Creates a default BotConfig for the session with botRunning=true.
 * - AUTO-STARTS the bot loop so the subscriber's account starts trading
 *   immediately after a successful login — no manual "Start" press required.
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
    //    (Also fires-and-forgets the master-account warm-up so that market
    //    data is ready by the time the bot starts its first tick.)
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

    // 2b) Fire-and-forget: warm up the master account in parallel with the
    //     subscriber's provisioning. The master is the SOLE market-data source
    //     for all bot sessions (configured via META_API_MASTER_LOGIN env var).
    if (!isSimulationMode() && getMasterLogin()) {
      getMasterMetaApiAccountId().catch(() => {});
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

    // 5) Create a default bot config for this session — botRunning=true so the
    //    dashboard reflects the auto-started state immediately.
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

    // 6) AUTO-START the bot loop. Each subscriber's account starts trading
    //    immediately after a successful MT5 login — no manual Start press
    //    required. The dashboard will show "البوت يعمل" automatically.
    const startResult = await startBot(sessionToken);
    if (!startResult.ok) {
      console.warn(
        `[mt5/login] auto-start failed for ${mt5Login}:`,
        startResult.error
      );
      // Don't fail the login — the user can press Start manually on the dashboard.
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
