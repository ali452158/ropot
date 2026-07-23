import { NextRequest, NextResponse } from "next/server";
import {
  listMetaApiAccounts,
  deleteMetaApiAccount,
  getMasterLogin,
  getCachedMasterMetaApiAccountId,
} from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metaapi/accounts
 *   Lists all MetaApi accounts provisioned under the current token.
 *
 * DELETE /api/admin/metaapi/accounts?id=<accountId>
 *   Deletes a MetaApi account by ID (frees a quota slot on the MetaApi plan).
 *   Refuses to delete the master account (configured via META_API_MASTER_LOGIN).
 *
 * Auth: X-Admin-Token header must match ADMIN_API_TOKEN env var.
 */
async function checkAuth(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  if (!adminToken || incoming !== adminToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authErr = await checkAuth(req);
  if (authErr) return authErr;

  const accounts = await listMetaApiAccounts();
  const masterLogin = getMasterLogin();
  const masterId = getCachedMasterMetaApiAccountId();

  // Tag each account with its role
  const tagged = accounts.map((a) => ({
    ...a,
    role: a.login === masterLogin || a.id === masterId ? "MASTER" : "SUBSCRIBER",
  }));

  return NextResponse.json({
    ok: true,
    count: tagged.length,
    masterLogin,
    masterId,
    accounts: tagged,
  });
}

export async function DELETE(req: NextRequest) {
  const authErr = await checkAuth(req);
  if (authErr) return authErr;

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing ?id=<accountId>" },
      { status: 400 }
    );
  }

  // Prevent deleting the master account
  const masterId = getCachedMasterMetaApiAccountId();
  if (id === masterId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "لا يمكن حذف الحساب الرئيسي (Master). غيّر META_API_MASTER_LOGIN في .env أولاً إن أردت تغيير الحساب الرئيسي.",
      },
      { status: 400 }
    );
  }

  const result = await deleteMetaApiAccount(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, deleted: id });
}
