import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById, getBotToken, setMonitorEnabled } from "@/lib/bots";
import { botApi } from "@/lib/botapi";

/**
 * PUT: enables/disables the getUpdates poller for a bot. Refuses to enable
 * monitoring while a webhook is set, since Telegram won't deliver updates
 * through both getUpdates and a webhook at once.
 */
export const PUT = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id));
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const { enabled } = await req.json();

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

    setMonitorEnabled(bot.id, Boolean(enabled));
    return NextResponse.json({ ok: true, monitorEnabled: Boolean(enabled) });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
