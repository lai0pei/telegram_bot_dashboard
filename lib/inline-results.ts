import { and, asc, desc, eq, sql } from "drizzle-orm";
import { parseButtons } from "./auto-replies";
import { botApi, buttonsForChat, type InlineArticle, type InlineButton, type TelegramInlineQuery } from "./botapi";
import { db } from "./db";
import { inlineResults } from "./db/schema";

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

export function listInlineResults(botId: number): InlineResultRow[] {
  return db.select().from(inlineResults).where(eq(inlineResults.botId, botId)).orderBy(asc(inlineResults.position), asc(inlineResults.id)).all();
}

export function getInlineResult(botId: number, id: number): InlineResultRow | undefined {
  return db
    .select()
    .from(inlineResults)
    .where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, id)))
    .all()[0];
}

const storedButtons = (buttons: InlineButton[][] | null | undefined) => (buttons?.length ? JSON.stringify(buttons) : null);

export function createInlineResult(botId: number, input: InlineResultInput): InlineResultRow {
  const last = db
    .select({ position: inlineResults.position })
    .from(inlineResults)
    .where(eq(inlineResults.botId, botId))
    .orderBy(desc(inlineResults.position))
    .limit(1)
    .all()[0];
  return db
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
    .returning()
    .get();
}

export function updateInlineResult(botId: number, id: number, input: InlineResultInput): InlineResultRow | undefined {
  return db
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
    .returning()
    .get();
}

export function deleteInlineResult(botId: number, id: number): boolean {
  return db.delete(inlineResults).where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, id))).run().changes > 0;
}

/** Swaps a result with its neighbour in list order. */
export function moveInlineResult(botId: number, id: number, direction: "up" | "down"): void {
  const rows = listInlineResults(botId);
  const index = rows.findIndex((r) => r.id === id);
  const other = rows[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  db.transaction((tx) => {
    // Positions can tie (default 0), so assign the whole order explicitly.
    const order = rows.map((r) => r.id);
    [order[index], order[order.indexOf(other.id)]] = [other.id, id];
    order.forEach((rowId, position) => {
      tx.update(inlineResults).set({ position }).where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, rowId))).run();
    });
  });
}

/** Enabled results whose prefix the query starts with (case-insensitive; an empty prefix matches everything). */
export function matchInlineResults(botId: number, query: string): InlineResultRow[] {
  const q = query.trim().toLowerCase();
  return listInlineResults(botId)
    .filter((r) => r.enabled && q.startsWith(r.prefix.trim().toLowerCase()))
    .slice(0, MAX_RESULTS);
}

/** Counts a chosen result. Scoped by bot as well as row, so a stray ID from another bot's query can't touch it. */
export function recordChosenInlineResult(botId: number, resultId: string): void {
  if (!/^\d{1,15}$/.test(resultId)) return;
  db.update(inlineResults)
    .set({ uses: sql`${inlineResults.uses} + 1` })
    .where(and(eq(inlineResults.botId, botId), eq(inlineResults.id, Number(resultId))))
    .run();
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
export function answerInline(botId: number, token: string, query: TelegramInlineQuery): void {
  let results: InlineArticle[] = [];
  try {
    results = matchInlineResults(botId, query.query).map(toArticle);
  } catch (err) {
    console.error(`[inline] bot ${botId} result lookup failed:`, err);
  }
  botApi
    .answerInlineQuery(token, query.id, results, { cacheTime: CACHE_TIME_S, isPersonal: false })
    .catch((err) => console.error(`[inline] bot ${botId} answer failed:`, err instanceof Error ? err.message : err));
}
