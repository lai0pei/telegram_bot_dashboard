import { and, asc, desc, eq, sql } from "drizzle-orm";
import { parseButtons } from "./auto-replies";
import { botApi, buttonsForChat, type InlineArticle, type InlineButton, type TelegramInlineQuery } from "./botapi";
import { db } from "./db";
import { inlineResults } from "./db/schema";
import { logError } from "./error-log";

export type InlineResultRow = typeof inlineResults.$inferSelect;
export type InlineResultInput = Pick<InlineResultRow, "prefix" | "title" | "description" | "messageText" | "parseMode" | "enabled"> & {
  buttons?: InlineButton[][] | null;
};

/** Telegram caches an inline answer for 300 s by default, which would make dashboard edits look ignored. */
const CACHE_TIME_S = 5;
const MAX_RESULTS = 50;

export function toInlineResultDto(row: InlineResultRow) {
  return { ...row, buttons: parseButtons(row.buttons) };
}

export async function listInlineResults(botId: number): Promise<InlineResultRow[]> {
  return await db.select().from(inlineResults).where(eq(inlineResults.botId, botId)).orderBy(asc(inlineResults.position), asc(inlineResults.id));
}

export async function getInlineResult(botId: number, id: number): Promise<InlineResultRow | undefined> {
  return (await db
    .select()
    .from(inlineResults)
    .where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, id))))[0];
}

const storedButtons = (buttons: InlineButton[][] | null | undefined) => (buttons?.length ? JSON.stringify(buttons) : null);

export async function createInlineResult(botId: number, input: InlineResultInput): Promise<InlineResultRow> {
  const last = (await db
    .select({ position: inlineResults.position })
    .from(inlineResults)
    .where(eq(inlineResults.botId, botId))
    .orderBy(desc(inlineResults.position))
    .limit(1))[0];
  return (await db
    .insert(inlineResults)
    .values({
      botId,
      prefix: input.prefix.trim(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      messageText: input.messageText,
      parseMode: input.parseMode ?? null,
      buttons: storedButtons(input.buttons),
      enabled: input.enabled,
      position: (last?.position ?? -1) + 1,
      createdAt: new Date(),
    })
    .returning())[0];
}

export async function updateInlineResult(botId: number, id: number, input: InlineResultInput): Promise<InlineResultRow | undefined> {
  return (await db
    .update(inlineResults)
    .set({
      prefix: input.prefix.trim(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      messageText: input.messageText,
      parseMode: input.parseMode ?? null,
      buttons: storedButtons(input.buttons),
      enabled: input.enabled,
    })
    .where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, id)))
    .returning())[0];
}

export async function deleteInlineResult(botId: number, id: number): Promise<boolean> {
  return (await db.delete(inlineResults).where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, id)))).count > 0;
}

/** Swaps a result with its neighbour in list order. */
export async function moveInlineResult(botId: number, id: number, direction: "up" | "down"): Promise<void> {
  const rows = await listInlineResults(botId);
  const index = rows.findIndex((r) => r.id === id);
  const other = rows[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  await db.transaction(async (tx) => {
    // Positions can tie (default 0), so assign the whole order explicitly.
    const order = rows.map((r) => r.id);
    [order[index], order[order.indexOf(other.id)]] = [other.id, id];
    for (const [position, rowId] of order.entries()) {
      await tx.update(inlineResults).set({ position }).where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, rowId)));
    }
  });
}

/** Enabled results whose prefix the query starts with (case-insensitive; an empty prefix matches everything). */
export async function matchInlineResults(botId: number, query: string): Promise<InlineResultRow[]> {
  const q = query.trim().toLowerCase();
  return (await listInlineResults(botId))
    .filter((r) => r.enabled && q.startsWith(r.prefix.trim().toLowerCase()))
    .slice(0, MAX_RESULTS);
}

/** Counts a chosen result. Scoped by bot as well as row, so a stray ID from another bot's query can't touch it. */
export async function recordChosenInlineResult(botId: number, resultId: string): Promise<void> {
  if (!/^\d{1,15}$/.test(resultId)) return;
  await db.update(inlineResults)
    .set({ uses: sql`${inlineResults.uses} + 1` })
    .where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, Number(resultId))));
}

function toArticle(row: InlineResultRow): InlineArticle {
  return {
    type: "article",
    id: String(row.id),
    title: row.title,
    description: row.description ?? undefined,
    input_message_content: { message_text: row.messageText, parse_mode: row.parseMode ?? undefined },
    // Mini App buttons only work in private chats with the bot, which an inline message isn't.
    reply_markup: (() => {
      const buttons = buttonsForChat(parseButtons(row.buttons), "-1");
      return buttons ? { inline_keyboard: buttons } : undefined;
    })(),
  };
}

/**
 * Answers an inline query: always, even with no matches (Telegram otherwise shows a spinner until it times out).
 * Never throws and doesn't record the asker, since inline users never started the bot.
 */
export async function answerInline(botId: number, token: string, query: TelegramInlineQuery): Promise<void> {
  let results: InlineArticle[] = [];
  try {
    results = (await matchInlineResults(botId, query.query)).map(toArticle);
  } catch (err) {
    logError("inline", `bot ${botId} result lookup failed`, err, { botId });
  }
  botApi
    .answerInlineQuery(token, query.id, results, { cacheTime: CACHE_TIME_S, isPersonal: false })
    .catch((err) => logError("inline", `bot ${botId} answer failed`, err, { botId }));
}
