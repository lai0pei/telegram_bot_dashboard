import { NextResponse } from "next/server";
import { getBotChat, type BotChatRow } from "./bot-chats";
import { getBotById, type BotRow } from "./bots";
import { validateChatId } from "./validation";

/** Route params for /api/bots/[id]/chats/[chatId]/... */
export type BotChatParams = { params: Promise<{ id: string; chatId: string }> };

/**
 * Resolves the bot (scoped to the active Telegram account) and its tracked chat for a route, or the 400/404
 * response to return instead. Check the result with `instanceof Response`.
 */
export async function loadBotChat(
  ctx: BotChatParams,
  telegramAccountId: string
): Promise<{ bot: BotRow; chat: BotChatRow } | Response> {
  const { id, chatId } = await ctx.params;
  const bot = getBotById(Number(id), telegramAccountId);
  if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
  const chatIdError = validateChatId(chatId);
  if (chatIdError) return NextResponse.json({ error: chatIdError }, { status: 400 });
  const chat = getBotChat(bot.id, chatId);
  if (!chat) return NextResponse.json({ error: "The bot isn't tracking that chat. Add it first." }, { status: 404 });
  return { bot, chat };
}
