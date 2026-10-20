import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { getGame } from "@/lib/games";
import { recordOutgoing } from "@/lib/outgoing";
import { validateChatId } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; gameId: string }> };

/** POST { chatId }: sends the game to a chat. Telegram adds the Play button itself; pressing it is answered while monitoring is on. */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, gameId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    const game = bot && getGame(bot.id, Number(gameId));
    if (!bot || !game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (typeof body?.chatId !== "string" || validateChatId(body.chatId)) return NextResponse.json({ error: "A valid chat ID is required." }, { status: 400 });
    const sent = await withLiveBotToken(bot, telegramAccountId, (token) => botApi.sendGame(token, body.chatId, game.shortName));
    recordOutgoing(bot.id, sent.result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
