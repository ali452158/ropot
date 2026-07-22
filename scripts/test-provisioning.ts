import "dotenv/config";
import { config } from "dotenv";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
config();

const TOKEN = process.env.META_API_TOKEN!;
const d = new UndiciAgent({ connect: { rejectUnauthorized: false } });

async function main() {
  // Try the working client API domains with /v1 prefix and provisioning path
  const tests: Array<[string, string]> = [
    ["mt-client-api-v1.new-york.agiliumtrade.ai", "/v1/users/current/accounts"],
    ["mt-client-api-v1.new-york.agiliumtrade.ai", "/users/current/accounts"],
    ["mt-client-api-v1.new-york.agiliumtrade.ai", "/"],
    ["mt-client-api-v1.new-york.agiliumtrade.ai", "/users/current"],
    ["mt-client-api-v1.new-york.agiliumtrade.ai", "/accounts"],
    // Also try the configured domain with /v1
    ["agiliumtrade.agiliumtrade.ai", "/v1/users/current/accounts"],
    ["agiliumtrade.agiliumtrade.ai", "/api/v1/users/current/accounts"],
  ];

  for (const [dom, path] of tests) {
    try {
      const r: any = await undiciFetch(`https://${dom}${path}`, {
        headers: { "auth-token": TOKEN },
        // @ts-ignore
        dispatcher: d,
      });
      const text = await r.text();
      const isJson = text.trimStart().startsWith("{");
      console.log(`${r.status}  ${dom}${path}  ${isJson ? "JSON" : "HTML"}  →  ${text.slice(0, 150).replace(/\n/g, " ")}`);
    } catch (e: any) {
      console.log(`ERR  ${dom}${path}  →  ${(e?.cause?.code || e?.message || e).toString().slice(0, 80)}`);
    }
  }
}
main();
