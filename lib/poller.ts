import {
  botApi,
  type TelegramCallbackQuery,
  type TelegramChatJoinRequest,
  type TelegramChatMemberUpdate,
  type TelegramMessage,
  type TelegramPoll,
  type TelegramUpdate,
} from "./botapi";
import { getBotToken, getMonitoredBot, listAllMonitoredBots, setLastUpdateId, setPollHealth } from "./bots";
import { db } from "./db";
import { botMessages } from "./db/schema";
import { setBotUserBlocked, upsertBotUser } from "./bot-users";
import { answerCallbackWithRule, matchAutoReply, matchCallbackRule, sendAutoReply, startPayloadOf } from "./auto-replies";
import { gameUrlFor } from "./games";
import { answerInline, recordChosenInlineResult } from "./inline-results";
import { recordJoinRequest } from "./join-requests";
import { describeMessage } from "./messages";
import { noteBotChatFromMessage, rightsOf, statusOf, trackedType, upsertBotChat } from "./bot-chats";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getBusinessConnection, markBusinessMessagesDeleted, upsertBusinessConnection } from "./business";
import { isDatabaseError } from "./db/errors";
import { maybeSendDigests } from "./digest";
import { logError } from "./error-log";
import { snapshotDailyStats, utcDay } from "./stats";

/**
 * Background long-poll for every bot with monitoring enabled. Started once per
 * process from instrumentation.ts. A supervisor loop starts one independent
 * worker per monitored bot, so each bot's long-poll waits in parallel (idle
 * sockets cost almost nothing) and one slow or failing bot never delays the
 * others. Each bot keeps its own offset (lastUpdateId), so restarts don't
 * re-fetch old updates. The supervisor also drives the once-a-day stats
 * snapshot and the Saved Messages digest check, since it is the process's only
 * long-running loop.
 */
const POLL_TIMEOUT_SECONDS = 15;
const SUPERVISOR_INTERVAL_MS = 3000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60_000;

declare global {
  var __tgDashPollerRunning: boolean | undefined;
  /** Bot IDs that currently have a worker, so hot-reload can't start a second one. */
  var __tgDashPollerWorkers: Set<number> | undefined;
  /** Consecutive getUpdates failures per bot, read by the health check (lib/health.ts). Absent = healthy. */
  var __tgDashPollerFailures: Map<number, number> | undefined;
  /** UTC day of the last stats snapshot, so it runs at most once a day per process. */
  var __tgDashLastSnapshotDay: string | undefined;
}

function pollerFailures(): Map<number, number> {
  return (globalThis.__tgDashPollerFailures ??= new Map());
}

/** Consecutive failed getUpdates calls for a bot's worker (0 when it's healthy or not polling). */
export function getPollerFailures(botId: number): number {
  return pollerFailures().get(botId) ?? 0;
}

export function startPoller() {
  if (globalThis.__tgDashPollerRunning) return;
  globalThis.__tgDashPollerRunning = true;
  globalThis.__tgDashPollerWorkers ??= new Set();
  supervise().catch((err) => logError("poller", "fatal error, stopped", err));
}

async function supervise() {
  const workers = globalThis.__tgDashPollerWorkers!;
  while (globalThis.__tgDashPollerRunning) {
    await maybeSnapshotDailyStats();
    // Has its own schedule guard (lastDigestAt) and a per-account single-flight, so a tick overlapping a slow send is safe.
    maybeSendDigests().catch((err) => logError("poller", "digest check failed", err));
    for (const bot of (await listAllMonitoredBots())) {
      if (!bot.encryptedToken || workers.has(bot.id)) continue;
      workers.add(bot.id);
      pollBot(bot.id)
        .catch((err) => logError("poller", `worker for bot ${bot.username} crashed`, err, { botId: bot.id }))
        .finally(() => workers.delete(bot.id));
    }
    await sleep(SUPERVISOR_INTERVAL_MS);
  }
}

/** Runs the stats snapshot at most once per UTC day per process (every other supervisor tick is a cheap no-op check). */
async function maybeSnapshotDailyStats() {
  const today = utcDay(new Date());
  if (globalThis.__tgDashLastSnapshotDay === today) return;
  globalThis.__tgDashLastSnapshotDay = today;
  try {
    await snapshotDailyStats();
  } catch (err) {
    logError("poller", "daily stats snapshot failed", err);
  }
}

/**
 * Records the outcome of a poll cycle for the attention panel. Never throws: it runs in the failure path, where the
 * problem may itself be a database error, and a throw there would skip the backoff sleep and respawn the worker in a loop.
 */
async function recordPollHealth(botId: number, error: string | null) {
  try {
    await setPollHealth(botId, error);
  } catch (err) {
    console.error(`[poller] couldn't record poll health for bot ${botId}:`, err);
  }
}

