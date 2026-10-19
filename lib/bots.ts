import { eq } from "drizzle-orm";
import { db } from "./db";
import { bots } from "./db/schema";
import { decrypt, encrypt } from "./crypto";

export type BotRow = typeof bots.$inferSelect;

export function listBots(): BotRow[] {
  return db.select().from(bots).all();
}

export function getBotById(id: number): BotRow | undefined {
  return db.select().from(bots).where(eq(bots.id, id)).all()[0];
}

export function getBotToken(bot: BotRow): string | null {
  return bot.encryptedToken ? decrypt(bot.encryptedToken) : null;
}

export function upsertBotFromTelegram(info: {
  telegramId: string;
  username: string;
  firstName: string;
}): BotRow {
  const now = new Date();
  const existing = db.select().from(bots).where(eq(bots.telegramId, info.telegramId)).all()[0];
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
