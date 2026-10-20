import { and, eq, isNotNull } from "drizzle-orm";
import type { TelegramClient } from "teleproto";
import { uploads } from "teleproto/client";
import { Api } from "teleproto/tl";
import { RPCError } from "teleproto/errors";
import { db } from "./db";
import {
  autoReplies,
  botBusinessConnections,
  botChats,
  botJoinRequests,
  botMessages,
  botUsers,
  bots,
  broadcasts,
  inlineResults,
  scheduledMessages,
} from "./db/schema";
import { decrypt, encrypt } from "./crypto";
import { fetchBotToken } from "./botfather";
import { getClient } from "./mtproto";
import { asPhotoBuffer } from "./photos";
import { BotApiError } from "./botapi";
import { recordSetup } from "./setup-cache";
import { singleFlight } from "./single-flight";

export type BotRow = typeof bots.$inferSelect;

export async function listBots(ownerUserId: string): Promise<BotRow[]> {
  return await db.select().from(bots).where(eq(bots.ownerUserId, ownerUserId));
}

/** Scoped to the owner, so a bot ID that belongs to someone else returns undefined (-> 404). */
export async function getBotById(id: number, ownerUserId: string): Promise<BotRow | undefined> {
  return (await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, id), eq(bots.ownerUserId, ownerUserId))))[0];
}

/** The last background health check as the dashboard shows it, or null before the first check. */
export function healthOf(bot: BotRow): { status: "ok" | "warning" | "error"; message: string | null; checkedAt: Date | null } | null {
  return bot.healthStatus ? { status: bot.healthStatus, message: bot.healthMessage, checkedAt: bot.healthCheckedAt } : null;
}

export function getBotToken(bot: BotRow): string | null {
  return bot.encryptedToken ? decrypt(bot.encryptedToken) : null;
}

export async function upsertBotFromTelegram(info: {
  ownerUserId: string;
  telegramId: string;
  username: string;
  firstName: string;
}): Promise<BotRow> {
  const now = new Date();
  // One statement, so two parallel bot-list syncs can't both pass a select and then collide on the unique index.
  const result = await db
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
    .onConflictDoUpdate({
      target: [bots.ownerUserId, bots.telegramId],
      set: { username: info.username, firstName: info.firstName, updatedAt: now },
    })
    .returning();
  return result[0];
}

export async function saveBotToken(id: number, token: string): Promise<void> {
  await db.update(bots)
    .set({ encryptedToken: encrypt(token), tokenFetchedAt: new Date(), updatedAt: new Date() })
    .where(eq(bots.id, id));
}

export async function clearBotToken(id: number): Promise<void> {
  await db.update(bots)
    .set({ encryptedToken: null, tokenFetchedAt: null, updatedAt: new Date() })
    .where(eq(bots.id, id));
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
    await clearBotToken(bot.id);
    const fetched = await fetchBotToken(userId, bot.username);
    await saveBotToken(bot.id, fetched);
    return fetched;
  });
}

export async function setMonitorEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(bots)
    .set({ monitorEnabled: enabled, updatedAt: new Date() })
    .where(eq(bots.id, id));
  // Monitoring and a webhook exclude each other, so "listening" is exactly this switch.
  await recordSetup(id, { listening: enabled });
}

export async function setLastUpdateId(id: number, updateId: number): Promise<void> {
  await db.update(bots).set({ lastUpdateId: updateId }).where(eq(bots.id, id));
}

/** Records the outcome of a poller cycle for this bot, so a stalled poller can be surfaced in the attention panel. */
export async function setPollHealth(id: number, error: string | null): Promise<void> {
  await db.update(bots).set({ lastPolledAt: new Date(), pollError: error }).where(eq(bots.id, id));
}

/** Caches the bot's webhook health, fetched lazily whenever something already called getWebhookInfo. */
export async function setWebhookHealth(id: number, lastError: string | null, pendingCount: number | null): Promise<void> {
  await db.update(bots)
    .set({ webhookLastError: lastError, webhookPendingCount: pendingCount })
    .where(eq(bots.id, id));
}