/** Long-polls one bot until monitoring is switched off, its token is gone, or the bot is deleted. */
async function pollBot(botId: number) {
  let failures = 0;
  while (globalThis.__tgDashPollerRunning) {
    // Re-read every round so a new token, a toggled switch or a deletion takes effect without a restart.
    const bot = await getMonitoredBot(botId);
    const token = bot && getBotToken(bot);
    if (!bot || !token) {
      pollerFailures().delete(botId);
      return;
    }
    try {
      const updates = await botApi.getUpdates(token, (bot.lastUpdateId ?? 0) + 1, POLL_TIMEOUT_SECONDS);
      failures = 0;
      pollerFailures().delete(botId);
      for (const update of updates) {
        try {
          await handleUpdate(bot.id, bot.username, token, update);
        } catch (err) {
          // A database error (e.g. a migration that hasn't been applied yet) must not drop updates: leave the
          // offset where it is so they're fetched again. Anything else is a bad update; skip it, don't wedge.
          if (isDatabaseError(err)) throw err;
          logError("poller", `bot ${bot.username} skipped update ${update.update_id}`, err, { botId: bot.id, updateId: update.update_id });
        }
        await setLastUpdateId(bot.id, update.update_id);
      }
      await recordPollHealth(bot.id, null);
    } catch (err) {
      logError("poller", `bot ${bot.username} getUpdates failed`, err, { botId: bot.id, failures: failures + 1 });
      await recordPollHealth(bot.id, err instanceof Error ? err.message : String(err));
      // Per-bot backoff (5s growing to 60s) so a dead token neither stalls other bots nor retries every few seconds.
      failures++;
      pollerFailures().set(botId, failures);
      await sleep(Math.min(MIN_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS));
    }
  }
}

export async function handleUpdate(botId: number, botUsername: string, token: string, update: TelegramUpdate) {
  if (update.message) await recordIncomingMessage(botId, botUsername, token, update.message);
  else if (update.edited_message) await applyEdit(botId, botUsername, token, update.edited_message);
  else if (update.callback_query) await recordCallback(botId, token, update.callback_query);
  else if (update.my_chat_member) await recordMembership(botId, update.my_chat_member);
  else if (update.chat_join_request) await recordJoinRequestUpdate(botId, update.chat_join_request);
  else if (update.poll) await applyPollUpdate(botId, update.poll);
  else if (update.inline_query) await answerInline(botId, token, update.inline_query);
  else if (update.chosen_inline_result) await recordChosenInlineResult(botId, update.chosen_inline_result.result_id);
  else if (update.business_connection) await upsertBusinessConnection(botId, update.business_connection);
  else if (update.business_message) await recordIncomingMessage(botId, botUsername, token, update.business_message);
  else if (update.edited_business_message) await applyEdit(botId, botUsername, token, update.edited_business_message);
  else if (update.deleted_business_messages) {
    const d = update.deleted_business_messages;
    await markBusinessMessagesDeleted(botId, d.business_connection_id, String(d.chat.id), d.message_ids);
  }
}

async function recordJoinRequestUpdate(botId: number, request: TelegramChatJoinRequest) {
  await recordJoinRequest(botId, request);
  await noteBotChatFromMessage(botId, request.chat);
}

/** A poll's new state (a vote, or it was stopped): replace the poll inside the stored message. */
async function applyPollUpdate(botId: number, poll: TelegramPoll) {
  const rows = await db
    .select({ id: botMessages.id, raw: botMessages.raw })
    .from(botMessages)
    .where(and(eq(botMessages.botId, botId), eq(botMessages.mediaType, "poll"), sql`(${botMessages.raw}::jsonb -> 'poll' ->> 'id') = ${poll.id}`));
  for (const row of rows) {
    const message = JSON.parse(row.raw ?? "{}") as TelegramMessage;
    await db.update(botMessages)
      .set({ raw: JSON.stringify({ ...message, poll }) })
      .where(eq(botMessages.id, row.id));
  }
}

/** The bot was added to, promoted/demoted in, or removed from a chat. */
async function recordMembership(botId: number, update: TelegramChatMemberUpdate) {
  const type = trackedType(update.chat.type);
  if (!type) {
    // Private chat: the user blocked or unblocked the bot. Not tracked as a chat, but the broadcast skips blockers.
    if (update.chat.type === "private") {
      const status = update.new_chat_member.status;
      if (status === "kicked") await setBotUserBlocked(botId, String(update.chat.id), true);
      else if (status === "member") await setBotUserBlocked(botId, String(update.chat.id), false);
    }
    return;
  }
  await upsertBotChat(botId, {
    chatId: String(update.chat.id),
    type,
    title: update.chat.title ?? String(update.chat.id),
    username: update.chat.username ?? null,
    status: statusOf(update.new_chat_member),
    rights: rightsOf(update.new_chat_member),
  });
}

