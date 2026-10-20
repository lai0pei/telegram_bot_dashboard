import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { getBotStats } from "@/lib/bot-stats";

/** GET: usage numbers for one bot, computed from the local message/user mirror (no Bot API calls). */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ ...getBotStats(bot.id), monitorEnabled: bot.monitorEnabled });
  } catch (err) {
    return errorResponse(err);
  }
});
