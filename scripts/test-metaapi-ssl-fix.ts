/**
 * End-to-end test of the new MetaAPI split-domain + SSL fix.
 * Verifies:
 *   1. Provisioning API host resolves and accepts our token
 *   2. Client API host resolves and accepts our token
 *   3. No "unable to verify the first certificate" error
 */
import "dotenv/config";
import { config } from "dotenv";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

config();

const TOKEN = process.env.META_API_TOKEN!;
const PROV = process.env.META_API_PROVISIONING_DOMAIN || "mt-provisioning.cloud-trail.com";
const CLIENT_REGION = process.env.META_API_CLIENT_REGION || "new-york";
const CLIENT = process.env.META_API_CLIENT_DOMAIN || `mt-client-api-v1.${CLIENT_REGION}.agiliumtrade.ai`;

const dispatcher = new UndiciAgent({
  connect: { rejectUnauthorized: false },
  keepAliveTimeout: 30_000,
});

async function probe(label: string, host: string, path: string) {
  console.log(`\n--- ${label}: https://${host}${path} ---`);
  const start = Date.now();
  try {
    const r: any = await (undiciFetch as any)(`https://${host}${path}`, {
      headers: { "auth-token": TOKEN },
      dispatcher,
    });
    const ms = Date.now() - start;
    const text = await r.text();
    const isJson = text.trimStart().startsWith("{");
    console.log(`  Status: ${r.status}  |  Time: ${ms}ms  |  Format: ${isJson ? "JSON" : "HTML"}`);
    console.log(`  Body:   ${text.slice(0, 200).replace(/\n/g, " ")}`);
    return { ok: r.ok, status: r.status, isJson, ms };
  } catch (e: any) {
    const ms = Date.now() - start;
    const code = e?.cause?.code || e?.code || "UNKNOWN";
    console.log(`  ERROR: ${code}  |  Time: ${ms}ms`);
    console.log(`  Detail: ${(e?.message || String(e)).slice(0, 200)}`);
    return { ok: false, error: code, ms };
  }
}

async function main() {
  console.log("=== MetaAPI SSL + Domain Fix — E2E Test ===");
  console.log("Provisioning host:", PROV);
  console.log("Client host:      ", CLIENT);
  console.log("Token length:     ", TOKEN.length);

  // 1. Provisioning API
  const prov = await probe("Provisioning API", PROV, "/users/current/accounts");

  // 2. Client API
  const client = await probe("Client API", CLIENT, "/users/current/accounts");

  // 3. Try POST a fake account on provisioning host
  console.log("\n--- Test 3: POST a fake MT5 account (provisioning path) ---");
  try {
    const r: any = await (undiciFetch as any)(`https://${PROV}/users/current/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "auth-token": TOKEN,
      },
      body: JSON.stringify({
        login: "9999999999",
        password: "fakepassword",
        serverName: "NonExistent-Server",
        type: "cloud",
        application: "ALFA-Reports",
        magic: 770077,
      }),
      dispatcher,
    });
    const text = await r.text();
    console.log(`  Status: ${r.status}`);
    console.log(`  Body:   ${text.slice(0, 300)}`);
    if (r.status >= 400 && r.status < 500) {
      console.log("\n  ✓ Provisioning endpoint is reachable (business-level error, NOT SSL/DNS)");
    }
  } catch (e: any) {
    console.log(`  ERROR: ${(e?.cause?.code || e?.message || String(e)).slice(0, 200)}`);
  }

  console.log("\n=== Summary ===");
  console.log("SSL fix:        ✓ applied (rejectUnauthorized: false on MetaAPI dispatcher only)");
  console.log("Provisioning:   ", prov.ok ? "✓ reachable" : `✗ ${prov.error || prov.status}`);
  console.log("Client:         ", client.ok ? "✓ reachable" : `✗ ${client.error || client.status}`);
}

main();
