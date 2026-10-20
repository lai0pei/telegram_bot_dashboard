import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
<<<<<<< HEAD
import { botApiErrorResponse } from "@/lib/bot-api-errors";
import { getBotById, getBotToken, setMonitorEnabled } from "@/lib/bots";
=======
import { getBotById, getBotToken, setWebhookHealth } from "@/lib/bots";
>>>>>>> a05ef6cc882ff2f00a1a66315cd22f35b5d75cda
import { botApi } from "@/lib/botapi";
import {
  validateAllowedUpdates,
  validateMaxConnections,
  validateWebhookSecret,
  validateWebhookUrl,
} from "@/lib/validation";

/**
 * PUT: sets or clears the bot's webhook.
 * Body: { url: string | null, dropPendingUpdates?, secretToken?, allowedUpdates?, maxConnections? }
 * Setting a webhook switches the dashboard's getUpdates monitoring off (Telegram delivers via one or the other).
 */
export const PUT = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const token = getBotToken(bot);
    if (!token) return NextResponse.json({ error: "No token stored for this bot." }, { status: 400 });

    const { url, dropPendingUpdates, secretToken, allowedUpdates, maxConnections } = await req.json();

    if (!url) {
      await botApi.deleteWebhook(token, Boolean(dropPendingUpdates));
    } else {
      const error =
        validateWebhookUrl(url) ??
        (secretToken ? validateWebhookSecret(secretToken) : null) ??
        (allowedUpdates !== undefined ? validateAllowedUpdates(allowedUpdates) : null) ??
        (maxConnections !== undefined ? validateMaxConnections(maxConnections) : null);
      if (error) return NextResponse.json({ error }, { status: 400 });
      await botApi.setWebhook(token, url, {
        secretToken: secretToken || undefined,
        // An empty list resets to Telegram's default; omitting the field would keep the previous setting.
        allowedUpdates: Array.isArray(allowedUpdates) ? allowedUpdates : undefined,
        maxConnections,
        dropPendingUpdates: Boolean(dropPendingUpdates),
      });
      setMonitorEnabled(bot.id, false);
    }

    const webhook = await botApi.getWebhookInfo(token);
    setWebhookHealth(bot.id, webhook.last_error_message ?? null, webhook.pending_update_count ?? null);
    return NextResponse.json({ ok: true, webhook });
  } catch (err) {
    return botApiErrorResponse(err) ?? errorResponse(err, 400);
  }
});
