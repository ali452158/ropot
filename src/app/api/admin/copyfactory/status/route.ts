import { NextRequest, NextResponse } from "next/server";
import { getDiagnostics, listStrategies } from "@/lib/copyfactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/copyfactory/status
 *
 * Admin-only diagnostic endpoint. Returns:
 *   - Whether CopyFactory is configured (token + strategy ID)
 *   - The resolved strategy details (name, account, published, subscribers)
 *   - List of all strategies owned by the current token
 *
 * Used to verify that:
 *   1. The token has copyfactory-api:reader+writer permission.
 *   2. The strategy ID in .env matches a real strategy in MetaApi.
 *   3. The strategy is published (so external subscribers can connect).
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

    return NextResponse.json({
      ok: true,
      ...diag,
      strategies,
      // Helpful guidance for the admin
      setupComplete:
        diag.tokenPresent &&
        !!diag.resolvedStrategy &&
        diag.resolvedStrategy.published,
      nextSteps: getNextSteps(diag, strategies),
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
  strategies: Awaited<ReturnType<typeof listStrategies>>
): string[] {
  const steps: string[] = [];
  if (!diag.tokenPresent) {
    steps.push("أضف META_API_TOKEN في ملف .env (توكن JWT بصلاحية copyfactory-api:writer)");
  }
  if (diag.strategiesCount === 0) {
    steps.push("أنشئ CopyFactory Strategy في لوحة MetaApi (CopyFactory → Strategies → New)");
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
