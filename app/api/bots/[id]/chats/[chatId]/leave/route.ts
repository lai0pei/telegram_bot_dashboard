import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { loadBotChat, type BotChatParams } from "@/lib/bot-chat-route";
import { upsertBotChat } from "@/lib/bot-chats";
import { withLiveBotToken } from "@/lib/bots";

/** POST: the bot leaves the chat. The row stays (status "left") so it can be re-added and its history kept. */
export const POST = withAuth(async (_req: Request, ctx: BotChatParams, telegramAccountId: string) => {
  try {
    const loaded = await loadBotChat(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, chat } = loaded;

    await withLiveBotToken(bot, telegramAccountId, (token) => botApi.leaveChat(token, chat.chatId));
    upsertBotChat(bot.id, { chatId: chat.chatId, type: chat.type, title: chat.title, username: chat.username, status: "left", rights: null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
