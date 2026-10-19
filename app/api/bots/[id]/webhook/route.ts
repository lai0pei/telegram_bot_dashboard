import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById, getBotToken } from "@/lib/bots";
import { botApi } from "@/lib/botapi";
import { validateWebhookUrl } from "@/lib/validation";

/** PUT: sets or clears the bot's webhook. Body: { url: string | null, dropPendingUpdates?: boolean } */
export const PUT = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, userId: string) => {
  try {
    const { id } = await ctx.params;
    const bot = getBotById(Number(id), userId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const token = getBotToken(bot);
    if (!token) return NextResponse.json({ error: "No token stored for this bot." }, { status: 400 });

    const { url, dropPendingUpdates } = await req.json();

    if (!url) {
      await botApi.deleteWebhook(token, Boolean(dropPendingUpdates));
    } else {
      const error = validateWebhookUrl(url);
      if (error) return NextResponse.json({ error }, { status: 400 });
      await botApi.setWebhook(token, url);
    }

    const webhook = await botApi.getWebhookInfo(token);
    return NextResponse.json({ ok: true, webhook });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
