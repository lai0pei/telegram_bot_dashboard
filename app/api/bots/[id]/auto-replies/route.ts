import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { createAutoReply, DuplicateFallbackError, listAutoReplies, noteStartRule, toAutoReplyDto } from "@/lib/auto-replies";
import type { InlineButton } from "@/lib/botapi";
import { getBotById } from "@/lib/bots";
import { normalizeInlineButtons, normalizeReplyKeyboard, validateAutoReply } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    await noteStartRule(bot.id);
    return NextResponse.json({ rules: (await listAutoReplies(bot.id)).map(toAutoReplyDto), monitorEnabled: bot.monitorEnabled });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { matchType, pattern, replyText, parseMode?, buttons?, replyKeyboard?, showAlert?, callbackAction?, enabled? } */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const error = body ? validateAutoReply(body) : "Invalid JSON body.";
    if (error) return NextResponse.json({ error }, { status: 400 });

    const rule = await createAutoReply(bot.id, {
      matchType: body.matchType,
      pattern: body.pattern,
      replyText: body.replyText,
      parseMode: body.parseMode || null,
      buttons: normalizeInlineButtons(body.buttons) as InlineButton[][] | null,
      replyKeyboard: normalizeReplyKeyboard(body.replyKeyboard),
      showAlert: body.showAlert === true,
      callbackAction: body.callbackAction ?? "toast",
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ rule: toAutoReplyDto(rule) });
  } catch (err) {
    if (err instanceof DuplicateFallbackError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
});
