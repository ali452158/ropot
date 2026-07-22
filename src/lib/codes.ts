import { createHash, randomBytes, randomUUID } from "crypto";

/**
 * Generate a new monthly activation code.
 * Format: ALFA-XXXX-XXXX-XXXX (12 alphanumeric chars after prefix).
 */
export function generateActivationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I for clarity
  const block = (n: number) =>
    Array.from({ length: n })
      .map(() => alphabet[randomInt(alphabet.length)])
      .join("");
  return `ALFA-${block(4)}-${block(4)}-${block(4)}`;
}

function randomInt(maxExclusive: number): number {
  const buf = randomBytes(4);
  const n = buf.readUInt32BE(0);
  return n % maxExclusive;
}

export function hashDeviceFingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newSessionToken(): string {
  return randomUUID().replace(/-/g, "") + randomBytes(8).toString("hex");
}

/** Add `days` to a date and return ISO string */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Check if an ISO date is in the past */
export function isExpired(iso: string | Date | null): boolean {
  if (!iso) return true;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.getTime() < Date.now();
}

/** Days remaining until expiry (negative if expired) */
export function daysRemaining(iso: string | Date | null): number {
  if (!iso) return 0;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
