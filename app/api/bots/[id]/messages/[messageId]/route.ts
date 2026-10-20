import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById, getBotToken, withLiveBotToken } from "@/lib/bots";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { toMessageRow } from "@/lib/messages";
import { validateMessageText, validateParseMode, validateCaption } from "@/lib/validation";
import type { ParseMode } from "@/lib/botapi";
import { db } from "@/lib/db";
import { botMessages } from "@/lib/db/schema";
import { BotApiError, botApi } from "@/lib/botapi";

/** DELETE: removes one message from the dashboard and, best effort, from Telegram (Bot API allows it for ~48h). */
export const DELETE = withAuth(
  async (_req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }, userId: string) => {
    try {
      const { id, messageId } = await ctx.params;
      const bot = getBotById(Number(id), userId);
      if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

      const row = db
        .select()
        .from(botMessages)
        .where(and(eq(botMessages.id, Number(messageId)), eq(botMessages.botId, bot.id)))
        .all()[0];
      if (!row) return NextResponse.json({ error: "Message not found." }, { status: 404 });

      let deletedInTelegram = false;
      // Only with a stored token: healing a missing one would open BotFather just for a best-effort delete.
      const telegramMessageId = row.telegramMessageId;
      if (getBotToken(bot) && telegramMessageId != null && !row.businessConnectionId) {
        try {
          await withLiveBotToken(bot, userId, (token) => botApi.deleteMessage(token, row.chatId, telegramMessageId));
          deletedInTelegram = true;
        } catch {
          // Too old, already gone, or no rights: the local row is still removed.
        }
      }

      db.delete(botMessages).where(eq(botMessages.id, row.id)).run();
      return NextResponse.json({ ok: true, deletedInTelegram });
    } catch (err) {
      return errorResponse(err);
    }
  }
);

/** PATCH { text, parseMode? }: edits one of the bot's own sent messages (text, or the caption of a media message). */
export const PATCH = withAuth(
  async (req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }, userId: string) => {
    try {
      const { id, messageId } = await ctx.params;
      const bot = getBotById(Number(id), userId);
      if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

      const row = db
        .select()
        .from(botMessages)
        .where(and(eq(botMessages.id, Number(messageId)), eq(botMessages.botId, bot.id)))
        .all()[0];
      if (!row) return NextResponse.json({ error: "Message not found." }, { status: 404 });
      if (row.businessConnectionId) return NextResponse.json({ error: "That action isn't available for business chats." }, { status: 422 });
      if (row.direction !== "out" || row.telegramMessageId == null) {
        return NextResponse.json({ error: "Only messages this bot sent can be edited." }, { status: 400 });
      }

      const body = await req.json().catch(() => null);
      const text = body?.text;
      if (typeof text !== "string") return NextResponse.json({ error: "text is required." }, { status: 400 });
      const isMedia = row.mediaType !== null;
      const textError = isMedia ? validateCaption(text) : validateMessageText(text);
      if (textError) return NextResponse.json({ error: textError }, { status: 400 });
      const parseModeError = validateParseMode(body?.parseMode);
      if (parseModeError) return NextResponse.json({ error: parseModeError }, { status: 400 });
      const opts = { parseMode: (body?.parseMode || undefined) as ParseMode | undefined };
      const telegramMessageId = row.telegramMessageId;

      await withLiveBotToken(bot, userId, (token) =>
        isMedia
          ? botApi.editMessageCaption(token, row.chatId, telegramMessageId, text, opts)
          : botApi.editMessageText(token, row.chatId, telegramMessageId, text, opts)
      ).catch((err) => {
        // Telegram rejects an edit that changes nothing; for the user that's simply done.
        if (!(err instanceof BotApiError && /message is not modified/i.test(err.description))) throw err;
      });

      const updated = db
        .update(botMessages)
        .set({ text, editedAt: new Date() })
        .where(eq(botMessages.id, row.id))
        .returning()
        .get();
      return NextResponse.json({ message: toMessageRow(updated) });
    } catch (err) {
      return botApiErrorResponse(err) ?? errorResponse(err);
    }
  }
);
