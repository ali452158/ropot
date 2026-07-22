/**
 * Server-side helpers for device fingerprinting and MT5 password hashing.
 * We never store MT5 plain-text passwords. We hash with a server-side salt
 * and store only the hash. The plain password is forwarded to MetaAPI only
 * at provisioning time and discarded immediately after.
 */
import { createHash, scryptSync, randomBytes } from "crypto";
import { db } from "./db";

const SALT_LEN = 16;
const KEY_LEN = 32;

/** Hash a password with a fresh salt; returns "salt:hash" */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LEN).toString("hex");
  return `${salt}:${derived}`;
}

/** Verify a plain password against a stored "salt:hash" */
export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = scryptSync(plain, salt, KEY_LEN).toString("hex");
    // constant-time compare
    if (derived.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) {
      diff |= derived.charCodeAt(i) ^ hash.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/** Build a deterministic device fingerprint from request metadata */
export function buildDeviceFingerprint(headers: Headers, ip: string): string {
  const ua = headers.get("user-agent") || "unknown-ua";
  const lang = headers.get("accept-language") || "unknown-lang";
  const enc = headers.get("accept-encoding") || "unknown-enc";
  const raw = [ip, ua, lang, enc].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/** Get client IP from request headers (with common proxy support) */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "0.0.0.0"
  );
}

/** Get or create a system setting */
export async function getSetting(key: string): Promise<string | null> {
  const row = await db.systemSetting.findUnique({ where: { id: key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { id: key },
    update: { value },
    create: { id: key, value },
  });
}
