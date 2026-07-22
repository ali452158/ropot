/**
 * Generate the ALFA Reports mascot robot image.
 *
 * Style: black background, neon blue accents, futuristic, sleek — matches the
 * dashboard's black/white/cyan-neon design system.
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const PROMPT = [
  "Futuristic AI trading robot mascot, sleek humanoid robot head and shoulders",
  "front view, glowing cyan neon blue eyes and circuit lines",
  "pure black background, neon blue and white color scheme only",
  "metallic chrome silver armor plating with cyan glowing accents",
  "holographic trading charts faintly reflected in the helmet visor",
  "high-tech futuristic design, sci-fi, cyberpunk aesthetic",
  "centered composition, dramatic cinematic lighting, rim light in cyan",
  "professional 3D render, octane render, ultra detailed, 8k quality",
  "minimalist, clean, premium tech product look",
].join(", ");

async function main() {
  const outDir = "/home/z/my-project/public";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "alfa-robot.png");

  console.log("Initializing ZAI...");
  const zai = await ZAI.create();

  console.log("Generating robot image (1024x1024)...");
  console.log("Prompt:", PROMPT.slice(0, 120) + "...");

  const response = await zai.images.generations.create({
    prompt: PROMPT,
    size: "1024x1024",
  });

  if (!response.data || !response.data[0] || !response.data[0].base64) {
    throw new Error("Invalid response from image generation API");
  }

  const base64 = response.data[0].base64;
  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync(outPath, buffer);

  console.log(`\n✓ Robot image saved: ${outPath}`);
  console.log(`  Size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
