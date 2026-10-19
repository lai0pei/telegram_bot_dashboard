import { eq } from "drizzle-orm";
import { db } from "./db";
import { telegramAccounts } from "./db/schema";
import { encrypt } from "./crypto";
import type { Api } from "teleproto/tl";

export type TelegramAccountRow = typeof telegramAccounts.$inferSelect;

export function getTelegramAccountById(id: string): TelegramAccountRow | undefined {
  return db.select().from(telegramAccounts).where(eq(telegramAccounts.id, id)).all()[0];
}

export function getTelegramAccountByTelegramId(telegramId: string): TelegramAccountRow | undefined {
  return db.select().from(telegramAccounts).where(eq(telegramAccounts.telegramId, telegramId)).all()[0];
}

export function listTelegramAccountsForUser(ownerUserId: string): TelegramAccountRow[] {
  return db.select().from(telegramAccounts).where(eq(telegramAccounts.ownerUserId, ownerUserId)).all();
}

/**
 * Upserts by telegramId: a brand-new Telegram ID gets a fresh row owned by
 * `ownerUserId`; a row left unclaimed by the one-time migration (owner_user_id
 * IS NULL) is claimed by `ownerUserId` rather than duplicated, so a migrated
 * account's bots/chats/messages reappear once someone binds it again.
 * Caller (lib/mtproto.ts finishLogin) must already have checked that an
 * *owned* row with this telegramId, if any, belongs to this same owner.
 */
export function upsertTelegramAccount(info: {
  ownerUserId: string;
  telegramId: string;
  sessionString: string;
  me: Api.User;
}): string {
  const now = new Date();
  const existing = getTelegramAccountByTelegramId(info.telegramId);
  const values = {
    encryptedSessionString: encrypt(info.sessionString),
    username: info.me.username ?? null,
    firstName: info.me.firstName ?? null,
    lastName: info.me.lastName ?? null,
    phone: info.me.phone ?? null,
    updatedAt: now,
  };
  if (existing) {
    db.update(telegramAccounts)
      .set({ ...values, ownerUserId: info.ownerUserId })
      .where(eq(telegramAccounts.id, existing.id))
      .run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.insert(telegramAccounts)
    .values({ id, ownerUserId: info.ownerUserId, telegramId: info.telegramId, ...values, createdAt: now })
    .run();
  return id;
}

export function deleteTelegramAccount(id: string): void {
  db.delete(telegramAccounts).where(eq(telegramAccounts.id, id)).run();
}

/** True if this Telegram ID is already linked to a *different* dashboard user. */
export function isTelegramAccountLinkedToAnotherUser(telegramId: string, ownerUserId: string): boolean {
  const existing = getTelegramAccountByTelegramId(telegramId);
  return !!existing && existing.ownerUserId !== null && existing.ownerUserId !== ownerUserId;
}
