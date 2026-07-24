import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildDeviceFingerprint, getClientIp } from "@/lib/security";
import { newSessionToken } from "@/lib/codes";
import {
  verifySubscriberConnected,
  getConfiguredStrategyId,
} from "@/lib/copyfactory";
import { getMasterMetaApiAccountId, getMasterLogin } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/subscriber/register
 * Body: { code: string, subscriberId: string }
 *
 * CopyFactory subscriber registration flow:
 *
 * 1. Subscriber creates their OWN MetaApi account (free) on app.metaapi.cloud.
 * 2. Subscriber adds their OWN MT5 account in their MetaApi dashboard
 *    (their MT5 password stays private — never shared with the master).
 * 3. Subscriber creates a CopyFactory Subscriber pointing to the MASTER's
 *    strategy ID (published on the bot's website / sent by Telegram bot).
 * 4. Subscriber gets a Subscriber ID from MetaApi dashboard.
 * 5. Subscriber enters their activation code + Subscriber ID here.
 *
 * The bot:
 *   - Validates the activation code (must be UNUSED or ACTIVE).
 *   - Validates the Subscriber ID by calling CopyFactory API (read-only).
 *   - Verifies the subscriber is connected to our master strategy.
 *   - Creates an MT5Session row with copyFactorySubscriberId set.
 *   - Auto-starts the bot monitoring loop (the bot reads copied trades
 *     from CopyFactory instead of placing its own trades).
 *
 * NO MT5 PASSWORD IS EVER SHARED WITH THE BOT OPERATOR.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").trim().toUpperCase();
    const subscriberId = String(body?.subscriberId || "").trim();

    if (!code || !subscriberId) {
      return NextResponse.json(
        {
          ok: false,
          error: "الرجاء إدخال كود التفعيل + CopyFactory Subscriber ID",
        },
        { status: 400 }
      );
    }

    // 1) Validate activation code.
    const row = await db.activationCode.findUnique({ where: { code } });
    if (!row || (row.status !== "UNUSED" && row.status !== "ACTIVE")) {
      return NextResponse.json(
        { ok: false, error: "كود التفعيل غير صالح أو منتهي الصلاحية" },
        { status: 403 }
      );
    }

    // 2) Verify the CopyFactory subscriber exists and is connected to our strategy.
    const expectedStrategyId = getConfiguredStrategyId();
    if (!expectedStrategyId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "لم يتم تفعيل CopyFactory على السيرفر. تواصل مع الأدمن لتفعيل الاستراتيجية.",
        },
        { status: 503 }
      );
    }

    const verification = await verifySubscriberConnected(
      subscriberId,
      expectedStrategyId
    );
    if (!verification.connected) {
      return NextResponse.json(
        {
          ok: false,
          error:
            verification.error ||
            "Subscriber غير مرتبط بالاستراتيجية. تأكد من إدخال Strategy ID الصحيح في لوحة CopyFactory.",
          expectedStrategyId,
        },
        { status: 403 }
      );
    }
    if (!verification.active) {
      return NextResponse.json(
        {
          ok: false,
          error: "Subscriber موجود لكنه غير نشط. فعّله من لوحة CopyFactory.",
        },
        { status: 403 }
      );
    }

    // 3) Mark code as ACTIVE on first use.
    const fp = buildDeviceFingerprint(req.headers, getClientIp(req.headers));
    if (row.status === "UNUSED") {
      await db.activationCode.update({
        where: { code },
        data: {
          status: "ACTIVE",
          activatedAt: new Date(),
          deviceFingerprint: fp,
          deviceInfo: req.headers.get("user-agent") || "unknown",
        },
      });
    }

    // 4) Create the session row.
    const sessionToken = newSessionToken();
    const session = await db.mT5Session.create({
      data: {
        sessionId: sessionToken,
        activationCodeId: row.id,
        // For CopyFactory subscribers, we don't have MT5 credentials — leave empty.
        mt5Login: subscriberId, // store subscriber ID here for backwards compat
        mt5Server: "copyfactory",
        mt5PasswordHash: "(copyfactory)", // sentinel — no real password
        metaApiAccountId: null,
        deviceId: fp,
        status: "ACTIVE",
        copyFactorySubscriberId: subscriberId,
        copyFactoryStrategyId: verification.strategyId,
        copyFactoryState: "ACTIVE",
      },
    });

    // 5) Create a default bot config (mostly for UI consistency).
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

    // 6) Fire-and-forget: warm up the master account (for market data display
    //    on the subscriber's dashboard).
    if (getMasterLogin()) {
      getMasterMetaApiAccountId().catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      sessionId: sessionToken,
      mode: "COPYFACTORY",
      botAutoStarted: true,
      subscriber: {
        subscriberId,
        strategyId: verification.strategyId,
        active: verification.active,
      },
      // No account info returned — the subscriber's MT5 balance/equity are
      // private to them. They can see it in their own MetaApi dashboard.
    });
  } catch (e: any) {
    console.error("[subscriber/register] error:", e);
    return NextResponse.json(
      { ok: false, error: `حدث خطأ غير متوقع: ${e?.message || e}` },
      { status: 500 }
    );
  }
}
