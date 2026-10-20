import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { refreshBotHealth } from "@/lib/health";
import { singleFlight } from "@/lib/single-flight";

/** POST: runs the health check now (the same one the background job runs every 10 minutes) and returns the result. */
export const POST = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const result = await singleFlight(`health:${bot.id}`, () => refreshBotHealth(bot));
    if (!result) return NextResponse.json({ error: "Couldn't reach Telegram. Try again in a moment." }, { status: 502 });
    return NextResponse.json({ health: { ...result, checkedAt: new Date() } });
  } catch (err) {
    return errorResponse(err);
  }
});
