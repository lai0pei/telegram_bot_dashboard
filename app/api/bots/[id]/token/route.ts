import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { fetchBotToken } from "@/lib/botfather";
import { getBotById, getBotToken, saveBotToken } from "@/lib/bots";
import { singleFlight } from "@/lib/single-flight";

/** GET: returns the full (unmasked) token, fetching it from BotFather first if not cached. */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = await getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

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
