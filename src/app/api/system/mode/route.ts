import { NextResponse } from "next/server";
import { isSimulationMode } from "@/lib/metaapi";
import { getActiveSessionCount } from "@/lib/bot-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/system/mode — returns whether the bot is LIVE or in SIMULATION. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: isSimulationMode() ? "SIMULATION" : "LIVE",
    activeSessions: getActiveSessionCount(),
    timestamp: new Date().toISOString(),
    hasMetaApiToken: !isSimulationMode(),
  });
}
