import { NextRequest, NextResponse } from "next/server";
import {
  findExistingMetaApiAccount,
  listMetaApiAccounts,
  isSimulationMode,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/check-provisioned
 * Body: { mt5Login: string }
 *
 * Admin-only endpoint used by the Telegram bot / admin panel to verify
 * whether a subscriber's MT5 login is already provisioned in MetaApi.
 *
 * Returns:
 *   { ok: true, provisioned: true,  metaApiAccountId, state, connectionStatus }
 *   { ok: true, provisioned: false, message: "..." }
 *
 * This is useful when:
 *   - The MetaApi token lacks createAccount permission (free tier / reader token)
 *     and the admin needs to manually add the account in the dashboard first.
 *   - Verifying that a subscriber paid before generating a code.
 *   - Diagnosing 403 errors during subscriber login.
 */
export async function POST(req: NextRequest) {
  const adminToken =
    process.env.ADMIN_API_TOKEN || process.env.TELEGRAM_ADMIN_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  if (isSimulationMode()) {
    return NextResponse.json({
      ok: true,
      provisioned: false,
      simulation: true,
      message: "النظام في وضع المحاكاة — لا يوجد توكن MetaApi حقيقي.",
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mt5Login = String(body?.mt5Login || "").trim();
    if (!mt5Login) {
      return NextResponse.json(
        { ok: false, error: "mt5Login مطلوب" },
        { status: 400 }
      );
    }

    const accounts = await listMetaApiAccounts();
    const match = accounts.find((a) => a.login === String(mt5Login));

    if (!match) {
      return NextResponse.json({
        ok: true,
        provisioned: false,
        message: `حساب MT5 ${mt5Login} غير مضاف في MetaApi. ` +
          `أضفه من لوحة تحكم MetaApi (Add Account) أو استخدم توكن بصلاحية createAccount.`,
      });
    }

    return NextResponse.json({
      ok: true,
      provisioned: true,
      metaApiAccountId: match.id,
      login: match.login,
      server: match.server,
      state: match.state,
      connectionStatus: match.connectionStatus,
      region: match.region,
      name: match.name,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

/** GET — list ALL provisioned MetaApi accounts (admin diagnostic). */
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

  if (isSimulationMode()) {
    return NextResponse.json({
      ok: true,
      simulation: true,
      accounts: [],
    });
  }

  try {
    const accounts = await listMetaApiAccounts();
    return NextResponse.json({
      ok: true,
      count: accounts.length,
      accounts,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
