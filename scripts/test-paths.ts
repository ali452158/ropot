import "dotenv/config";
import { config } from "dotenv";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
config();

const TOKEN = process.env.META_API_TOKEN!;
const DOMAIN = process.env.META_API_DOMAIN!;
const d = new UndiciAgent({ connect: { rejectUnauthorized: false } });

async function main() {
  const paths = [
    "/users/current/accounts",
    "/v1/users/current/accounts",
    "/api/v1/users/current/accounts",
    "/provisioning/v1/users/current/accounts",
  ];

  for (const p of paths) {
    try {
      const r: any = await undiciFetch(`https://${DOMAIN}${p}`, {
        headers: { "auth-token": TOKEN },
        // @ts-ignore
        dispatcher: d,
      });
      const text = await r.text();
      const snippet = text.slice(0, 100).replace(/\n/g, " ");
      console.log(`${r.status}  ${p}  →  ${snippet}`);
    } catch (e: any) {
      console.log(`ERR  ${p}  →  ${(e?.cause?.code || e?.message || e).toString().slice(0, 80)}`);
    }
  }
}
main();
