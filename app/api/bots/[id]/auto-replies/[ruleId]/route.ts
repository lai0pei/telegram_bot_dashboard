import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { deleteAutoReply, DuplicateFallbackError, getAutoReply, moveAutoReply, toAutoReplyDto, updateAutoReply } from "@/lib/auto-replies";
import type { InlineButton } from "@/lib/botapi";
import { getBotById } from "@/lib/bots";
import { parseFollowUps, parseRuleMedia } from "@/lib/rule-content";
import { normalizeConditions, parseConditions } from "@/lib/rule-conditions";
import { prepareRuleContent } from "@/lib/rule-media";
import { normalizeInlineButtons, normalizeReplyKeyboard, validateAutoReply } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

/**
 * PATCH { move: "up" | "down" } reorders; { enabled } alone toggles; otherwise the full rule fields replace the rule.
 */
export const PATCH = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, ruleId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const existing = await getAutoReply(bot.id, Number(ruleId));
    if (!existing) return NextResponse.json({ error: "Rule not found." }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    if (body.move === "up" || body.move === "down") {
      await moveAutoReply(bot.id, existing.id, body.move);
      return NextResponse.json({ ok: true });
    }

    const merged = {
      matchType: body.matchType ?? existing.matchType,
      pattern: body.pattern ?? existing.pattern,
      replyText: body.replyText ?? existing.replyText,
      parseMode: body.parseMode !== undefined ? body.parseMode || null : existing.parseMode,
      buttons: body.buttons !== undefined ? body.buttons : existing.buttons ? JSON.parse(existing.buttons) : null,
      replyKeyboard: body.replyKeyboard !== undefined ? body.replyKeyboard : existing.replyKeyboard ? JSON.parse(existing.replyKeyboard) : null,
      showAlert: body.showAlert !== undefined ? body.showAlert === true : existing.showAlert,
      callbackAction: body.callbackAction ?? existing.callbackAction,
      enabled: body.enabled !== undefined ? body.enabled === true : existing.enabled,
      media: body.media !== undefined ? body.media : parseRuleMedia(existing.media),
      followUps: body.followUps !== undefined ? body.followUps : parseFollowUps(existing.followUps),
      conditions: body.conditions !== undefined ? body.conditions : parseConditions(existing.conditions),
    };
    const error = validateAutoReply(merged);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const content = await prepareRuleContent(bot.id, merged);
    if ("error" in content) return NextResponse.json({ error: content.error }, { status: 400 });

    const rule = await updateAutoReply(bot.id, existing.id, {
      ...merged,
      ...content,
      conditions: normalizeConditions(merged.conditions),
      buttons: normalizeInlineButtons(merged.buttons) as InlineButton[][] | null,
      replyKeyboard: normalizeReplyKeyboard(merged.replyKeyboard),
    });
    return NextResponse.json({ rule: rule && toAutoReplyDto(rule) });
  } catch (err) {
    if (err instanceof DuplicateFallbackError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
});

export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, ruleId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!(await deleteAutoReply(bot.id, Number(ruleId)))) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
