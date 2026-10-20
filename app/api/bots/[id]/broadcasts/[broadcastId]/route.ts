import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { cancelBroadcast } from "@/lib/broadcast";
import { getBotById } from "@/lib/bots";

/** DELETE: stop a queued or running broadcast. Messages already delivered stay delivered. */
export const DELETE = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string; broadcastId: string }> }, telegramAccountId: string) => {
  try {
    const { id, broadcastId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!cancelBroadcast(bot.id, Number(broadcastId))) {
      return NextResponse.json({ error: "That broadcast isn't running any more." }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
