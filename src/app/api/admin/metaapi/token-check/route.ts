import { NextRequest, NextResponse } from "next/server";
import {
  inspectMetaApiToken,
  listMetaApiAccounts,
  getMetaApiHosts,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metaapi/token-check
 *
 * Decodes the META_API_TOKEN JWT locally (no signature verification — we trust
 * the operator pasted it from the MetaApi dashboard) and reports:
 *
 *   - Whether the token is present and not expired.
 *   - Every accessRule in the token (api id / methods / roles / resources /
 *     scope = ALL|LIMITED).
 *   - Derived booleans for the permissions that matter to our app:
 *       provisioningApiAll  → can auto-provision new MetaApi accounts
 *       copyfactoryApiAll   → can drive CopyFactory programmatically
 *       mtManagerApiAll     → can trade on any account
 *       metaapiRestApiAll   → can read candles/prices from any account
 *   - canAutoProvision and canUseCopyFactory convenience flags.
 *   - Live probe results: tries to actually call GET /users/current/accounts
 *     on the provisioning API and reports the HTTP status, so the admin can
 *     see whether the token works in practice (not just on paper).
 *
 * Auth: X-Admin-Token header must match ADMIN_API_TOKEN env var.
 */
export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const inspection = inspectMetaApiToken();
  const hosts = getMetaApiHosts();

  // Live probe: try listing accounts. This validates that the token actually
  // works against the provisioning API, not just that it decodes.
  let liveProbe: {
    attempted: boolean;
    httpStatus?: number;
    ok?: boolean;
    accountsCount?: number;
    error?: string;
  } = { attempted: false };
  if (inspection.present && !inspection.expired) {
    liveProbe.attempted = true;
    try {
      const accounts = await listMetaApiAccounts();
      liveProbe.ok = true;
      liveProbe.httpStatus = 200;
      liveProbe.accountsCount = accounts.length;
    } catch (e: any) {
      liveProbe.ok = false;
      liveProbe.error = e?.message || String(e);
    }
  }

  // Build a human-readable "what to do next" message.
  const nextSteps: string[] = [];
  if (!inspection.present) {
    nextSteps.push("META_API_TOKEN غير مضبوط في .env — أضف التوكن من لوحة MetaApi.");
  } else if (inspection.expired) {
    nextSteps.push("التوكن منتهي الصلاحية — أنشئ توكن جديد من لوحة MetaApi.");
  } else {
    if (!inspection.permissions.provisioningApi) {
      nextSteps.push(
        "أضف صلاحية Provisioning API (metaapi-provisioning-api) بدور writer على كل الموارد (*:$USER_ID$:*) لتشغيل الربط التلقائي للمشتركين."
      );
    } else if (!inspection.permissions.provisioningApiAll) {
      nextSteps.push(
        "صلاحية Provisioning API موجودة لكنها مقتصرة على حساب واحد فقط — وسّعها لتشمل كل الموارد (*:$USER_ID$:*)."
      );
    }
    if (!inspection.permissions.copyfactoryApi) {
      nextSteps.push(
        "أضف صلاحية CopyFactory API (copyfactory-api) بدور writer على *:$USER_ID$:*."
      );
    } else if (!inspection.permissions.copyfactoryApiAll) {
      nextSteps.push(
        "صلاحية CopyFactory API موجودة لكنها مقتصرة — وسّعها لتشمل *:$USER_ID$:*."
      );
    }
    if (!inspection.permissions.mtManagerApiAll) {
      nextSteps.push(
        "أضف صلاحية MT Manager API (mt-manager-api) بدور writer على *:$USER_ID$:* لتنفيذ الصفقات على حسابات المشتركين."
      );
    }
    if (
      inspection.permissions.provisioningApiAll &&
      inspection.permissions.copyfactoryApiAll &&
      inspection.permissions.mtManagerApiAll
    ) {
      nextSteps.push("التوكن يحتوي على كل الصلاحيات المطلوبة ✅ — الربط التلقائي جاهز.");
    }
  }

  return NextResponse.json({
    ok: true,
    token: inspection,
    hosts,
    liveProbe,
    nextSteps,
  });
}
