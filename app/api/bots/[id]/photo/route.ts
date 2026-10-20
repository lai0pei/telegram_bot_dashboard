import { NextResponse } from "next/server";
import { ownedBotOnly } from "@/lib/token-bot";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotPhotoError, deleteBotPhoto, getBotById, getBotPhoto, setBotPhoto } from "@/lib/bots";
import { getCachedPhoto, invalidatePhoto, photoKey, photoResponse } from "@/lib/photos";
import { recordSetup } from "@/lib/setup-cache";
import { validateProfileMedia } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET: the bot's small profile photo (JPEG), or 404 if it has none. Cached server-side and privately in the browser. */
export const GET = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const photo = await getCachedPhoto(photoKey(telegramAccountId, "bot", bot.id), () =>
      getBotPhoto(telegramAccountId, bot)
    );
    await recordSetup(bot.id, { photo: Boolean(photo && photo.length > 0) });
    return photoResponse(req, photo);
  } catch (err) {
    return errorResponse(err);
  }
});

/** PUT multipart/form-data { file }: sets the bot's profile photo (JPEG/PNG) or profile video (MP4). */
export const PUT = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo file is required." }, { status: 400 });
    const fileError = validateProfileMedia(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const video = file.type === "video/mp4";
    await setBotPhoto(telegramAccountId, bot, {
      name: file.name || (video ? "profile.mp4" : "photo.jpg"),
      data: Buffer.from(await file.arrayBuffer()),
      video,
    });
    invalidatePhoto(photoKey(telegramAccountId, "bot", bot.id));
    await recordSetup(bot.id, { photo: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return err instanceof BotPhotoError ? NextResponse.json({ error: err.message }, { status: 400 }) : errorResponse(err);
  }
});

/** DELETE: removes the bot's profile photo. */
export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;
    await deleteBotPhoto(telegramAccountId, bot);
    invalidatePhoto(photoKey(telegramAccountId, "bot", bot.id));
    await recordSetup(bot.id, { photo: false });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return err instanceof BotPhotoError ? NextResponse.json({ error: err.message }, { status: 400 }) : errorResponse(err);
  }
});
