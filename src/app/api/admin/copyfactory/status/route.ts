import { NextRequest, NextResponse } from "next/server";
import {
  getDiagnostics,
  listStrategies,
  getCopyFactoryBaseUrl,
} from "@/lib/copyfactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/copyfactory/status
 *
 * Admin-only diagnostic endpoint. Returns:
 *   - Whether CopyFactory is configured (token + strategy ID)
 *   - The resolved strategy details (name, account, published, subscribers)
 *   - List of all strategies owned by the current token
 *   - Diagnostic info about CopyFactory API reachability
 *
 * Used to verify that:
 *   1. The token has copyfactory-api:reader+writer permission.
 *   2. The strategy ID in .env matches a real strategy in MetaApi.
 *   3. The strategy is published (so external subscribers can connect).
 *   4. The CopyFactory API is reachable (account has CopyFactory enabled).
 */
export async function GET(req: NextRequest) {
  const adminToken =
    process.env.ADMIN_API_TOKEN || process.env.TELEGRAM_ADMIN_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const diag = await getDiagnostics();
    const strategies = await listStrategies();
    const baseUrl = getCopyFactoryBaseUrl();

    // Detect the "CopyFactory not enabled on account" case.
    // When CopyFactory isn't enabled, listStrategies() returns [] and
    // baseUrl may be "(unresolved)" because /users/current/servers/mt-client-api
    // returns 401 (no provisioning-api permission in the token).
    const copyFactoryProbablyNotEnabled =
      !diag.simulation &&
      diag.tokenPresent &&
      strategies.length === 0 &&
      (baseUrl === "(unresolved)" || baseUrl === "");

    return NextResponse.json({
      ok: true,
      ...diag,
      strategies,
      // Helpful guidance for the admin
      setupComplete:
        diag.tokenPresent &&
        !!diag.resolvedStrategy &&
        diag.resolvedStrategy.published,
      copyFactoryProbablyNotEnabled,
      nextSteps: getNextSteps(diag, strategies, copyFactoryProbablyNotEnabled),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

function getNextSteps(
  diag: Awaited<ReturnType<typeof getDiagnostics>>,
  strategies: Awaited<ReturnType<typeof listStrategies>>,
  copyFactoryProbablyNotEnabled: boolean
): string[] {
  const steps: string[] = [];

  if (copyFactoryProbablyNotEnabled) {
    steps.push(
      "⚠️ CopyFactory API غير مفعّل على حسابك في MetaApi. توكن الـ JWT فيه صلاحية copyfactory-api:writer، " +
        "لكن الـ CopyFactory API نفسه لا يستجيب. هذا يعني أن CopyFactory غير مفعّل على مستوى الحساب."
    );
    steps.push(
      "1. سجّل دخول إلى app.metaapi.cloud"
    );
    steps.push(
      "2. اذهب إلى CopyFactory → Subscribe (أو CopyFactory → Strategies إذا كنت مشتركاً بالفعل)"
    );
    steps.push(
      "3. فعّل CopyFactory API على حساب الماستر (Settings → CopyFactory → Enable)"
    );
    steps.push(
      "4. قد تحتاج لشراء CopyFactory subscription (خدمة مدفوعة)"
    );
    steps.push(
      "5. بعد التفعيل، أعد تشغيل /api/admin/copyfactory/status للتأكد من عمل الـ API"
    );
    steps.push(
      "6. ثم شغّل POST /api/admin/copyfactory/strategy لإنشاء الاستراتيجية"
    );
    return steps;
  }

  if (!diag.tokenPresent) {
    steps.push("أضف META_API_TOKEN في ملف .env (توكن JWT بصلاحية copyfactory-api:writer)");
  }
  if (diag.strategiesCount === 0) {
    steps.push("أنشئ CopyFactory Strategy عبر POST /api/admin/copyfactory/strategy (أو يدوياً من لوحة MetaApi)");
    steps.push("بعد الإنشاء، أضف COPYFACTORY_STRATEGY_ID في ملف .env");
  } else if (!diag.configuredStrategyId) {
    steps.push(`أضف COPYFACTORY_STRATEGY_ID=${strategies[0]?._id || "strategy-XXXX"} في ملف .env`);
  }
  if (diag.resolvedStrategy && !diag.resolvedStrategy.published) {
    steps.push("فعّل خيار Published في إعدادات الاستراتيجية للسماح للمشتركين الخارجيين بالاتصال");
  }
  if (steps.length === 0) {
    steps.push("✅ كل شيء جاهز — يمكن للمشتركين التسجيل عبر /api/subscriber/register");
  }
  return steps;
}
