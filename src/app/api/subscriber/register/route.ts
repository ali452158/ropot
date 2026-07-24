import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildDeviceFingerprint, getClientIp } from "@/lib/security";
import { newSessionToken } from "@/lib/codes";
import {
  createSubscriber,
  getConfiguredStrategyId,
  verifySubscriberConnected,
} from "@/lib/copyfactory";
import {
  getMasterMetaApiAccountId,
  getMasterLogin,
  provisionMetaApiAccount,
  waitForDeploy,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/subscriber/register
 *
 * AUTOMATIC PROVISIONING FLOW (default).
 * Body: { code, mt5Login, mt5Password, mt5Server }
 *
 * 1. Validates the activation code (UNUSED or ACTIVE).
 * 2. Validates that CopyFactory is configured (COPYFACTORY_STRATEGY_ID set).
 * 3. Provisions a MetaApi account for the subscriber (using their MT5 login +
 *    password + server). The password is sent ONCE to the MetaApi provisioning
 *    API and is NEVER persisted in our DB.
 * 4. Waits for the MetaApi account to reach DEPLOYED state.
 * 5. Creates a CopyFactory Subscriber bound to the new MetaApi account, and
 *    subscribes it to our master strategy.
 * 6. Verifies the subscriber is connected to the strategy.
 * 7. Marks the activation code as ACTIVE.
 * 8. Creates an MT5Session row with all the IDs stored.
 * 9. Returns the session token.
 *
 * FALLBACK FLOW (when `subscriberId` is provided instead of MT5 credentials).
 * Body: { code, subscriberId }
 *
 * Used when the subscriber created their Subscriber manually in the MetaApi
 * dashboard. We just verify the subscriber ID against CopyFactory and start
 * the session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").trim().toUpperCase();
    const mt5Login = String(body?.mt5Login || "").trim();
    const mt5Password = String(body?.mt5Password || "");
    const mt5Server = String(body?.mt5Server || "").trim();
    const subscriberId = String(body?.subscriberId || "").trim();

    // --- mode detection -----------------------------------------------------
    // AUTOMATIC = subscriber gave us MT5 credentials
    // MANUAL     = subscriber gave us a pre-existing Subscriber ID
    const isAutomaticMode =
      mt5Login && mt5Password && mt5Server && !subscriberId;
    const isManualMode = !!subscriberId;

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال كود التفعيل" },
        { status: 400 }
      );
    }
    if (!isAutomaticMode && !isManualMode) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "الرجاء إدخال بيانات MT5 (Login + Password + Server) للربط التلقائي، أو CopyFactory Subscriber ID للربط اليدوي",
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

    // 2) Verify CopyFactory is configured.
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

    // Build device fingerprint for the session row.
    const fp = buildDeviceFingerprint(req.headers, getClientIp(req.headers));
    const ua = req.headers.get("user-agent") || "unknown";

    // =====================================================================
    // AUTOMATIC MODE — provision MetaApi account + create CopyFactory subscriber
    // =====================================================================
    if (isAutomaticMode) {
      // Step 3a: Provision MetaApi account for the subscriber's MT5 account.
      console.log(
        `[subscriber/register] Auto-provisioning MetaApi account for MT5 login=${mt5Login} server=${mt5Server}`
      );
      const prov = await provisionMetaApiAccount(
        mt5Login,
        mt5Password,
        mt5Server
      );
      if (!prov.metaApiAccountId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              prov.error ||
              "فشل إنشاء حساب MetaApi للمشترك. تأكد من صحة بيانات MT5.",
          },
          { status: 502 }
        );
      }
      const subscriberMetaApiAccountId = prov.metaApiAccountId;

      // Step 4: Wait for DEPLOYED state (max 60s).
      console.log(
        `[subscriber/register] Waiting for MetaApi account ${subscriberMetaApiAccountId} to deploy...`
      );
      const deployed = await waitForDeploy(subscriberMetaApiAccountId);
      if (!deployed) {
        console.warn(
          `[subscriber/register] MetaApi account ${subscriberMetaApiAccountId} did not reach DEPLOYED within timeout — continuing anyway (CopyFactory will retry).`
        );
      }

      // Step 5: Create CopyFactory Subscriber bound to this MetaApi account.
      console.log(
        `[subscriber/register] Creating CopyFactory subscriber for accountId=${subscriberMetaApiAccountId} strategyId=${expectedStrategyId}`
      );
      const subResult = await createSubscriber({
        name: `ALFA Subscriber ${mt5Login}`,
        accountId: subscriberMetaApiAccountId,
        strategyId: expectedStrategyId,
        accountLogin: mt5Login,
      });
      if (!subResult.subscriberId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              subResult.error ||
              "تم إنشاء حساب MetaApi لكن فشل إنشاء CopyFactory Subscriber. تواصل مع الأدمن.",
            metaApiAccountId: subscriberMetaApiAccountId,
          },
          { status: 502 }
        );
      }
      const subscriberIdCreated = subResult.subscriberId;

      // Step 6: (best-effort) verify the subscriber is linked.
      const verification = await verifySubscriberConnected(
        subscriberIdCreated,
        expectedStrategyId
      );
      if (!verification.connected) {
        console.warn(
          `[subscriber/register] Subscriber created but verification failed: ${verification.error}`
        );
      }

      // Step 7: Mark code as ACTIVE on first use.
      if (row.status === "UNUSED") {
        await db.activationCode.update({
          where: { code },
          data: {
            status: "ACTIVE",
            activatedAt: new Date(),
            deviceFingerprint: fp,
            deviceInfo: ua,
            // bind this code to this MT5 login permanently
            mt5Login,
          },
        });
      }

      // Step 8: Create session row.
      const sessionToken = newSessionToken();
      const session = await db.mT5Session.create({
        data: {
          sessionId: sessionToken,
          activationCodeId: row.id,
          mt5Login,
          mt5Server,
          // Sentinel — never store the real password
          mt5PasswordHash: "(provisioned)",
          metaApiAccountId: subscriberMetaApiAccountId,
          deviceId: fp,
          status: "ACTIVE",
          copyFactorySubscriberId: subscriberIdCreated,
          copyFactoryStrategyId: expectedStrategyId,
          copyFactoryState: "ACTIVE",
        },
      });

      // Step 9: Create default bot config (for UI consistency).
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

      // Warm up the master account (fire-and-forget).
      if (getMasterLogin()) {
        getMasterMetaApiAccountId().catch(() => {});
      }

      return NextResponse.json({
        ok: true,
        sessionId: sessionToken,
        mode: "COPYFACTORY_AUTO",
        botAutoStarted: true,
        account: {
          login: mt5Login,
          server: mt5Server,
          metaApiAccountId: subscriberMetaApiAccountId,
        },
        subscriber: {
          subscriberId: subscriberIdCreated,
          strategyId: expectedStrategyId,
          active: verification.connected ? verification.active : true,
        },
      });
    }

    // =====================================================================
    // MANUAL MODE — subscriber already created their subscriber in MetaApi
    // dashboard and just shared the ID with us.
    // =====================================================================

    // Verify the subscriber exists + is connected to our strategy.
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
    if (!verification.active && !verification.trusted) {
      return NextResponse.json(
        {
          ok: false,
          error: "Subscriber موجود لكنه غير نشط. فعّله من لوحة CopyFactory.",
        },
        { status: 403 }
      );
    }

    // Mark code as ACTIVE.
    if (row.status === "UNUSED") {
      await db.activationCode.update({
        where: { code },
        data: {
          status: "ACTIVE",
          activatedAt: new Date(),
          deviceFingerprint: fp,
          deviceInfo: ua,
        },
      });
    }

    // Create the session row.
    const sessionToken = newSessionToken();
    const session = await db.mT5Session.create({
      data: {
        sessionId: sessionToken,
        activationCodeId: row.id,
        mt5Login: subscriberId,
        mt5Server: "copyfactory-manual",
        mt5PasswordHash: "(copyfactory-manual)",
        metaApiAccountId: null,
        deviceId: fp,
        status: "ACTIVE",
        copyFactorySubscriberId: subscriberId,
        copyFactoryStrategyId: verification.strategyId,
        copyFactoryState: "ACTIVE",
      },
    });

    // Default bot config.
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

    if (getMasterLogin()) {
      getMasterMetaApiAccountId().catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      sessionId: sessionToken,
      mode: "COPYFACTORY_MANUAL",
      botAutoStarted: true,
      subscriber: {
        subscriberId,
        strategyId: verification.strategyId,
        active: verification.active,
      },
    });
  } catch (e: any) {
    console.error("[subscriber/register] error:", e);
    return NextResponse.json(
      { ok: false, error: `حدث خطأ غير متوقع: ${e?.message || e}` },
      { status: 500 }
    );
  }
}
