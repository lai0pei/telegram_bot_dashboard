import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { botApi } from "@/lib/botapi";
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, getBotToken, withLiveBotToken } from "@/lib/bots";
import { validateChatId } from "@/lib/validation";

/** POST { chatId }: shows "typing…" in that chat for a few seconds. Best effort; skipped when no token is stored. */
export const POST = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (typeof body?.chatId !== "string" || validateChatId(body.chatId)) {
      return NextResponse.json({ error: "A valid chatId is required." }, { status: 400 });
    }
    if (!getBotToken(bot)) return NextResponse.json({ ok: false });
    await withLiveBotToken(bot, userId, (token) => botApi.sendChatAction(token, body.chatId, "typing"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err);
  }
});
