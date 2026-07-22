/**
 * Generate test activation codes directly into the SQLite DB.
 *
 * Usage:
 *   npx tsx scripts/generate-test-codes.ts [count]
 *
 * Default count = 3.
 */
import { PrismaClient } from "@prisma/client";
import { generateActivationCode } from "../src/lib/codes";

async function main() {
  const count = Math.min(Number(process.argv[2] || 3), 20);
  const prisma = new PrismaClient();
  try {
    const created = [];
    for (let i = 0; i < count; i++) {
      const code = generateActivationCode();
      const row = await prisma.activationCode.create({
        data: {
          code,
          status: "UNUSED",
          createdBy: "manual-test",
          notes: "Test code generated for user trial",
        },
      });
      created.push(row);
    }
    console.log("\n=== Generated Test Activation Codes ===");
    console.log("Format: ALFA-XXXX-XXXX-XXXX  |  validity: 30 days from first activation\n");
    for (const c of created) {
      console.log("  " + c.code);
    }
    console.log("\n=== Total: " + created.length + " code(s) ===\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
