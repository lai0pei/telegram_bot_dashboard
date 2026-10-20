import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { cancelScheduled } from "@/lib/scheduled";

/** DELETE: cancel a message that hasn't been sent yet. */
export const DELETE = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string; scheduledId: string }> }, telegramAccountId: string) => {
  try {
    const { id, scheduledId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!cancelScheduled(bot.id, Number(scheduledId))) {
      return NextResponse.json({ error: "That message is already being sent or was sent." }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
