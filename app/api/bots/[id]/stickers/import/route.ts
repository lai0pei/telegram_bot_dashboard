import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { isOwnStickerSetName, saveStickerSetRow } from "@/lib/stickers";

/** POST { name }: starts tracking an existing set this bot created (Telegram can't list them). Must end in _by_<bot username>. */
export const POST = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim().replace(/^https?:\/\/t\.me\/addstickers\//i, "") : "";
    if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) return NextResponse.json({ error: "Enter the set's short name, or its t.me/addstickers link." }, { status: 400 });
    if (!isOwnStickerSetName(name, bot.username)) {
      return NextResponse.json({ error: `Only sets created by this bot can be managed: the name must end in _by_${bot.username}.` }, { status: 422 });
    }
    const { result } = await withLiveBotToken(bot, telegramAccountId, (token) => botApi.getStickerSet(token, name));
    saveStickerSetRow(bot.id, { name: result.name, title: result.title, type: result.sticker_type });
    return NextResponse.json({ name: result.name });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
