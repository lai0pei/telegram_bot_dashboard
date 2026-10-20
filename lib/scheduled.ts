import { and, desc, eq, lte } from "drizzle-orm";
import { BotApiError, botApi, type InlineButton } from "./botapi";
import { botApiFailure } from "./bot-api-errors";
import { parseButtons } from "./auto-replies";
import { getBotForJob, getBotToken } from "./bots";
import { db } from "./db";
import { scheduledMessages } from "./db/schema";
import { recordOutgoing } from "./outgoing";

export type ScheduledRow = typeof scheduledMessages.$inferSelect;

export function toScheduledDto(row: ScheduledRow) {
  return { ...row, buttons: parseButtons(row.buttons) };
}

export async function listScheduled(botId: number, limit = 50): Promise<ScheduledRow[]> {
  return await db.select().from(scheduledMessages).where(eq(scheduledMessages.botId, botId)).orderBy(desc(scheduledMessages.sendAt)).limit(limit);
}

export async function createScheduled(
  botId: number,
  input: { chatId: string; text: string; parseMode: "HTML" | "MarkdownV2" | null; buttons: InlineButton[][] | null; sendAt: number }
): Promise<ScheduledRow> {
  return (await db
    .insert(scheduledMessages)
    .values({
      botId,
      chatId: input.chatId,
      text: input.text,
      parseMode: input.parseMode,
      buttons: input.buttons?.length ? JSON.stringify(input.buttons) : null,
      sendAt: new Date(input.sendAt),
      createdAt: new Date(),
    })
    .returning())[0];
}

/** Only a still-pending message can be cancelled; one already being sent (or sent) can't. */
export async function cancelScheduled(botId: number, id: number): Promise<boolean> {
  return (
    (await db
      .update(scheduledMessages)
      .set({ status: "cancelled" })
      .where(and(eq(scheduledMessages.botId, botId), eq(scheduledMessages.id, id), eq(scheduledMessages.status, "pending")))).count > 0
  );
}

/**
 * A `sending` row means the process died between claiming it and recording the result. It might have gone out, so it
 * is marked failed rather than sent again — a duplicate is worse than a visible failure the user can retry.
 */
export async function failInterruptedScheduled(): Promise<void> {
  await db.update(scheduledMessages)
    .set({ status: "failed", error: "Interrupted by a restart; not resent in case it was already delivered." })
    .where(eq(scheduledMessages.status, "sending"));
}

/** Sends every message that is due (at most `limit` per call). Each row is claimed atomically before it is sent. */
export async function sendDueScheduled(now = Date.now(), limit = 10): Promise<void> {
  const due = await db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.status, "pending"), lte(scheduledMessages.sendAt, new Date(now))))
    .orderBy(scheduledMessages.sendAt)
    .limit(limit);

  for (const row of due) {
    const claimed = await db
      .update(scheduledMessages)
      .set({ status: "sending" })
      .where(and(eq(scheduledMessages.id, row.id), eq(scheduledMessages.status, "pending")));
    if (claimed.count !== 1) continue; // cancelled (or taken) since we listed it

    const bot = await getBotForJob(row.botId);
    const token = bot && getBotToken(bot);
    if (!bot || !token) {
      await finish(row.id, { status: "failed", error: "The bot has no stored token." });
      continue;
    }
    try {
      const sent = await botApi.sendMessage(token, row.chatId, row.text, {
        parseMode: row.parseMode ?? undefined,
        buttons: parseButtons(row.buttons) ?? undefined,
      });
      await finish(row.id, { status: "sent", telegramMessageId: sent.message_id });
      await recordOutgoing(bot.id, sent);
    } catch (err) {
      await finish(row.id, { status: "failed", error: err instanceof BotApiError ? botApiFailure(err).error : "Couldn't reach Telegram." });
    }
  }
}

async function finish(id: number, result: { status: "sent" | "failed"; error?: string; telegramMessageId?: number }) {
  await db.update(scheduledMessages)
    .set({ status: result.status, error: result.error ?? null, telegramMessageId: result.telegramMessageId ?? null })
    .where(eq(scheduledMessages.id, id));
}
