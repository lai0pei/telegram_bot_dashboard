<<<<<<< HEAD
import {
  botApi,
  type TelegramCallbackQuery,
  type TelegramChatJoinRequest,
  type TelegramChatMemberUpdate,
  type TelegramMessage,
  type TelegramPoll,
  type TelegramUpdate,
} from "./botapi";
import { getBotToken, getMonitoredBot, listAllMonitoredBots, setLastUpdateId } from "./bots";
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

/**
 * Background long-poll for every bot with monitoring enabled. Started once per
 * process from instrumentation.ts. A supervisor loop starts one independent
 * worker per monitored bot, so each bot's long-poll waits in parallel (idle
 * sockets cost almost nothing) and one slow or failing bot never delays the
 * others. Each bot keeps its own offset (lastUpdateId), so restarts don't
 * re-fetch old updates.
=======
import { botApi } from "./botapi";
import { getBotToken, listAllMonitoredBots, setLastUpdateId, setPollHealth } from "./bots";
import { db } from "./db";
import { botMessages, botUsers } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { snapshotDailyStats, utcDay } from "./stats";
import { maybeSendDigests } from "./digest";

/**
 * Background long-poll loop for every bot with monitoring enabled. Started
 * once per process from instrumentation.ts. Each bot is polled with its own
 * offset (lastUpdateId) so restarts don't re-fetch old updates. Also drives
 * the once-a-day stats snapshot and digest check, since this is the only
 * long-running loop in the process.
>>>>>>> a05ef6cc882ff2f00a1a66315cd22f35b5d75cda
 */
const POLL_TIMEOUT_SECONDS = 15;
const SUPERVISOR_INTERVAL_MS = 3000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60_000;

declare global {
<<<<<<< HEAD
  var __tgDashPollerRunning: boolean | undefined;
  /** Bot IDs that currently have a worker, so hot-reload can't start a second one. */
  var __tgDashPollerWorkers: Set<number> | undefined;
  /** Consecutive getUpdates failures per bot, read by the health check (lib/health.ts). Absent = healthy. */
  var __tgDashPollerFailures: Map<number, number> | undefined;
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
  supervise().catch((err) => console.error("[poller] fatal error, stopped:", err));
}

