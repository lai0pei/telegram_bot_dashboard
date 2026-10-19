import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest (MTProto session string, bot
 * tokens). Key is derived from APP_SECRET via SHA-256 so any length secret
 * works. Output format: base64(iv [12B] || authTag [16B] || ciphertext).
 */

function getKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "APP_SECRET is not set (or too short). Set a strong random value in .env — e.g. `openssl rand -hex 32`."
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Mask a secret for display, e.g. "123456:AAbc...wxyz" -> "123456:AA••••wxyz". */
export function maskSecret(value: string, visibleStart = 6, visibleEnd = 4): string {
  if (value.length <= visibleStart + visibleEnd) return "••••••";
  return `${value.slice(0, visibleStart)}••••${value.slice(-visibleEnd)}`;
}
