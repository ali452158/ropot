import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getConfiguredStrategyId } from "@/lib/copyfactory";
import { getMasterLogin } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/copyfactory/strategy-info?code=<activation-code>
 *
 * Returns the master CopyFactory Strategy ID + master MetaApi account info
 * that subscribers need to set up their own CopyFactory Subscriber.
 *
 * SECURITY: This endpoint requires a valid activation code in the query string.
 * Without a valid code, only the existence flag is returned (not the ID).
 *
 * Response shape (with valid code):
 *   {
 *     ok: true,
 *     strategyId: "strategy-uuid",
 *     masterLogin: "474240052",
 *     masterMetaApiAccountId: "fe905f8a-...",
 *     setupInstructions: [...]
 *   }
 *
 * Response shape (without/invalid code):
 *   {
 *     ok: true,
 *     requiresActivation: true,
 *     strategyExists: true|false,
 *     message: "أدخل كود التفعيل للحصول على Strategy ID"
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();
    const strategyIdFromEnv = getConfiguredStrategyId();
    const strategyIdFromDb = await getStoredStrategyId();
    const strategyId = strategyIdFromEnv || strategyIdFromDb;

    // If no code provided, only reveal whether the strategy exists.
    if (!code) {
      return NextResponse.json({
        ok: true,
        requiresActivation: true,
        strategyExists: !!strategyId,
        message: strategyId
          ? "الاستراتيجية مفعّلة. أدخل كود التفعيل للحصول على Strategy ID."
          : "الاستراتيجية غير مفعّلة بعد. تواصل مع الأدمن.",
      });
    }

    // Verify the code is valid + active.
    const row = await db.activationCode.findUnique({ where: { code } });
    if (!row || (row.status !== "UNUSED" && row.status !== "ACTIVE")) {
      return NextResponse.json(
        {
          ok: false,
          error: "كود التفعيل غير صالح أو منتهي الصلاحية",
        },
        { status: 403 }
      );
    }

    // Code is valid — reveal the strategy ID + setup instructions.
    if (!strategyId) {
      return NextResponse.json({
        ok: true,
        requiresActivation: false,
        strategyExists: false,
        message:
          "كود التفعيل صحيح، لكن الاستراتيجية غير منشورة بعد على السيرفر. " +
          "تواصل مع الأدمن لتفعيل CopyFactory.",
        masterLogin: getMasterLogin() || null,
      });
    }

    return NextResponse.json({
      ok: true,
      requiresActivation: false,
      strategyExists: true,
      strategyId,
      masterLogin: getMasterLogin() || null,
      setupInstructions: [
        "1. اذهب إلى app.metaapi.cloud وسجّل حساباً مجانياً (إن لم يكن لديك).",
        "2. من قائمة MetaTrader Accounts → Add Account، أضف حساب MT5 الخاص بك (Login + Password + Server).",
        "3. من قائمة CopyFactory → Subscribers → Create Subscriber.",
        `4. في خانة Strategy ID، الصق الـ ID التالي: ${strategyId}`,
        "5. احفظ → انسخ الـ Subscriber ID الذي يظهر في الأعلى.",
        "6. ارجع إلى البوت وأدخل الـ Subscriber ID لإتمام الربط.",
      ],
    });
  } catch (e: any) {
    console.error("[copyfactory/strategy-info] error:", e);
    return NextResponse.json(
      { ok: false, error: `حدث خطأ: ${e?.message || e}` },
      { status: 500 }
    );
  }
}

const STRATEGY_SETTING_KEY = "copyfactory_strategy_id";

async function getStoredStrategyId(): Promise<string | null> {
  try {
    const row = await db.systemSetting.findUnique({
      where: { id: STRATEGY_SETTING_KEY },
    });
    return row?.value || null;
  } catch {
    return null;
  }
}
