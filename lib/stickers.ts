import { and, desc, eq } from "drizzle-orm";
import type { StickerSetType } from "./botapi";
import { db } from "./db";
import { botStickerSets } from "./db/schema";
import { getTelegramAccountById } from "./telegram-accounts";

export type StickerSetRow = typeof botStickerSets.$inferSelect;

/** Telegram requires every set a bot creates to end in `_by_<bot username>` (case-insensitive). */
export function fullStickerSetName(short: string, botUsername: string): string {
  return `${short}_by_${botUsername}`;
}

export function isOwnStickerSetName(name: string, botUsername: string): boolean {
  return name.toLowerCase().endsWith(`_by_${botUsername.toLowerCase()}`);
}

/** The Telegram user that owns sets created through this dashboard session: the active linked account. */
export function stickerOwnerId(telegramAccountId: string): number | null {
  const account = getTelegramAccountById(telegramAccountId);
  return account ? Number(account.telegramId) : null;
}

export function listStickerSets(botId: number): StickerSetRow[] {
  return db.select().from(botStickerSets).where(eq(botStickerSets.botId, botId)).orderBy(desc(botStickerSets.createdAt)).all();
}

/** Scoped to the bot, so a set stored for another bot returns undefined (-> 404). */
export function getStickerSetRow(botId: number, name: string): StickerSetRow | undefined {
  return db
    .select()
    .from(botStickerSets)
    .where(and(eq(botStickerSets.botId, botId), eq(botStickerSets.name, name)))
    .all()[0];
}

export function saveStickerSetRow(botId: number, set: { name: string; title: string; type: StickerSetType }): void {
  db.insert(botStickerSets)
    .values({ botId, ...set, createdAt: new Date() })
    .onConflictDoUpdate({ target: [botStickerSets.botId, botStickerSets.name], set: { title: set.title, type: set.type } })
    .run();
}

export function removeStickerSetRow(botId: number, name: string): void {
  db.delete(botStickerSets).where(and(eq(botStickerSets.botId, botId), eq(botStickerSets.name, name))).run();
}