async function supervise() {
  const workers = globalThis.__tgDashPollerWorkers!;
  while (globalThis.__tgDashPollerRunning) {
    for (const bot of listAllMonitoredBots()) {
      if (!bot.encryptedToken || workers.has(bot.id)) continue;
      workers.add(bot.id);
      pollBot(bot.id)
        .catch((err) => console.error(`[poller] worker for bot ${bot.username} crashed:`, err))
        .finally(() => workers.delete(bot.id));
=======
  var __tgDashLastSnapshotDay: string | undefined;
}

export function startPoller() {
  if (running) return;
  running = true;
  loop().catch((err) => console.error("[poller] fatal error, stopped:", err));
}

async function loop() {
  while (running) {
    maybeSnapshotDailyStats();
    maybeSendDigests().catch((err) => console.error("[poller] digest check failed:", err));

    const monitored = listAllMonitoredBots().filter((b) => b.encryptedToken);
    if (monitored.length === 0) {
      await sleep(3000);
      continue;
>>>>>>> a05ef6cc882ff2f00a1a66315cd22f35b5d75cda
    }
    await sleep(SUPERVISOR_INTERVAL_MS);
  }
}

/** Long-polls one bot until monitoring is switched off, its token is gone, or the bot is deleted. */
async function pollBot(botId: number) {
  let failures = 0;
  while (globalThis.__tgDashPollerRunning) {
    // Re-read every round so a new token, a toggled switch or a deletion takes effect without a restart.
    const bot = getMonitoredBot(botId);
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
          handleUpdate(bot.id, bot.username, token, update);
        } catch (err) {
          // A database error (e.g. a migration that hasn't been applied yet) must not drop updates: leave the
          // offset where it is so they're fetched again. Anything else is a bad update; skip it, don't wedge.
          if (isDatabaseError(err)) throw err;
          console.error(`[poller] bot ${bot.username} skipped update ${update.update_id}:`, err);
        }
<<<<<<< HEAD
        setLastUpdateId(bot.id, update.update_id);
=======
        setPollHealth(bot.id, null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[poller] bot ${bot.username} getUpdates failed:`, err);
        setPollHealth(bot.id, message);
        await sleep(5000);
>>>>>>> a05ef6cc882ff2f00a1a66315cd22f35b5d75cda
      }
    } catch (err) {
      console.error(`[poller] bot ${bot.username} getUpdates failed:`, err);
      // Per-bot backoff (5s growing to 60s) so a dead token neither stalls other bots nor retries every few seconds.
      failures++;
      pollerFailures().set(botId, failures);
      await sleep(Math.min(MIN_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS));
    }
  }
}

<<<<<<< HEAD
function isDatabaseError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("SQLITE_");
}

export function handleUpdate(botId: number, botUsername: string, token: string, update: TelegramUpdate) {
  if (update.message) recordIncomingMessage(botId, botUsername, token, update.message);
  else if (update.edited_message) applyEdit(botId, botUsername, token, update.edited_message);
  else if (update.callback_query) recordCallback(botId, token, update.callback_query);
  else if (update.my_chat_member) recordMembership(botId, update.my_chat_member);
  else if (update.chat_join_request) recordJoinRequestUpdate(botId, update.chat_join_request);
  else if (update.poll) applyPollUpdate(botId, update.poll);
  else if (update.inline_query) answerInline(botId, token, update.inline_query);
  else if (update.chosen_inline_result) recordChosenInlineResult(botId, update.chosen_inline_result.result_id);
  else if (update.business_connection) upsertBusinessConnection(botId, update.business_connection);
  else if (update.business_message) recordIncomingMessage(botId, botUsername, token, update.business_message);
  else if (update.edited_business_message) applyEdit(botId, botUsername, token, update.edited_business_message);
  else if (update.deleted_business_messages) {
    const d = update.deleted_business_messages;
    markBusinessMessagesDeleted(botId, d.business_connection_id, String(d.chat.id), d.message_ids);
  }
}

function recordJoinRequestUpdate(botId: number, request: TelegramChatJoinRequest) {
  recordJoinRequest(botId, request);
  noteBotChatFromMessage(botId, request.chat);
}

/** A poll's new state (a vote, or it was stopped): replace the poll inside the stored message. */
function applyPollUpdate(botId: number, poll: TelegramPoll) {
  const rows = db
    .select({ id: botMessages.id, raw: botMessages.raw })
    .from(botMessages)
    .where(and(eq(botMessages.botId, botId), eq(botMessages.mediaType, "poll"), sql`json_extract(${botMessages.raw}, '$.poll.id') = ${poll.id}`))
    .all();
  for (const row of rows) {
    const message = JSON.parse(row.raw ?? "{}") as TelegramMessage;
    db.update(botMessages)
      .set({ raw: JSON.stringify({ ...message, poll }) })
      .where(eq(botMessages.id, row.id))
      .run();
  }
}

/** The bot was added to, promoted/demoted in, or removed from a chat. */
function recordMembership(botId: number, update: TelegramChatMemberUpdate) {
  const type = trackedType(update.chat.type);
  if (!type) {
    // Private chat: the user blocked or unblocked the bot. Not tracked as a chat, but the broadcast skips blockers.
    if (update.chat.type === "private") {
      const status = update.new_chat_member.status;
      if (status === "kicked") setBotUserBlocked(botId, String(update.chat.id), true);
      else if (status === "member") setBotUserBlocked(botId, String(update.chat.id), false);
    }
    return;
  }
  upsertBotChat(botId, {
    chatId: String(update.chat.id),
    type,
    title: update.chat.title ?? String(update.chat.id),
    username: update.chat.username ?? null,
    status: statusOf(update.new_chat_member),
    rights: rightsOf(update.new_chat_member),
  });
}

/** Edited message: update the stored copy in place (or store it if it predates monitoring). */
function applyEdit(botId: number, botUsername: string, token: string, message: TelegramMessage) {
  const { text, mediaType } = describeMessage(message);
  const chatId = String(message.chat.id);
  const existing = db
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
    )
    .all()[0];
  if (!existing) {
    recordIncomingMessage(botId, botUsername, token, message, false);
    return;
  }
  db.update(botMessages)
    .set({
      text,
      mediaType,
      raw: JSON.stringify(message),
      editedAt: new Date((message.edit_date ?? message.date) * 1000),
    })
    .where(eq(botMessages.id, existing.id))
    .run();
}

/** A pressed inline button: stored as an incoming row, and the user's button spinner is stopped. */
function recordCallback(botId: number, token: string, query: TelegramCallbackQuery) {
  const chat = query.message?.chat;
  if (chat) {
    const now = new Date();
    db.insert(botMessages)
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
      })
      .run();
    upsertBotUser(botId, String(chat.id), { username: query.from.username ?? null, firstName: query.from.first_name, seenAt: now });
  }
  // Best effort, and without waiting. A matching rule answers (toast, edit or new message); the Play button of a game
  // opens the game's URL; otherwise the press only clears the spinner.
  let rule: ReturnType<typeof matchCallbackRule>;
  let gameUrl: string | null = null;
  try {
    rule = query.data ? matchCallbackRule(botId, query.data) : undefined;
    if (query.game_short_name) gameUrl = gameUrlFor(botId, query.game_short_name);
  } catch (err) {
    console.error(`[poller] callback rule lookup failed for bot ${botId}:`, err);
  }
  if (rule) answerCallbackWithRule(botId, token, rule, query);
  else botApi.answerCallbackQuery(token, query.id, gameUrl ? { url: gameUrl } : {}).catch(() => {});
}

function recordIncomingMessage(botId: number, botUsername: string, token: string, message: TelegramMessage, autoReply = true) {
=======
/** Runs the stats snapshot at most once per UTC day per process (each poller cycle, this is a cheap no-op check). */
function maybeSnapshotDailyStats() {
  const today = utcDay(new Date());
  if (globalThis.__tgDashLastSnapshotDay === today) return;
  globalThis.__tgDashLastSnapshotDay = today;
  try {
    snapshotDailyStats();
  } catch (err) {
    console.error("[poller] daily stats snapshot failed:", err);
  }
}

function recordIncomingMessage(
  botId: number,
  message: NonNullable<Awaited<ReturnType<typeof botApi.getUpdates>>[number]["message"]>
) {
>>>>>>> a05ef6cc882ff2f00a1a66315cd22f35b5d75cda
  const now = new Date();
  const described = describeMessage(message);
  // A business chat belongs to the business owner, not to the bot. The owner's own messages in it arrive as business
  // messages too: those are "out" (default to "in" while the connection isn't stored yet).
  const businessConnectionId = message.business_connection_id ?? null;
  const connection = businessConnectionId ? getBusinessConnection(botId, businessConnectionId) : undefined;
  const fromOwner = Boolean(connection && message.from && String(message.from.id) === connection.userId);
  db.insert(botMessages)
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
    })
    .run();

  // Business customers never started the bot: recording them as contacts or chats would put them in broadcasts
  // (which can't reach them), and auto-replies would answer as the business owner.
  if (businessConnectionId) return;

  noteBotChatFromMessage(botId, message.chat);

  // Contacts are people who wrote to the bot privately; a group's messages must not name the group after its sender.
  if (message.from && message.chat.type === "private") {
    upsertBotUser(botId, String(message.chat.id), {
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
    const rule = matchAutoReply(botId, botUsername, message);
    if (rule) sendAutoReply(botId, token, rule, message, botUsername);
  } catch (err) {
    console.error(`[poller] auto-reply lookup failed for bot ${botId}:`, err);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
