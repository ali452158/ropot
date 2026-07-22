import "dotenv/config";
import { config } from "dotenv";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
config();

const TOKEN = process.env.META_API_TOKEN!;
const d = new UndiciAgent({ connect: { rejectUnauthorized: false } });

async function main() {
  const domains = [
    "mt-provisioning.cloud-trail.com",
    "mt-provisioning-v1.cloud-trail.com",
    "provisioning.cloud-trail.com",
    "mt-provisioning-v1.agiliumtrade.ai",
    "mt-provisioning.agiliumtrade.ai",
    "mt-client-api-v1.london.agiliumtrade.ai",
    "mt-client-api-v1.hong-kong.agiliumtrade.ai",
    "mt-client-api-v1.new-york.agiliumtrade.ai",
  ];

  for (const dom of domains) {
    try {
      // try /users/current/accounts (provisioning path)
      const r: any = await undiciFetch(`https://${dom}/users/current/accounts`, {
        headers: { "auth-token": TOKEN },
        // @ts-ignore
        dispatcher: d,
      });
      const text = await r.text();
      const isJson = text.trimStart().startsWith("{");
      console.log(`${r.status}  ${dom}  ${isJson ? "JSON" : "HTML"}  →  ${text.slice(0, 100).replace(/\n/g, " ")}`);
    } catch (e: any) {
      console.log(`ERR  ${dom}  →  ${(e?.cause?.code || e?.message || e).toString().slice(0, 80)}`);
    }
  }
}
main();
