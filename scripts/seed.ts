/**
 * Seed script — creates a few test activation codes so we can verify
 * the activation flow end-to-end without the Telegram bot.
 *
 * Run: bun run /home/z/my-project/scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { generateActivationCode } from "../src/lib/codes";

const db = new PrismaClient();

async function main() {
  // Clean in dependency order
  await db.trade.deleteMany();
  await db.botConfig.deleteMany();
  await db.mT5Session.deleteMany();
  await db.activationCode.deleteMany();

  // Create 3 unused codes
  const codes: string[] = [];
  for (let i = 0; i < 3; i++) {
    let code = generateActivationCode();
    while (codes.includes(code)) {
      code = generateActivationCode();
    }
    codes.push(code);
    await db.activationCode.create({
      data: {
        code,
        status: "UNUSED",
        createdBy: "seed-script",
        notes: "test code",
      },
    });
  }

  console.log("✅ Seed complete. Created codes:");
  for (const c of codes) {
    console.log("  ", c);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
