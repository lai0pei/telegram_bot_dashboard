import { NextResponse } from "next/server";
import { BotApiError } from "./botapi";
import { botApiFailure } from "./bot-api-errors";
import { getBotById, type BotRow } from "./bots";
import { getStickerSetRow, type StickerSetRow } from "./stickers";

/** Route params for /api/bots/[id]/stickers/[name]/... */
export type StickerSetParams = { params: Promise<{ id: string; name: string }> };

/** The bot and its stored sticker set for a route, or the 404 response to return instead (check with `instanceof Response`). */
export async function loadStickerSet(ctx: StickerSetParams, telegramAccountId: string): Promise<{ bot: BotRow; set: StickerSetRow } | Response> {
  const { id, name } = await ctx.params;
  const bot = getBotById(Number(id), telegramAccountId);
  if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
  const set = getStickerSetRow(bot.id, name);
  if (!set) return NextResponse.json({ error: "That sticker set isn't tracked for this bot." }, { status: 404 });
  return { bot, set };
}

/**
 * Telegram's own description for a failed sticker call, plus the one thing worth trying: creating or adding stickers
 * is done on behalf of a user, and Telegram can refuse a user who never started the bot. The hint is appended to
 * every such failure instead of matching Telegram's wording.
 */
export function stickerFailure(err: unknown, botUsername: string): Response | null {
  if (!(err instanceof BotApiError)) return null;
  const { error, status } = botApiFailure(err);
  return NextResponse.json(
    { error: `${error} If it keeps failing, open @${botUsername} in Telegram, press Start, then retry (the sticker owner may need to have started the bot).` },
    { status }
  );
}
