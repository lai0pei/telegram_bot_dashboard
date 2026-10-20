import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { db } from "@/lib/db";
import { botMessages } from "@/lib/db/schema";
import { describeMessage, toMessageRow } from "@/lib/messages";
import { validateChatId } from "@/lib/validation";

/** POST { toChatId, copy?: boolean }: forwards (or, with copy, re-sends without the "forwarded from" header) a message. */
export const POST = withAuth(
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
      if (!row || row.telegramMessageId == null) return NextResponse.json({ error: "Message not found." }, { status: 404 });
      if (row.businessConnectionId) return NextResponse.json({ error: "That action isn't available for business chats." }, { status: 422 });

      const body = await req.json().catch(() => null);
      if (typeof body?.toChatId !== "string") return NextResponse.json({ error: "toChatId is required." }, { status: 400 });
      const chatIdError = validateChatId(body.toChatId);
      if (chatIdError) return NextResponse.json({ error: chatIdError }, { status: 400 });
      const toChatId: string = body.toChatId.trim();
      const telegramMessageId = row.telegramMessageId;

      let newTelegramId: number;
      let text = row.text;
      let mediaType = row.mediaType;
      let raw = row.raw;
      if (body.copy === true) {
        const { result } = await withLiveBotToken(bot, userId, (token) =>
          botApi.copyMessage(token, toChatId, row.chatId, telegramMessageId)
        );
        newTelegramId = result.message_id;
      } else {
        const { result } = await withLiveBotToken(bot, userId, (token) =>
          botApi.forwardMessage(token, toChatId, row.chatId, telegramMessageId)
        );
        newTelegramId = result.message_id;
        ({ text, mediaType } = describeMessage(result));
        raw = JSON.stringify(result);
      }

      const created = db
        .insert(botMessages)
        .values({
          botId: bot.id,
          chatId: toChatId,
          fromUserId: null,
          fromUsername: null,
          fromFirstName: null,
          direction: "out",
          text,
          mediaType,
          raw,
          telegramMessageId: newTelegramId,
          createdAt: new Date(),
        })
        .returning()
        .get();
      return NextResponse.json({ message: toMessageRow(created) });
    } catch (err) {
      return botApiErrorResponse(err) ?? errorResponse(err);
    }
  }
);
