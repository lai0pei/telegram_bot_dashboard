import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { botApi, botApiChatName } from "@/lib/botapi";
import { upsertBotUser } from "@/lib/bot-users";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { invalidatePhoto, photoKey } from "@/lib/photos";
import { validateChatId } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; chatId: string }> };

/** POST: re-reads the contact's name/username (and photo) from Telegram via getChat and updates the local row. */
export const POST = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, chatId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const chatIdError = validateChatId(chatId);
    if (chatIdError) return NextResponse.json({ error: chatIdError }, { status: 400 });

    const { result: chat } = await withLiveBotToken(bot, telegramAccountId, (token) => botApi.getChat(token, chatId));
    const name = chat.type === "private" ? chat.first_name ?? null : chat.title ?? null;
    upsertBotUser(bot.id, chatId, { username: chat.username ?? null, firstName: name, touch: false });
    invalidatePhoto(photoKey(telegramAccountId, "bot-chat", `${bot.id}:${chatId}`));

    return NextResponse.json({ chatId, name: botApiChatName(chat) ?? chatId, username: chat.username ?? null });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
