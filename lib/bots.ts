import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { bots } from "./db/schema";
import { decrypt, encrypt } from "./crypto";

export type BotRow = typeof bots.$inferSelect;

export function listBots(ownerUserId: string): BotRow[] {
  return db.select().from(bots).where(eq(bots.ownerUserId, ownerUserId)).all();
}

/** Scoped to the owner, so a bot ID that belongs to someone else returns undefined (-> 404). */
export function getBotById(id: number, ownerUserId: string): BotRow | undefined {
  return db
    .select()
    .from(bots)
    .where(and(eq(bots.id, id), eq(bots.ownerUserId, ownerUserId)))
    .all()[0];
}

export function getBotToken(bot: BotRow): string | null {
  return bot.encryptedToken ? decrypt(bot.encryptedToken) : null;
}

export function upsertBotFromTelegram(info: {
  ownerUserId: string;
  telegramId: string;
  username: string;
  firstName: string;
}): BotRow {
  const now = new Date();
  const existing = db
    .select()
    .from(bots)
    .where(and(eq(bots.ownerUserId, info.ownerUserId), eq(bots.telegramId, info.telegramId)))
    .all()[0];
  if (existing) {
    db.update(bots)
      .set({ username: info.username, firstName: info.firstName, updatedAt: now })
      .where(eq(bots.id, existing.id))
      .run();
    return { ...existing, username: info.username, firstName: info.firstName, updatedAt: now };
  }
  const result = db
    .insert(bots)
    .values({
      ownerUserId: info.ownerUserId,
      telegramId: info.telegramId,
      username: info.username,
      firstName: info.firstName,
      monitorEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();
  return result[0];
}

export function saveBotToken(id: number, token: string): void {
  db.update(bots)
    .set({ encryptedToken: encrypt(token), tokenFetchedAt: new Date(), updatedAt: new Date() })
    .where(eq(bots.id, id))
    .run();
}

export function clearBotToken(id: number): void {
  db.update(bots)
    .set({ encryptedToken: null, tokenFetchedAt: null, updatedAt: new Date() })
    .where(eq(bots.id, id))
    .run();
}

export function setMonitorEnabled(id: number, enabled: boolean): void {
  db.update(bots)
    .set({ monitorEnabled: enabled, updatedAt: new Date() })
    .where(eq(bots.id, id))
    .run();
}

export function setLastUpdateId(id: number, updateId: number): void {
  db.update(bots).set({ lastUpdateId: updateId }).where(eq(bots.id, id)).run();
}

export function deleteBotRow(id: number): void {
  db.delete(bots).where(eq(bots.id, id)).run();
}

/** Every monitored bot across all users — used only by the background poller. */
export function listAllMonitoredBots(): BotRow[] {
  return db.select().from(bots).where(eq(bots.monitorEnabled, true)).all();
}
