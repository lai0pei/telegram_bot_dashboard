import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { listBusinessConnections, toBusinessConnectionDto } from "@/lib/business";

/** GET: the Telegram Business accounts that connected this bot, as recorded from business_connection updates (local DB only). */
export const GET = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const connections = listBusinessConnections(bot.id)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(toBusinessConnectionDto);
    return NextResponse.json({ connections, monitorEnabled: bot.monitorEnabled });
  } catch (err) {
    return errorResponse(err);
  }
});
