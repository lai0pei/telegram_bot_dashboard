import { NextResponse } from "next/server";
import { ownedBotOnly } from "@/lib/token-bot";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { BotUsernameError, getBotById, listBotUsernames, reorderBotUsernames, setBotUsernameActive } from "@/lib/bots";

type Ctx = { params: Promise<{ id: string }> };

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

const fail = (err: unknown) => (err instanceof BotUsernameError ? NextResponse.json({ error: err.message }, { status: 422 }) : errorResponse(err));

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;
    return NextResponse.json({ usernames: await listBotUsernames(telegramAccountId, bot) });
  } catch (err) {
    return fail(err);
  }
});

/** PATCH { username, active } switches a collectible username on/off; { order: string[] } reorders the active ones. */
export const PATCH = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const owned = ownedBotOnly(bot);
    if (owned) return owned;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    if (Array.isArray(body.order)) {
      if (!body.order.length || body.order.some((u: unknown) => typeof u !== "string" || !USERNAME.test(u))) {
        return NextResponse.json({ error: "Order must be a list of usernames." }, { status: 400 });
      }
      await reorderBotUsernames(telegramAccountId, bot, body.order);
    } else {
      if (typeof body.username !== "string" || !USERNAME.test(body.username) || typeof body.active !== "boolean") {
        return NextResponse.json({ error: "A username and an active flag are required." }, { status: 400 });
      }
      // Only the usernames Telegram lists for this bot may be toggled, and never the editable (regular) one.
      const known = (await listBotUsernames(telegramAccountId, bot)).find((u) => u.username.toLowerCase() === body.username.toLowerCase());
      if (!known) return NextResponse.json({ error: "That isn't one of this bot's usernames." }, { status: 404 });
      if (known.editable) return NextResponse.json({ error: "The main username can only be changed in BotFather." }, { status: 422 });
      await setBotUsernameActive(telegramAccountId, bot, known.username, body.active);
    }
    return NextResponse.json({ usernames: await listBotUsernames(telegramAccountId, bot) });
  } catch (err) {
    return fail(err);
  }
});
