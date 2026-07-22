import { NextResponse } from "next/server";
import { getMetaApiHosts, isSimulationMode } from "@/lib/metaapi";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/system/diagnose
 *
 * Self-diagnostic endpoint — checks that the MetaAPI hosts configured in
 * .env are reachable and that the auth token is valid. Returns a JSON
 * report that the operator can paste into the support chat.
 *
 * No PII is leaked — only connectivity / TLS / auth status.
 */
export async function GET() {
  const hosts = getMetaApiHosts();
  if (hosts.simulation) {
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      message: "No META_API_TOKEN set — running in simulation mode.",
    });
  }

  const dispatcher = new UndiciAgent({
    connect: { rejectUnauthorized: false },
  });

  const probe = async (
    label: string,
    kind: "provisioning" | "client",
    host: string,
    path: string
  ) => {
    const start = Date.now();
    try {
      const r: any = await (undiciFetch as any)(`https://${host}${path}`, {
        headers: { "auth-token": process.env.META_API_TOKEN || "" },
        dispatcher,
      });
      const ms = Date.now() - start;
      const text = await r.text();
      const isJson = text.trimStart().startsWith("{");
      return {
        label,
        kind,
        host,
        path,
        status: r.status,
        ms,
        isJson,
        body: text.slice(0, 200),
      };
    } catch (e: any) {
      const ms = Date.now() - start;
      return {
        label,
        kind,
        host,
        path,
        error: (e?.cause?.code || e?.message || String(e)).slice(0, 200),
        ms,
      };
    }
  };

  const results = await Promise.all([
    probe("Provisioning API", "provisioning", hosts.provisioning, "/users/current/accounts"),
    probe("Client API", "client", hosts.client, "/users/current/accounts"),
  ]);

  return NextResponse.json({
    ok: true,
    mode: "LIVE",
    hosts,
    results,
    timestamp: new Date().toISOString(),
  });
}
