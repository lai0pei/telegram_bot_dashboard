import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { BotApiError, botApi, type InlineButton } from "./botapi";
import { getBotForJob, getBotToken } from "./bots";
import { parseButtons } from "./auto-replies";
import { db } from "./db";
import { isUniqueViolation } from "./db/errors";
import { botUsers, broadcasts } from "./db/schema";
import { botNotSuspended } from "./suspension";

export type BroadcastRow = typeof broadcasts.$inferSelect;

/** Well under Telegram's ~30 messages/second per bot limit. */
const SEND_INTERVAL_MS = 50;
const BATCH_SIZE = 25;
/** An error asking us to wait longer than this pauses the broadcast instead of sleeping inside a job tick. */
const MAX_INLINE_WAIT_MS = 15_000;

declare global {
  /** Broadcast ID -> epoch ms before which the job loop must not resume it (Telegram asked us to back off). */
  var __tgDashBroadcastResumeAt: Map<number, number> | undefined;
}

function resumeAt(): Map<number, number> {
  return (globalThis.__tgDashBroadcastResumeAt ??= new Map());
}

// Only private chats (positive chat IDs, never a group/channel title stored as a contact) of people who haven't blocked the bot.
const RECIPIENT_FILTER = (botId: number) =>
  sql`${botUsers.botId} = ${botId} AND ${botUsers.blockedAt} IS NULL AND ${botUsers.chatId} NOT LIKE '-%'`;

export async function countRecipients(botId: number): Promise<number> {
  return (await db
    .select({ n: sql<number>`count(distinct ${botUsers.chatId})::int` })
    .from(botUsers)
    .where(RECIPIENT_FILTER(botId)))[0].n;
}

export async function listBroadcasts(botId: number, limit = 20): Promise<BroadcastRow[]> {
  return await db.select().from(broadcasts).where(eq(broadcasts.botId, botId)).orderBy(desc(broadcasts.id)).limit(limit);
}

export class BroadcastConflictError extends Error {}

export async function createBroadcast(
  botId: number,
  input: { text: string; parseMode: "HTML" | "MarkdownV2" | null; buttons: InlineButton[][] | null }
): Promise<BroadcastRow> {
  try {
    return await insertBroadcast(botId, input);
  } catch (err) {
    // `broadcasts_one_active_unique` is the real guard: the check below can lose a race with a parallel request.
    if (isUniqueViolation(err)) throw new BroadcastConflictError(ACTIVE_MESSAGE);
    throw err;
  }
}

const ACTIVE_MESSAGE = "A broadcast is already in progress for this bot. Wait for it to finish or cancel it.";

async function insertBroadcast(
  botId: number,
  input: { text: string; parseMode: "HTML" | "MarkdownV2" | null; buttons: InlineButton[][] | null }
): Promise<BroadcastRow> {
  return await db.transaction(async (tx) => {
    const active = (await tx
      .select({ id: broadcasts.id })
      .from(broadcasts)
      .where(and(eq(broadcasts.botId, botId), inArray(broadcasts.status, ["queued", "running"]))))[0];
    if (active) throw new BroadcastConflictError(ACTIVE_MESSAGE);
    const total = (await tx
      .select({ n: sql<number>`count(distinct ${botUsers.chatId})::int` })
      .from(botUsers)
      .where(RECIPIENT_FILTER(botId)))[0].n;
    if (total === 0) throw new BroadcastConflictError("There is nobody to send to yet: no contact has written to this bot.");
    return (await tx
      .insert(broadcasts)
      .values({
        botId,
        text: input.text,
        parseMode: input.parseMode,
        buttons: input.buttons?.length ? JSON.stringify(input.buttons) : null,
        total,
        createdAt: new Date(),
      })
      .returning())[0];
  });
}

/** Stops a queued/running broadcast. Messages already sent stay sent. */
export async function cancelBroadcast(botId: number, id: number): Promise<boolean> {
  return (
    (await db
      .update(broadcasts)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(broadcasts.botId, botId), eq(broadcasts.id, id), inArray(broadcasts.status, ["queued", "running"])))).count > 0
  );
}

/** Broadcasts the job loop should work on now (not paused by a rate limit), oldest first. */
export async function activeBroadcastIds(now = Date.now()): Promise<number[]> {
  return (await db
    .select({ id: broadcasts.id })
    .from(broadcasts)
    // A suspended user's broadcast is left as it is (not failed) and carries on from its cursor after an unsuspend.
    .where(and(inArray(broadcasts.status, ["queued", "running"]), botNotSuspended(broadcasts.botId)))
    .orderBy(broadcasts.id))
    .map((r) => r.id)
    .filter((id) => (resumeAt().get(id) ?? 0) <= now);
}

