import { eq } from "drizzle-orm";
import { db } from "./db";
import { telegramAccounts } from "./db/schema";
import { encrypt } from "./crypto";
import type { Api } from "teleproto/tl";

export type TelegramAccountRow = typeof telegramAccounts.$inferSelect;

/** Thrown for any MTProto use of an account whose Telegram session has ended; errorResponse maps it to 409 SESSION_REVOKED. */
export class TelegramSessionRevokedError extends Error {
  constructor() {
    super("This Telegram account's session was ended from another device. Scan a QR code to link it again.");
  }
}

export async function markTelegramAccountRevoked(id: string): Promise<void> {
  await db.update(telegramAccounts).set({ revokedAt: new Date() }).where(eq(telegramAccounts.id, id));
}

export async function getTelegramAccountById(id: string): Promise<TelegramAccountRow | undefined> {
  return (await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, id)))[0];
}

export async function getTelegramAccountByTelegramId(telegramId: string): Promise<TelegramAccountRow | undefined> {
  return (await db.select().from(telegramAccounts).where(eq(telegramAccounts.telegramId, telegramId)))[0];
}

export async function listTelegramAccountsForUser(ownerUserId: string): Promise<TelegramAccountRow[]> {
  return await db.select().from(telegramAccounts).where(eq(telegramAccounts.ownerUserId, ownerUserId));
}

/** The account a session should fall back to: the most recently updated one whose session is still alive. */
export async function pickDefaultTelegramAccountId(ownerUserId: string, excludeId?: string): Promise<string | null> {
  return (
    (await listTelegramAccountsForUser(ownerUserId))
      .filter((a) => !a.revokedAt && a.id !== excludeId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.id ?? null
  );
}

/**
 * Upserts by telegramId: a brand-new Telegram ID gets a fresh row owned by
 * `ownerUserId`; a row left unclaimed by the one-time migration (owner_user_id
 * IS NULL) is claimed by `ownerUserId` rather than duplicated, so a migrated
 * account's bots/chats/messages reappear once someone binds it again.
 * Caller (lib/mtproto.ts finishLogin) must already have checked that an
 * *owned* row with this telegramId, if any, belongs to this same owner.
 */
export async function upsertTelegramAccount(info: {
  ownerUserId: string;
  telegramId: string;
  sessionString: string;
  me: Api.User;
}): Promise<string> {
  const now = new Date();
  const values = {
    encryptedSessionString: encrypt(info.sessionString),
    username: info.me.username ?? null,
    firstName: info.me.firstName ?? null,
    lastName: info.me.lastName ?? null,
    phone: info.me.phone ?? null,
    revokedAt: null,
    updatedAt: now,
  };
  // One statement keyed on the unique telegram_id: an existing row (owned or unclaimed) keeps its id and is re-bound.
  const [row] = await db
    .insert(telegramAccounts)
    .values({ id: crypto.randomUUID(), ownerUserId: info.ownerUserId, telegramId: info.telegramId, ...values, createdAt: now })
    .onConflictDoUpdate({
      target: telegramAccounts.telegramId,
      set: { ...values, ownerUserId: info.ownerUserId },
    })
    .returning({ id: telegramAccounts.id });
  return row.id;
}

export async function deleteTelegramAccount(id: string): Promise<void> {
  await db.delete(telegramAccounts).where(eq(telegramAccounts.id, id));
}

/** True if this Telegram ID is already linked to a *different* dashboard user. */
export async function isTelegramAccountLinkedToAnotherUser(telegramId: string, ownerUserId: string): Promise<boolean> {
  const existing = await getTelegramAccountByTelegramId(telegramId);
  return !!existing && existing.ownerUserId !== null && existing.ownerUserId !== ownerUserId;
}

export async function setDigestSettings(
  id: string,
  settings: { digestFrequency: "off" | "daily" | "weekly"; digestHour: number }
): Promise<void> {
  await db.update(telegramAccounts)
    .set({ ...settings, updatedAt: new Date() })
    .where(eq(telegramAccounts.id, id));
}