export async function deleteBotRow(id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(botMessages).where(eq(botMessages.botId, id));
    await tx.delete(botUsers).where(eq(botUsers.botId, id));
    await tx.delete(botChats).where(eq(botChats.botId, id));
    await tx.delete(autoReplies).where(eq(autoReplies.botId, id));
    await tx.delete(scheduledMessages).where(eq(scheduledMessages.botId, id));
    await tx.delete(broadcasts).where(eq(broadcasts.botId, id));
    await tx.delete(botJoinRequests).where(eq(botJoinRequests.botId, id));
    await tx.delete(inlineResults).where(eq(inlineResults.botId, id));
    await tx.delete(botBusinessConnections).where(eq(botBusinessConnections.botId, id));
    await tx.delete(bots).where(eq(bots.id, id));
  });
}

/** Removes local rows for bots Telegram no longer lists as owned by this user (e.g. deleted from a phone). */
export async function pruneBotsNotIn(ownerUserId: string, telegramIds: Set<string>): Promise<void> {
  for (const bot of (await listBots(ownerUserId))) {
    if (!telegramIds.has(bot.telegramId)) await deleteBotRow(bot.id);
  }
}

/** A bot by ID with no owner check: for background jobs (lib/jobs.ts) acting on rows they created, never for request handlers. */
export async function getBotForJob(id: number): Promise<BotRow | undefined> {
  return (await db.select().from(bots).where(eq(bots.id, id)))[0];
}

/** Every bot that has a stored token, across all users — used only by the health check job. */
export async function listAllBotsWithToken(): Promise<BotRow[]> {
  return await db.select().from(bots).where(isNotNull(bots.encryptedToken));
}

export async function saveBotHealth(id: number, status: "ok" | "warning" | "error", message: string | null): Promise<void> {
  await db.update(bots).set({ healthStatus: status, healthMessage: message, healthCheckedAt: new Date() }).where(eq(bots.id, id));
}

/** Every monitored bot across all users — used only by the background poller. */
export async function listAllMonitoredBots(): Promise<BotRow[]> {
  return await db.select().from(bots).where(eq(bots.monitorEnabled, true));
}

/** The bot's current row if monitoring is still on for it. Unscoped: for the background poller only, never for request handlers. */
export async function getMonitoredBot(id: number): Promise<BotRow | undefined> {
  return (await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, id), eq(bots.monitorEnabled, true))))[0];
}

// --- Profile photo (MTProto, as the owning Telegram account: no bot token needed) ------------

export class BotPhotoError extends Error {}

const PHOTO_ERRORS: Record<string, string> = {
  PHOTO_INVALID: "Telegram rejected that image.",
  PHOTO_CROP_SIZE_SMALL: "That image is too small. Use at least 160×160 pixels.",
  PHOTO_EXT_INVALID: "Telegram doesn't accept that image format.",
  BOT_INVALID: "Telegram says you can't edit this bot's photo.",
  USER_BOT_INVALID: "Telegram says you can't edit this bot's photo.",
};

async function requirePhotoClient(telegramAccountId: string): Promise<TelegramClient> {
  const client = await getClient(telegramAccountId);
  if (!client) throw new BotPhotoError("Not logged in to Telegram.");
  return client;
}

function rethrowPhotoError(err: unknown): never {
  if (err instanceof RPCError && PHOTO_ERRORS[err.errorMessage]) throw new BotPhotoError(PHOTO_ERRORS[err.errorMessage]);
  throw err;
}

/** The bot's current small profile photo, or null if it has none. */
export async function getBotPhoto(telegramAccountId: string, bot: BotRow): Promise<Buffer | null> {
  const client = await requirePhotoClient(telegramAccountId);
  const entity = await client.getEntity(bot.username);
  return asPhotoBuffer(await client.downloadProfilePhoto(entity, { isBig: false }));
}