async function fail(id: number, error: string) {
  await db.update(broadcasts).set({ status: "failed", error, finishedAt: new Date() }).where(eq(broadcasts.id, id));
}

/** Contacts to message next: one row per chat, in contact-row order, after the saved cursor. */
async function nextRecipients(botId: number, cursor: number): Promise<{ id: number; chatId: string }[]> {
  return await db
    .select({ id: sql<number>`min(${botUsers.id})`, chatId: botUsers.chatId })
    .from(botUsers)
    .where(RECIPIENT_FILTER(botId))
    .groupBy(botUsers.chatId)
    .having(sql`min(${botUsers.id}) > ${cursor}`)
    .orderBy(sql`min(${botUsers.id})`)
    .limit(BATCH_SIZE);
}

/**
 * Sends for up to `budgetMs`, then returns so scheduled sends and health checks get their turn; the cursor lives in
 * the row, so the next tick (or a restart) continues from there. The cursor moves *before* each send: if the process
 * dies mid-send, one contact may be skipped but nobody is messaged twice.
 */
export async function runBroadcastStep(id: number, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  const initial = (await db.select().from(broadcasts).where(eq(broadcasts.id, id)))[0];
  if (!initial || (initial.status !== "queued" && initial.status !== "running")) return;

  const bot = await getBotForJob(initial.botId);
  const token = bot && getBotToken(bot);
  if (!token) return await fail(id, "The bot has no stored token.");
  if (initial.status === "queued") {
    await db.update(broadcasts).set({ status: "running", startedAt: new Date() }).where(eq(broadcasts.id, id));
  }
  const buttons = parseButtons(initial.buttons) ?? undefined;

  while (Date.now() < deadline) {
    const current = (await db.select().from(broadcasts).where(eq(broadcasts.id, id)))[0];
    if (!current || current.status !== "running") return; // cancelled meanwhile

    const batch = await nextRecipients(current.botId, current.cursor);
    if (batch.length === 0) {
      await db.update(broadcasts).set({ status: "done", finishedAt: new Date() }).where(eq(broadcasts.id, id));
      resumeAt().delete(id);
      return;
    }

    for (const recipient of batch) {
      if (Date.now() >= deadline) return;
      // Conditional on "running": zero changes means it was cancelled since the batch started, so send nothing more.
      const advanced = await db.update(broadcasts).set({ cursor: recipient.id }).where(and(eq(broadcasts.id, id), eq(broadcasts.status, "running")));
      if (advanced.count === 0) return;
      const outcome = await sendOne(token, recipient.chatId, initial, buttons);
      if (outcome === "unauthorized") return await fail(id, "Telegram rejected the bot's token, so the broadcast was stopped.");
      if (outcome === "paused") {
        // Rewind so this contact is retried when the pause ends.
        await db.update(broadcasts).set({ cursor: recipient.id - 1 }).where(eq(broadcasts.id, id));
        return;
      }
      const column = outcome === "sent" ? broadcasts.sent : outcome === "blocked" ? broadcasts.blocked : broadcasts.failed;
      const field = outcome === "sent" ? "sent" : outcome === "blocked" ? "blocked" : "failed";
      await db.update(broadcasts)
        .set({ [field]: sql`${column} + 1` })
        .where(eq(broadcasts.id, id));
      if (outcome === "blocked") {
        await db.update(botUsers).set({ blockedAt: new Date() }).where(and(eq(botUsers.botId, current.botId), eq(botUsers.chatId, recipient.chatId)));
      }
      await sleep(SEND_INTERVAL_MS);
    }
  }
}

type Outcome = "sent" | "blocked" | "failed" | "unauthorized" | "paused";

async function sendOne(token: string, chatId: string, broadcast: BroadcastRow, buttons: InlineButton[][] | undefined): Promise<Outcome> {
  try {
    await botApi.sendMessage(token, chatId, broadcast.text, { parseMode: broadcast.parseMode ?? undefined, buttons });
    return "sent";
  } catch (err) {
    if (!(err instanceof BotApiError)) {
      console.error(`[broadcast ${broadcast.id}] send to ${chatId} failed:`, err);
      return "failed";
    }
    if (err.errorCode === 401) return "unauthorized";
    if (err.errorCode === 429) {
      const wait = (err.retryAfter ?? 5) * 1000;
      if (wait > MAX_INLINE_WAIT_MS) {
        resumeAt().set(broadcast.id, Date.now() + wait);
        return "paused";
      }
      await sleep(wait);
      return sendOne(token, chatId, broadcast, buttons);
    }
    // 403: blocked the bot / deactivated. "chat not found": never started it.
    if (err.errorCode === 403 || (err.errorCode === 400 && /chat not found|user is deactivated/i.test(err.description))) return "blocked";
    console.error(`[broadcast ${broadcast.id}] send to ${chatId} failed: ${err.description}`);
    return "failed";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
