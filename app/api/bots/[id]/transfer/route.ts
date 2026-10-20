import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotFatherError } from "@/lib/botfather";
import { transferBot } from "@/lib/botfather-apps";
import { deleteBotRow, getBotById } from "@/lib/bots";
import { singleFlight } from "@/lib/single-flight";
import { validateTelegramUsername } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { recipient, password, confirm }: hands the bot to another Telegram user through @BotFather. `password` is the
 * account's 2FA password, needed to confirm; it is used for this request only and is never stored or logged. `confirm`
 * must be the bot's username, as for deletion. The bot is removed from this dashboard once Telegram no longer lists it
 * among the account's bots.
 */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const error = validateTelegramUsername(body?.recipient);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (typeof body.password !== "string" || !body.password) return NextResponse.json({ error: "Your 2FA password is required to transfer a bot." }, { status: 400 });
    if (body.confirm !== bot.username) return NextResponse.json({ error: "Type the bot's username to confirm." }, { status: 400 });

    await singleFlight(`transfer:${telegramAccountId}:${bot.id}`, async () => {
      await transferBot(telegramAccountId, bot.username, body.recipient.trim(), body.password);
      deleteBotRow(bot.id);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A BotFatherError quotes BotFather, never the password, so it is safe to show.
    return err instanceof BotFatherError ? NextResponse.json({ error: err.message }, { status: 502 }) : errorResponse(err);
  }
});
