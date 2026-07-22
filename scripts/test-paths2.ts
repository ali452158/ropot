import "dotenv/config";
import { config } from "dotenv";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
config();

const TOKEN = process.env.META_API_TOKEN!;
const d = new UndiciAgent({ connect: { rejectUnauthorized: false } });

async function main() {
  // Try v1 / v2 prefixes on the client API domain (which we know works)
  const client = "mt-client-api-v1.new-york.agiliumtrade.ai";
  const paths = [
    "/v1/users/current/accounts",
    "/v2/users/current/accounts",
    "/users/current/accounts",
    // MetaApi actual endpoint patterns
    "/users/current/connections",
    "/v1/users/current/connections",
    // Try the real account-management paths
    "/accounts",
    "/v1/accounts",
  ];

  for (const p of paths) {
    try {
      const r: any = await (undiciFetch as any)(`https://${client}${p}`, {
        headers: { "auth-token": TOKEN },
        dispatcher: d,
      });
      const text = await r.text();
      const isJson = text.trimStart().startsWith("{");
      console.log(`${r.status}  ${p}  ${isJson ? "JSON" : "HTML"}  →  ${text.slice(0, 100).replace(/\n/g, " ")}`);
    } catch (e: any) {
      console.log(`ERR  ${p}  →  ${(e?.cause?.code || e?.message).toString().slice(0, 80)}`);
    }
  }
}
main();
