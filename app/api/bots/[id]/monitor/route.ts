import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotRunElsewhereError, disableMonitoring, enableMonitoring } from "@/lib/bot-claims";
import { getBotById, getBotToken } from "@/lib/bots";
import { botApi } from "@/lib/botapi";

/**
 * PUT: enables/disables the getUpdates poller for a bot. Refuses to enable
 * monitoring while a webhook is set, since Telegram won't deliver updates
 * through both getUpdates and a webhook at once.
 */
export const PUT = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = await getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const { enabled, takeOver } = await req.json();

    if (enabled) {
      const token = getBotToken(bot);
      if (!token) return NextResponse.json({ error: "No token stored for this bot." }, { status: 400 });
      const webhook = await botApi.getWebhookInfo(token);
      if (webhook.url) {
        return NextResponse.json(
          { error: "This bot has a webhook set. Remove it before enabling monitoring." },
          { status: 400 }
        );
      }
    }

    if (enabled) await enableMonitoring(bot, Boolean(takeOver));
    else await disableMonitoring(bot);
    return NextResponse.json({ ok: true, monitorEnabled: Boolean(enabled) });
  } catch (err) {
    // 422, never 409: the client reserves 409 for NO_ACTIVE_ACCOUNT / SESSION_REVOKED.
    if (err instanceof BotRunElsewhereError) {
      return NextResponse.json({ error: err.message, code: "BOT_RUN_ELSEWHERE", holder: err.holderName, since: err.since }, { status: 422 });
    }
    return errorResponse(err, 400);
  }
});
