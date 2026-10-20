import { eq } from "drizzle-orm";
import { db } from "./db";
import { telegramAccounts } from "./db/schema";

/**
 * Telegram IDs of the master admin(s), from MASTER_ADMIN_TELEGRAM_IDS
 * (comma-separated). Unset or empty means *nobody* is an admin: the opposite
 * default from ALLOWED_TELEGRAM_USER_IDS, where empty means everyone.
 */
export function masterAdminTelegramIds(): Set<string> {
  const raw = process.env.MASTER_ADMIN_TELEGRAM_IDS ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function isMasterAdminTelegramId(telegramId: string): boolean {
  return masterAdminTelegramIds().has(telegramId);
}

/**
 * True when any Telegram account linked to this dashboard user is a master
 * admin's. Read from the database on every call and never stored in the
 * session cookie, so editing the env var, or unlinking the account, takes
 * effect on the next request. A revoked session still counts: the ID was
 * proven by QR scan when the account was linked, and ignoring `revokedAt`
 * means a session ended from the phone can't lock the admin out of the
 * screen that manages access.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const admins = masterAdminTelegramIds();
  if (admins.size === 0) return false;
  const linked = await db
    .select({ telegramId: telegramAccounts.telegramId })
    .from(telegramAccounts)
    .where(eq(telegramAccounts.ownerUserId, userId));
  return linked.some((a) => admins.has(a.telegramId));
}
