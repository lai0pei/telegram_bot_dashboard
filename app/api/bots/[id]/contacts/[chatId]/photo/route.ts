import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotApiError, botApi, downloadBotFile } from "@/lib/botapi";
import { getBotById, getBotToken, withLiveBotToken } from "@/lib/bots";
import { getCachedPhoto, photoKey, photoResponse } from "@/lib/photos";
import { validateChatId } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; chatId: string }> };

/** GET: the contact's (user, group or channel) small profile photo as the bot sees it, or 404. Revalidated by ETag. */
export const GET = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, chatId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (validateChatId(chatId)) return NextResponse.json({ error: "Invalid chat ID." }, { status: 400 });
    // No stored token: an avatar isn't worth opening a BotFather conversation for.
    if (!getBotToken(bot)) return photoResponse(req, null);

    const photo = await getCachedPhoto(photoKey(telegramAccountId, "bot-chat", `${bot.id}:${chatId}`), async () => {
      const { result } = await withLiveBotToken(bot, telegramAccountId, async (token) => {
        try {
          const chat = await botApi.getChat(token, chatId);
          return chat.photo ? (await downloadBotFile(token, chat.photo.small_file_id)).data : null;
        } catch (err) {
          // A chat the bot can't see (never started it, blocked it, was removed) simply has no photo to show.
          // 401 is left to propagate so withLiveBotToken can heal the token.
          if (err instanceof BotApiError && (err.errorCode === 400 || err.errorCode === 403)) return null;
          throw err;
        }
      });
      return result;
    });
    return photoResponse(req, photo);
  } catch (err) {
    return errorResponse(err);
  }
});
