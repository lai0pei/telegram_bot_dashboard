import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { addBotByToken } from "@/lib/bots";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST { token }: adds a bot this account doesn't own, from its token (someone gave it to you to manage). The token is
 * verified with Telegram before anything is stored. Answers the bot's id and whether it currently has a webhook, which
 * the dialog explains (monitoring can't run next to the owner's own server).
 */
export const POST = withAuth(async (req: Request, _ctx, telegramAccountId: string) => {
  try {
    // Every attempt makes Telegram check a guess, so this is per account, not per IP.
    if (!rateLimit(`add-token:${telegramAccountId}`, 10, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    }
    const body = await req.json().catch(() => null);
    if (typeof body?.token !== "string") return NextResponse.json({ error: "The token is required." }, { status: 400 });
    const { bot, webhookUrl } = await addBotByToken(telegramAccountId, body.token);
    return NextResponse.json({ ok: true, id: bot.id, username: bot.username, firstName: bot.firstName, webhookUrl });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
