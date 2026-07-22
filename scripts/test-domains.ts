import "dotenv/config";
import { config } from "dotenv";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
config();

const TOKEN = process.env.META_API_TOKEN!;
const d = new UndiciAgent({ connect: { rejectUnauthorized: false } });

async function main() {
  const domains = [
    "api.metaapi.cloud",
    "v1.api.metaapi.cloud",
    "mt-provisioning.cloud-trail.com",
    "mt-client-api-v1.new-york.agiliumtrade.ai",
    "mt-client-api-v1.eu.agiliumtrade.ai",
    "app.metaapi.cloud",
    "trading-account-management-api.metaapi.cloud",
  ];

  for (const dom of domains) {
    try {
      const r: any = await undiciFetch(`https://${dom}/users/current/accounts`, {
        headers: { "auth-token": TOKEN },
        // @ts-ignore
        dispatcher: d,
      });
      const text = await r.text();
      console.log(`${r.status}  ${dom}  →  ${text.slice(0, 150).replace(/\n/g, " ")}`);
    } catch (e: any) {
      console.log(`ERR  ${dom}  →  ${(e?.cause?.code || e?.message || e).toString().slice(0, 80)}`);
    }
  }
}
main();
