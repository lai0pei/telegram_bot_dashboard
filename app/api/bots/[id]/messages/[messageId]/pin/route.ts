import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { db } from "@/lib/db";
import { botMessages } from "@/lib/db/schema";
import { toMessageRow } from "@/lib/messages";

/** POST { pinned: boolean }: pins or unpins a message in its chat (the bot needs the right to pin in groups/channels). */
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
      if (typeof body?.pinned !== "boolean") return NextResponse.json({ error: "pinned (true/false) is required." }, { status: 400 });
      const telegramMessageId = row.telegramMessageId;

      await withLiveBotToken(bot, userId, (token) =>
        body.pinned
          ? botApi.pinChatMessage(token, row.chatId, telegramMessageId)
          : botApi.unpinChatMessage(token, row.chatId, telegramMessageId)
      );
      const updated = db.update(botMessages).set({ pinned: body.pinned }).where(eq(botMessages.id, row.id)).returning().get();
      return NextResponse.json({ message: toMessageRow(updated) });
    } catch (err) {
      return botApiErrorResponse(err) ?? errorResponse(err);
    }
  }
);
