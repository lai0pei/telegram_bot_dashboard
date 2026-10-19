import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { botMessages, botUsers, bots } from "./db/schema";
import { decrypt, encrypt } from "./crypto";
import { fetchBotToken } from "./botfather";
import { BotApiError } from "./botapi";
import { singleFlight } from "./single-flight";

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

/** How long a just-healed token is trusted before a renewed 401 is allowed to re-trigger BotFather. */
const HEAL_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Runs `fn` with the bot's stored token. If it fails with a 401 — meaning
 * the token was revoked, whether through this dashboard or directly via
 * BotFather/Telegram — the stored token is stale rather than just
 * temporarily unavailable, so this clears it, re-fetches the current one
 * from BotFather, saves it, and retries `fn` once with the fresh token.
 *
 * The re-fetch is single-flighted and cooldown-gated per bot: concurrent
 * callers (e.g. the same page load fetching several Bot API methods) share
 * one BotFather round trip, and a token healed within the last
 * `HEAL_COOLDOWN_MS` that 401s again is surfaced as an error instead of
 * triggering another one — otherwise a token BotFather hands back still
 * dead would re-open a BotFather conversation on every single request.
 */
export async function withLiveBotToken<T>(
  bot: BotRow,
  userId: string,
  fn: (token: string) => Promise<T>
): Promise<{ result: T; token: string }> {
  const token = getBotToken(bot);
  if (!token) {
    const fetched = await healToken(bot, userId);
    return { result: await fn(fetched), token: fetched };
  }

  try {
    return { result: await fn(token), token };
  } catch (err) {
    if (!(err instanceof BotApiError) || err.errorCode !== 401) throw err;

    const recentlyHealed = bot.tokenFetchedAt && Date.now() - bot.tokenFetchedAt.getTime() < HEAL_COOLDOWN_MS;
    if (recentlyHealed) throw err;

    const fetched = await healToken(bot, userId);
    return { result: await fn(fetched), token: fetched };
  }
}

function healToken(bot: BotRow, userId: string): Promise<string> {
  return singleFlight(`heal-token:${bot.id}`, async () => {
    clearBotToken(bot.id);
    const fetched = await fetchBotToken(userId, bot.username);
    saveBotToken(bot.id, fetched);
    return fetched;
  });
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
  db.transaction((tx) => {
    tx.delete(botMessages).where(eq(botMessages.botId, id)).run();
    tx.delete(botUsers).where(eq(botUsers.botId, id)).run();
    tx.delete(bots).where(eq(bots.id, id)).run();
  });
}

/** Removes local rows for bots Telegram no longer lists as owned by this user (e.g. deleted from a phone). */
export function pruneBotsNotIn(ownerUserId: string, telegramIds: Set<string>): void {
  for (const bot of listBots(ownerUserId)) {
    if (!telegramIds.has(bot.telegramId)) deleteBotRow(bot.id);
  }
}

/** Every monitored bot across all users — used only by the background poller. */
export function listAllMonitoredBots(): BotRow[] {
  return db.select().from(bots).where(eq(bots.monitorEnabled, true)).all();
}
