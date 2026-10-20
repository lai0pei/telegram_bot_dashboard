import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi, type TelegramMessage } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { db } from "@/lib/db";
import { botMessages } from "@/lib/db/schema";
import { toMessageRow } from "@/lib/messages";

/** POST: stops one of the bot's own polls; Telegram returns the final results, which replace the stored poll. */
export const POST = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }, telegramAccountId: string) => {
  try {
    const { id, messageId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const row = db
      .select()
      .from(botMessages)
      .where(and(eq(botMessages.id, Number(messageId)), eq(botMessages.botId, bot.id)))
      .all()[0];
    if (!row) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    if (row.businessConnectionId) return NextResponse.json({ error: "That action isn't available for business chats." }, { status: 422 });
    const telegramMessageId = row.telegramMessageId;
    if (row.mediaType !== "poll" || row.direction !== "out" || telegramMessageId == null) {
      return NextResponse.json({ error: "Only polls this bot sent can be stopped." }, { status: 400 });
    }

    const { result: poll } = await withLiveBotToken(bot, telegramAccountId, (token) => botApi.stopPoll(token, row.chatId, telegramMessageId));

    const message = JSON.parse(row.raw ?? "{}") as TelegramMessage;
    const updated = db
      .update(botMessages)
      .set({ raw: JSON.stringify({ ...message, poll }) })
      .where(eq(botMessages.id, row.id))
      .returning()
      .get();
    return NextResponse.json({ message: toMessageRow(updated) });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
