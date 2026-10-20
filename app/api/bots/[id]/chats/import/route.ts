import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotApiError } from "@/lib/botapi";
import { NotAChatError, refreshBotChat } from "@/lib/bot-chats";
import { getBotById } from "@/lib/bots";
import { botApiChatId, listChats } from "@/lib/chats";

/** Telegram allows ~30 bot requests/s, and each chat costs two, so keep a single import bounded. */
const MAX_CHATS = 150;

/**
 * POST: checks every channel/group the active account owns or admins (the local chat list) and tracks the ones the
 * bot is a member of. A chat the bot isn't in simply doesn't match; it is not an error.
 */
export const POST = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const candidates = listChats(telegramAccountId);
    const toCheck = candidates.slice(0, MAX_CHATS);
    let found = 0;
    let stoppedEarly: string | null = null;
    for (const chat of toCheck) {
      try {
        if (await refreshBotChat(bot, telegramAccountId, botApiChatId(chat))) found++;
      } catch (err) {
        if (err instanceof BotApiError && err.errorCode === 429) {
          stoppedEarly = `Telegram asked the bot to slow down${err.retryAfter ? ` (${err.retryAfter}s)` : ""}. Try the rest again shortly.`;
          break;
        }
        // "chat not found" / forbidden / not a member: the bot just isn't there.
        if (!(err instanceof BotApiError || err instanceof NotAChatError)) throw err;
      }
    }
    return NextResponse.json({
      checked: toCheck.length,
      found,
      skipped: candidates.length - toCheck.length,
      note: stoppedEarly,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
