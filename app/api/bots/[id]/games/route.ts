import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotFatherError } from "@/lib/botfather";
import { createGame, validateAppPhoto } from "@/lib/botfather-apps";
import { getBotById } from "@/lib/bots";
import { listGames, saveGame } from "@/lib/games";
import { singleFlight } from "@/lib/single-flight";
import { validateAppShortName, validateAppTexts, validateHttpsUrlOrNull } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ games: (await listGames(bot.id)) });
  } catch (err) {
    return errorResponse(err);
  }
});

/**
 * POST multipart { title, description, shortName, photo (640×360 PNG/JPEG), url? }: creates the game through @BotFather
 * (/newgame). `url` is the HTML5 page a pressed Play button opens; it is kept here, since Telegram only learns it
 * when the bot answers the button press (which this dashboard does while monitoring is on).
 */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const form = await req.formData().catch(() => null);
    const title = form?.get("title");
    const description = form?.get("description");
    const shortName = form?.get("shortName");
    const photo = form?.get("photo");
    const url = typeof form?.get("url") === "string" ? (form!.get("url") as string).trim() : "";
    const error = validateAppTexts(title, description) ?? validateAppShortName(shortName) ?? (url ? validateHttpsUrlOrNull(url, "Game URL") : null);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!(photo instanceof File)) return NextResponse.json({ error: "A 640×360 picture is required." }, { status: 400 });
    const data = Buffer.from(await photo.arrayBuffer());
    const photoError = validateAppPhoto(data);
    if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });

    const game = { title: title as string, description: description as string, shortName: shortName as string };
    await singleFlight(`newgame:${telegramAccountId}:${bot.id}:${game.shortName}`, () =>
      createGame(telegramAccountId, bot.username, { ...game, photo: { name: photo.name || "game.png", data } })
    );
    return NextResponse.json({ game: (await saveGame(bot.id, { ...game, url: url || null })) });
  } catch (err) {
    return err instanceof BotFatherError ? NextResponse.json({ error: err.message }, { status: 502 }) : errorResponse(err);
  }
});
