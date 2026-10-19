import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { revokeBotToken } from "@/lib/botfather";
import { getBotById, saveBotToken } from "@/lib/bots";

/** POST: revokes the current token via BotFather and stores the new one. */
export const POST = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id));
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const newToken = await revokeBotToken(bot.username);
    saveBotToken(bot.id, newToken);

    return NextResponse.json({ ok: true, token: newToken });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
