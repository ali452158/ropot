import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createStrategy,
  listStrategies,
  getStrategy,
  updateStrategy,
  getConfiguredStrategyId,
} from "@/lib/copyfactory";
import { getMasterMetaApiAccountId, getMasterLogin } from "@/lib/metaapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin endpoints for managing the master CopyFactory strategy.
 *
 * POST /api/admin/copyfactory/strategy
 *   Body: { name?: string, description?: string, published?: boolean }
 *   - Resolves the master MetaApi account ID (from META_API_MASTER_LOGIN).
 *   - Creates a CopyFactory strategy bound to that account.
 *   - Persists the strategy ID to the SystemSetting table so subscribers
 *     can fetch it via /api/copyfactory/strategy-info.
 *
 * GET /api/admin/copyfactory/strategy
 *   - Returns the current strategy (from env, or the first one listed).
 *
 * PUT /api/admin/copyfactory/strategy
 *   Body: { strategyId, name?, description?, published? }
 *   - Updates the strategy's published flag / name / description.
 *
 * Auth: x-admin-token header must match ADMIN_API_TOKEN env var.
 */
async function checkAuth(req: NextRequest): Promise<boolean> {
  const adminToken =
    process.env.ADMIN_API_TOKEN || process.env.TELEGRAM_ADMIN_TOKEN;
  const incoming = req.headers.get("x-admin-token") || "";
  return !!adminToken && incoming === adminToken;
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  try {
    const configuredId = getConfiguredStrategyId();
    let strategy = configuredId ? await getStrategy(configuredId) : null;
    if (!strategy) {
      const list = await listStrategies();
      strategy = list[0] || null;
    }
    const persistedId = await getStoredStrategyId();
    return NextResponse.json({
      ok: true,
      configuredStrategyId: configuredId,
      persistedStrategyId: persistedId,
      strategy,
      master: {
        login: getMasterLogin(),
        metaApiAccountId: await getMasterMetaApiAccountId(),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "ALFA Reports — Gold Strategy").trim();
    const description = String(
      body?.description ||
        "ALFA Reports automated gold (XAUUSD) trading strategy. Subscribers copy all master trades automatically."
    ).trim();
    const published = body?.published !== false; // default true

    // 1) Resolve the master MetaApi account ID.
    const masterLogin = getMasterLogin();
    if (!masterLogin) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "META_API_MASTER_LOGIN not set in .env. Cannot create strategy without a master account.",
        },
        { status: 400 }
      );
    }
    const accountId = await getMasterMetaApiAccountId();
    if (!accountId) {
      return NextResponse.json(
        {
          ok: false,
          error: `Master MetaApi account not found for login ${masterLogin}. ` +
            `Make sure the master account is provisioned in app.metaapi.cloud first.`,
        },
        { status: 404 }
      );
    }

    // 2) Idempotency: if a strategy already exists for this account, reuse it.
    const existing = await listStrategies();
    const existingForAccount = existing.find((s) => s.accountId === accountId);
    if (existingForAccount) {
      await storeStrategyId(existingForAccount._id);
      return NextResponse.json({
        ok: true,
        message: "Strategy already exists — reusing it.",
        strategyId: existingForAccount._id,
        strategy: existingForAccount,
        reused: true,
      });
    }

    // 3) Create the strategy.
    const result = await createStrategy({
      name,
      description,
      accountId,
      accountLogin: masterLogin,
      published,
    });
    if (!result.strategyId) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Failed to create strategy",
          raw: result.raw,
        },
        { status: 502 }
      );
    }

    // 4) Persist the strategy ID so subscribers can fetch it.
    await storeStrategyId(result.strategyId);

    return NextResponse.json({
      ok: true,
      message: "Strategy created successfully",
      strategyId: result.strategyId,
      master: { login: masterLogin, metaApiAccountId: accountId },
      published,
      nextStep: `أضف COPYFACTORY_STRATEGY_ID=${result.strategyId} إلى ملف .env ثم أعد تشغيل الحاوية.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const strategyId = String(body?.strategyId || getConfiguredStrategyId());
    if (!strategyId) {
      return NextResponse.json(
        { ok: false, error: "strategyId required (set COPYFACTORY_STRATEGY_ID or pass in body)" },
        { status: 400 }
      );
    }
    const updates: {
      name?: string;
      description?: string;
      published?: boolean;
    } = {};
    if (typeof body?.name === "string") updates.name = body.name;
    if (typeof body?.description === "string") updates.description = body.description;
    if (typeof body?.published === "boolean") updates.published = body.published;
    const result = await updateStrategy(strategyId, updates);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, strategyId, updates });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
// SystemSetting helpers — store the strategy ID for public retrieval.
// ------------------------------------------------------------
const STRATEGY_SETTING_KEY = "copyfactory_strategy_id";

async function storeStrategyId(strategyId: string): Promise<void> {
  try {
    await db.systemSetting.upsert({
      where: { id: STRATEGY_SETTING_KEY },
      update: { value: strategyId },
      create: { id: STRATEGY_SETTING_KEY, value: strategyId },
    });
  } catch (e) {
    console.warn("[copyfactory/strategy] failed to persist strategy ID:", e);
  }
}

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
