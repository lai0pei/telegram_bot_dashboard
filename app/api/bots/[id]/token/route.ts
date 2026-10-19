import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { fetchBotToken } from "@/lib/botfather";
import { getBotById, getBotToken, saveBotToken } from "@/lib/bots";

/** GET: returns the full (unmasked) token, fetching it from BotFather first if not cached. */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id));
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    let token = getBotToken(bot);
    if (!token) {
      token = await fetchBotToken(bot.username);
      saveBotToken(bot.id, token);
    }

    return NextResponse.json({ token });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
