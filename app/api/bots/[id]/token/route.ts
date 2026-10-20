import { NextResponse } from "next/server";
import { ownedBotOnly } from "@/lib/token-bot";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { fetchBotToken } from "@/lib/botfather";
import { getBotById, getBotToken, isTokenBot, replaceBotToken, saveBotToken } from "@/lib/bots";
import { rateLimit } from "@/lib/rate-limit";
import { singleFlight } from "@/lib/single-flight";

/** GET: returns the full (unmasked) token, fetching it from BotFather first if not cached. */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = await getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;

    const token =
      getBotToken(bot) ??
      (await singleFlight(`token:${userId}:${bot.id}`, async () => {
        const fetched = await fetchBotToken(userId, bot.username);
        await saveBotToken(bot.id, fetched);
        return fetched;
      }));

    return NextResponse.json({ token });
  } catch (err) {
    return errorResponse(err, 400);
  }
});

/** PUT { token }: for a bot added by token, replaces the stored token after its owner rotated it. Must be the same bot. */
export const PUT = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = await getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!isTokenBot(bot)) {
      return NextResponse.json({ error: "Only for bots added with a token. Use “Revoke token” for your own bots." }, { status: 422 });
    }
    // Each attempt asks Telegram to verify a guess, so it shares the add-by-token budget.
    if (!rateLimit(`add-token:${userId}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    const body = await req.json().catch(() => null);
    if (typeof body?.token !== "string") return NextResponse.json({ error: "The token is required." }, { status: 400 });
    await replaceBotToken(bot, body.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
