import { NextResponse } from "next/server";
import { ownedBotOnly } from "@/lib/token-bot";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { revokeBotToken } from "@/lib/botfather";
import { getBotById, saveBotToken } from "@/lib/bots";
import { singleFlight } from "@/lib/single-flight";

/** POST: revokes the current token via BotFather and stores the new one. */
export const POST = withAuth(async (_req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = await getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;

    const newToken = await singleFlight(`revoke:${userId}:${bot.id}`, async () => {
      const revoked = await revokeBotToken(userId, bot.username);
      await saveBotToken(bot.id, revoked);
      return revoked;
    });

    return NextResponse.json({ ok: true, token: newToken });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
