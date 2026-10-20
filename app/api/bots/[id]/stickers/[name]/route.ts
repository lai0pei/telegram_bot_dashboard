import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotApiError, botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { withLiveBotToken } from "@/lib/bots";
import { loadStickerSet, type StickerSetParams } from "@/lib/sticker-route";
import { removeStickerSetRow, saveStickerSetRow } from "@/lib/stickers";
import { validateStickerTitle } from "@/lib/validation";

/** GET: the set as Telegram has it now (its stickers with file IDs and thumbnails). If it no longer exists there, the tracking row is dropped. */
export const GET = withAuth(async (_req: Request, ctx: StickerSetParams, telegramAccountId: string) => {
  try {
    const loaded = await loadStickerSet(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, set } = loaded;
    try {
      const { result } = await withLiveBotToken(bot, telegramAccountId, (token) => botApi.getStickerSet(token, set.name));
      return NextResponse.json({ set: result });
    } catch (err) {
      if (err instanceof BotApiError && err.errorCode === 400) {
        removeStickerSetRow(bot.id, set.name);
        return NextResponse.json({ error: "That set no longer exists on Telegram, so it was removed from this list." }, { status: 404 });
      }
      throw err;
    }
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** PATCH { title }: renames the set. */
export const PATCH = withAuth(async (req: Request, ctx: StickerSetParams, telegramAccountId: string) => {
  try {
    const loaded = await loadStickerSet(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, set } = loaded;
    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const error = validateStickerTitle(title);
    if (error) return NextResponse.json({ error }, { status: 400 });
    await withLiveBotToken(bot, telegramAccountId, (token) => botApi.setStickerSetTitle(token, set.name, title));
    saveStickerSetRow(bot.id, { name: set.name, title, type: set.type });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** DELETE: deletes the set on Telegram and stops tracking it. */
export const DELETE = withAuth(async (_req: Request, ctx: StickerSetParams, telegramAccountId: string) => {
  try {
    const loaded = await loadStickerSet(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, set } = loaded;
    await withLiveBotToken(bot, telegramAccountId, (token) => botApi.deleteStickerSet(token, set.name));
    removeStickerSetRow(bot.id, set.name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
