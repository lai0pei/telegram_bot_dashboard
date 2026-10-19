import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing via Node's built-in scrypt — no native dependency to add
 * on top of an already carefully pinned package.json (bcrypt/argon2 would
 * both need a new native build step in the Docker image).
 * Stored format: "scrypt:N:r:p:<saltHex>:<hashHex>".
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt:${N}:${R}:${P}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Runs a dummy scrypt hash so "unknown username" and "wrong password" take the same time. */
function dummyHash(password: string): void {
  scryptSync(password, "dashboard-dummy-salt", KEY_LENGTH, { N, r: R, p: P });
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) {
    dummyHash(password);
    return false;
  }
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    dummyHash(password);
    return false;
  }
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