/** Sets the bot's profile picture; `video` uploads an MP4 as a profile video (looping, starting at its first frame). */
export async function setBotPhoto(
  telegramAccountId: string,
  bot: BotRow,
  file: { name: string; data: Buffer; video?: boolean }
): Promise<void> {
  const client = await requirePhotoClient(telegramAccountId);
  try {
    const uploaded = await client.uploadFile({
      file: new uploads.CustomFile(file.name, file.data.length, "", file.data),
      workers: 1,
    });
    await client.invoke(
      new Api.photos.UploadProfilePhoto({
        bot: await client.getInputEntity(bot.username),
        ...(file.video ? { video: uploaded, videoStartTs: 0 } : { file: uploaded }),
      })
    );
  } catch (err) {
    rethrowPhotoError(err);
  }
}

export async function deleteBotPhoto(telegramAccountId: string, bot: BotRow): Promise<void> {
  const client = await requirePhotoClient(telegramAccountId);
  try {
    await client.invoke(
      new Api.photos.UpdateProfilePhoto({
        bot: await client.getInputEntity(bot.username),
        id: new Api.InputPhotoEmpty(),
      })
    );
  } catch (err) {
    rethrowPhotoError(err);
  }
}

// --- Usernames (MTProto: collectible usernames can be switched on/off and reordered) ---------

export class BotUsernameError extends Error {}

const USERNAME_ERRORS: Record<string, string> = {
  USERNAME_NOT_MODIFIED: "That username is already in that state.",
  USERNAMES_ACTIVE_TOO_MUCH: "Too many usernames are active; deactivate one first.",
  USERNAME_INVALID: "Telegram doesn't know that username.",
  USERNAME_PURCHASE_AVAILABLE: "That username can't be used right now.",
  USERNAME_OCCUPIED: "That username is taken.",
  BOT_INVALID: "Telegram says you can't manage this bot's usernames.",
  USER_BOT_INVALID: "Telegram says you can't manage this bot's usernames.",
};

export interface BotUsername {
  username: string;
  active: boolean;
  /** True for the bot's one regular username: it can be changed in BotFather only, never toggled off. */
  editable: boolean;
}

function rethrowUsernameError(err: unknown): never {
  if (err instanceof RPCError && USERNAME_ERRORS[err.errorMessage]) throw new BotUsernameError(USERNAME_ERRORS[err.errorMessage]);
  throw err;
}

/** The bot's primary username plus any collectible ones, in Telegram's order. */
export async function listBotUsernames(telegramAccountId: string, bot: BotRow): Promise<BotUsername[]> {
  const client = await getClient(telegramAccountId);
  if (!client) throw new BotUsernameError("Not logged in to Telegram.");
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: await client.getInputEntity(bot.username) }));
    const user = full.users.find((u): u is Api.User => u instanceof Api.User && u.username?.toLowerCase() === bot.username.toLowerCase()) ?? full.users[0];
    if (!(user instanceof Api.User)) return [{ username: bot.username, active: true, editable: true }];
    const rows = (user.usernames ?? []).map((u) => ({ username: u.username, active: Boolean(u.active), editable: Boolean(u.editable) }));
    return rows.length ? rows : [{ username: user.username ?? bot.username, active: true, editable: true }];
  } catch (err) {
    return rethrowUsernameError(err);
  }
}

export async function setBotUsernameActive(telegramAccountId: string, bot: BotRow, username: string, active: boolean): Promise<void> {
  const client = await getClient(telegramAccountId);
  if (!client) throw new BotUsernameError("Not logged in to Telegram.");
  try {
    await client.invoke(new Api.bots.ToggleUsername({ bot: await client.getInputEntity(bot.username), username, active }));
  } catch (err) {
    rethrowUsernameError(err);
  }
}

/** `order` lists every active username in the wanted order. */
export async function reorderBotUsernames(telegramAccountId: string, bot: BotRow, order: string[]): Promise<void> {
  const client = await getClient(telegramAccountId);
  if (!client) throw new BotUsernameError("Not logged in to Telegram.");
  try {
    await client.invoke(new Api.bots.ReorderUsernames({ bot: await client.getInputEntity(bot.username), order }));
  } catch (err) {
    rethrowUsernameError(err);
  }
}
