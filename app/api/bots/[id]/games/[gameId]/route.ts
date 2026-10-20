import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotFatherError } from "@/lib/botfather";
import { deleteGame } from "@/lib/botfather-apps";
import { getBotById } from "@/lib/bots";
import { getGame, removeGame, setGameUrl } from "@/lib/games";
import { singleFlight } from "@/lib/single-flight";
import { validateHttpsUrlOrNull } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; gameId: string }> };

/** PATCH { url }: the page the game's Play button opens ("" clears it). Local only; nothing is sent to Telegram. */
export const PATCH = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, gameId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    if (!bot || !(await getGame(bot.id, Number(gameId)))) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url.trim() : null;
    if (url === null) return NextResponse.json({ error: "A url is required (empty to clear it)." }, { status: 400 });
    const error = url ? validateHttpsUrlOrNull(url, "Game URL") : null;
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ game: (await setGameUrl(bot.id, Number(gameId), url || null)) });
  } catch (err) {
    return errorResponse(err);
  }
});

/** DELETE: deletes the game through @BotFather (/deletegame), then forgets it here. */
export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, gameId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    const game = bot && (await getGame(bot.id, Number(gameId)));
    if (!bot || !game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    await singleFlight(`deletegame:${telegramAccountId}:${game.id}`, async () => {
      await deleteGame(telegramAccountId, bot.username, game);
      await removeGame(bot.id, game.id);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return err instanceof BotFatherError ? NextResponse.json({ error: err.message }, { status: 502 }) : errorResponse(err);
  }
});