/** Edited message: update the stored copy in place (or store it if it predates monitoring). */
async function applyEdit(botId: number, botUsername: string, token: string, message: TelegramMessage) {
  const { text, mediaType } = describeMessage(message);
  const chatId = String(message.chat.id);
  const existing = (await db
    .select({ id: botMessages.id })
    .from(botMessages)
    .where(
      and(
        eq(botMessages.botId, botId),
        eq(botMessages.chatId, chatId),
        eq(botMessages.telegramMessageId, message.message_id),
        // Message and chat IDs repeat between a business chat and the bot's own chat with the same person.
        message.business_connection_id
          ? eq(botMessages.businessConnectionId, message.business_connection_id)
          : isNull(botMessages.businessConnectionId)
      )
    ))[0];
  if (!existing) {
    await recordIncomingMessage(botId, botUsername, token, message, false);
    return;
  }
  await db.update(botMessages)
    .set({
      text,
      mediaType,
      raw: JSON.stringify(message),
      editedAt: new Date((message.edit_date ?? message.date) * 1000),
    })
    .where(eq(botMessages.id, existing.id));
}

/** A pressed inline button: stored as an incoming row, and the user's button spinner is stopped. */
async function recordCallback(botId: number, token: string, query: TelegramCallbackQuery) {
  const chat = query.message?.chat;
  if (chat) {
    const now = new Date();
    await db.insert(botMessages)
      .values({
        botId,
        chatId: String(chat.id),
        fromUserId: String(query.from.id),
        fromUsername: query.from.username ?? null,
        fromFirstName: query.from.first_name,
        direction: "in",
        text: `Pressed button: ${query.data ?? "(no data)"}`,
        raw: JSON.stringify(query),
        telegramMessageId: null,
        createdAt: now,
      });
    await upsertBotUser(botId, String(chat.id), { username: query.from.username ?? null, firstName: query.from.first_name, seenAt: now });
  }
  // Best effort, and without waiting. A matching rule answers (toast, edit or new message); the Play button of a game
  // opens the game's URL; otherwise the press only clears the spinner.
  let rule: Awaited<ReturnType<typeof matchCallbackRule>>;
  let gameUrl: string | null = null;
  try {
    rule = query.data ? (await matchCallbackRule(botId, query.data)) : undefined;
    if (query.game_short_name) gameUrl = await gameUrlFor(botId, query.game_short_name);
  } catch (err) {
    logError("poller", `callback rule lookup failed for bot ${botId}`, err, { botId });
  }
  if (rule) await answerCallbackWithRule(botId, token, rule, query);
  else botApi.answerCallbackQuery(token, query.id, gameUrl ? { url: gameUrl } : {}).catch(() => {});
}

async function recordIncomingMessage(botId: number, botUsername: string, token: string, message: TelegramMessage, autoReply = true) {
  const now = new Date();
  const described = describeMessage(message);
  // A business chat belongs to the business owner, not to the bot. The owner's own messages in it arrive as business
  // messages too: those are "out" (default to "in" while the connection isn't stored yet).
  const businessConnectionId = message.business_connection_id ?? null;
  const connection = businessConnectionId ? (await getBusinessConnection(botId, businessConnectionId)) : undefined;
  const fromOwner = Boolean(connection && message.from && String(message.from.id) === connection.userId);
  await db.insert(botMessages)
    .values({
      botId,
      chatId: String(message.chat.id),
      fromUserId: message.from ? String(message.from.id) : null,
      fromUsername: message.from?.username ?? null,
      fromFirstName: message.from?.first_name ?? null,
      businessConnectionId,
      direction: fromOwner ? "out" : "in",
      text: described.text,
      mediaType: described.mediaType,
      replyToMessageId: message.reply_to_message?.message_id ?? null,
      raw: JSON.stringify(message),
      telegramMessageId: message.message_id,
      createdAt: now,
    });

  // Business customers never started the bot: recording them as contacts or chats would put them in broadcasts
  // (which can't reach them), and auto-replies would answer as the business owner.
  if (businessConnectionId) return;

  await noteBotChatFromMessage(botId, message.chat);

  // Contacts are people who wrote to the bot privately; a group's messages must not name the group after its sender.
  if (message.from && message.chat.type === "private") {
    await upsertBotUser(botId, String(message.chat.id), {
      username: message.from.username ?? null,
      firstName: message.from.first_name,
      seenAt: now,
      startPayload: startPayloadOf(message, botUsername),
    });
  }

  // Last, after every database write: if one of them throws, the update is fetched again and must not reply twice.
  // Only a rule-lookup failure is swallowed here (the message is already stored, so a retry would duplicate it).
  if (!autoReply) return;
  try {
    const rule = await matchAutoReply(botId, botUsername, message);
    if (rule) await sendAutoReply(botId, token, rule, message, botUsername);
  } catch (err) {
    logError("poller", `auto-reply lookup failed for bot ${botId}`, err, { botId });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
