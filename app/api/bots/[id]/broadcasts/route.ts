import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { parseButtons } from "@/lib/auto-replies";
import { BroadcastConflictError, countRecipients, createBroadcast, listBroadcasts } from "@/lib/broadcast";
import { getBotById } from "@/lib/bots";
import type { InlineButton } from "@/lib/botapi";
import { normalizeInlineButtons, validateInlineButtons, validateMessageText, validateParseMode } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET: how many people a broadcast would reach, plus recent broadcasts with their progress. */
export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const broadcasts = (await listBroadcasts(bot.id)).map((b) => ({ ...b, buttons: parseButtons(b.buttons) }));
    return NextResponse.json({ recipients: (await countRecipients(bot.id)), broadcasts });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { text, parseMode?, buttons? }: queue a message to every contact who hasn't blocked the bot. */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!bot.encryptedToken) return NextResponse.json({ error: "This bot has no stored token yet." }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== "string") return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    const error = validateMessageText(body.text) ?? validateParseMode(body.parseMode) ?? validateInlineButtons(body.buttons, "1");
    if (error) return NextResponse.json({ error }, { status: 400 });

    const broadcast = await createBroadcast(bot.id, {
      text: body.text,
      parseMode: body.parseMode || null,
      buttons: normalizeInlineButtons(body.buttons) as InlineButton[][] | null,
    });
    return NextResponse.json({ broadcast: { ...broadcast, buttons: parseButtons(broadcast.buttons) } });
  } catch (err) {
    // 422, not 409: 409 is reserved for NO_ACTIVE_ACCOUNT / SESSION_REVOKED.
    if (err instanceof BroadcastConflictError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
});
