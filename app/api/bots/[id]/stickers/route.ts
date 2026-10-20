import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi, type StickerSetType } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, withLiveBotToken } from "@/lib/bots";
import { stickerFailure } from "@/lib/sticker-route";
import { fullStickerSetName, getStickerSetRow, listStickerSets, saveStickerSetRow, stickerOwnerId } from "@/lib/stickers";
import {
  splitEmoji,
  stickerFormatOf,
  validateStickerEmoji,
  validateStickerFile,
  validateStickerSetShortName,
  validateStickerTitle,
} from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET: the sticker sets tracked for this bot (created here or imported by name). */
export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ sets: listStickerSets(bot.id), botUsername: bot.username });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST multipart { name, title, type?, emoji, file }: creates a set owned by the active Telegram account, with one first sticker. */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
  if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
  try {
    const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
    const form = await req.formData().catch(() => null);
    if (!form) return bad("Invalid form data.");
    const short = String(form.get("name") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    const type = (String(form.get("type") ?? "regular") || "regular") as StickerSetType;
    const emojiText = String(form.get("emoji") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return bad("A sticker file is required.");
    if (type !== "regular" && type !== "custom_emoji") return bad("Type must be regular or custom_emoji.");
    const error =
      validateStickerSetShortName(short, bot.username) ?? validateStickerTitle(title) ?? validateStickerEmoji(emojiText) ?? validateStickerFile(file);
    if (error) return bad(error);

    const ownerId = stickerOwnerId(telegramAccountId);
    if (ownerId === null) return bad("No active Telegram account to own the set.");
    const name = fullStickerSetName(short, bot.username);
    if (getStickerSetRow(bot.id, name)) return NextResponse.json({ error: "You already have a set with that name." }, { status: 422 });

    const format = stickerFormatOf(file)!;
    const data = Buffer.from(await file.arrayBuffer());
    await withLiveBotToken(bot, telegramAccountId, async (token) => {
      const uploaded = await botApi.uploadStickerFile(token, ownerId, { name: file.name || "sticker", type: file.type || "application/octet-stream", data }, format);
      await botApi.createNewStickerSet(token, ownerId, name, title, [{ sticker: uploaded.file_id, format, emoji_list: splitEmoji(emojiText) }], type);
    });
    saveStickerSetRow(bot.id, { name, title, type });
    return NextResponse.json({ name });
  } catch (err) {
    return stickerFailure(err, bot.username) ?? botApiErrorResponse(err) ?? errorResponse(err);
  }
});
