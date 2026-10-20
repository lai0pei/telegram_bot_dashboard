import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { withLiveBotToken } from "@/lib/bots";
import { loadStickerSet, stickerFailure, type StickerSetParams } from "@/lib/sticker-route";
import { stickerOwnerId } from "@/lib/stickers";
import { splitEmoji, stickerFormatOf, validateStickerEmoji, validateStickerFile } from "@/lib/validation";

/** Telegram file IDs are URL-safe base64-ish strings. */
const FILE_ID = /^[\w-]{10,255}$/;

/** True when `fileId` is one of the stickers currently in the set (so an ID from elsewhere can't be edited through this route). */
async function inSet(bot: Parameters<typeof withLiveBotToken>[0], accountId: string, name: string, fileId: string): Promise<boolean> {
  const { result } = await withLiveBotToken(bot, accountId, (token) => botApi.getStickerSet(token, name));
  return result.stickers.some((s) => s.file_id === fileId);
}

/** POST multipart { emoji, file }: adds a sticker to the set. */
export const POST = withAuth(async (req: Request, ctx: StickerSetParams, telegramAccountId: string) => {
  const loaded = await loadStickerSet(ctx, telegramAccountId);
  if (loaded instanceof Response) return loaded;
  const { bot, set } = loaded;
  try {
    const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
    const form = await req.formData().catch(() => null);
    if (!form) return bad("Invalid form data.");
    const emojiText = String(form.get("emoji") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return bad("A sticker file is required.");
    const error = validateStickerEmoji(emojiText) ?? validateStickerFile(file);
    if (error) return bad(error);
    const ownerId = stickerOwnerId(telegramAccountId);
    if (ownerId === null) return bad("No active Telegram account to own the set.");

    const format = stickerFormatOf(file)!;
    const data = Buffer.from(await file.arrayBuffer());
    await withLiveBotToken(bot, telegramAccountId, async (token) => {
      const uploaded = await botApi.uploadStickerFile(token, ownerId, { name: file.name || "sticker", type: file.type || "application/octet-stream", data }, format);
      await botApi.addStickerToSet(token, ownerId, set.name, { sticker: uploaded.file_id, format, emoji_list: splitEmoji(emojiText) });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stickerFailure(err, bot.username) ?? botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** PATCH { fileId, position? , emoji? }: moves a sticker (zero-based position) and/or replaces its emoji. */
export const PATCH = withAuth(async (req: Request, ctx: StickerSetParams, telegramAccountId: string) => {
  try {
    const loaded = await loadStickerSet(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, set } = loaded;
    const body = await req.json().catch(() => null);
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    if (!FILE_ID.test(fileId)) return NextResponse.json({ error: "Invalid sticker." }, { status: 400 });
    const hasPosition = body?.position !== undefined;
    const hasEmoji = typeof body?.emoji === "string";
    if (!hasPosition && !hasEmoji) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    if (hasPosition && (!Number.isInteger(body.position) || body.position < 0 || body.position > 199)) {
      return NextResponse.json({ error: "Invalid position." }, { status: 400 });
    }
    if (hasEmoji) {
      const error = validateStickerEmoji(body.emoji);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    if (!(await inSet(bot, telegramAccountId, set.name, fileId))) return NextResponse.json({ error: "That sticker isn't in this set." }, { status: 404 });

    await withLiveBotToken(bot, telegramAccountId, async (token) => {
      if (hasEmoji) await botApi.setStickerEmojiList(token, fileId, splitEmoji(body.emoji));
      if (hasPosition) await botApi.setStickerPositionInSet(token, fileId, body.position);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});

/** DELETE ?fileId=: removes a sticker from the set. */
export const DELETE = withAuth(async (req: Request, ctx: StickerSetParams, telegramAccountId: string) => {
  try {
    const loaded = await loadStickerSet(ctx, telegramAccountId);
    if (loaded instanceof Response) return loaded;
    const { bot, set } = loaded;
    const fileId = new URL(req.url).searchParams.get("fileId") ?? "";
    if (!FILE_ID.test(fileId)) return NextResponse.json({ error: "Invalid sticker." }, { status: 400 });
    if (!(await inSet(bot, telegramAccountId, set.name, fileId))) return NextResponse.json({ error: "That sticker isn't in this set." }, { status: 404 });
    await withLiveBotToken(bot, telegramAccountId, (token) => botApi.deleteStickerFromSet(token, fileId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
