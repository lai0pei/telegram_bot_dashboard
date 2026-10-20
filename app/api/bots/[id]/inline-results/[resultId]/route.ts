import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { deleteInlineResult, getInlineResult, moveInlineResult, toInlineResultDto, updateInlineResult } from "@/lib/inline-results";
import { parseButtons } from "@/lib/auto-replies";
import { normalizeInlineButtons, validateInlineResult } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; resultId: string }> };

/** PATCH { move: "up" | "down" } reorders; otherwise the given fields replace the result's (missing ones keep their value). */
export const PATCH = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, resultId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const existing = getInlineResult(bot.id, Number(resultId));
    if (!existing) return NextResponse.json({ error: "Result not found." }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    if (body.move === "up" || body.move === "down") {
      moveInlineResult(bot.id, existing.id, body.move);
      return NextResponse.json({ ok: true });
    }

    const merged = {
      prefix: body.prefix ?? existing.prefix,
      title: body.title ?? existing.title,
      description: body.description !== undefined ? body.description : existing.description,
      messageText: body.messageText ?? existing.messageText,
      parseMode: body.parseMode !== undefined ? body.parseMode || null : existing.parseMode,
      buttons: body.buttons !== undefined ? body.buttons : parseButtons(existing.buttons),
      enabled: body.enabled !== undefined ? body.enabled === true : existing.enabled,
    };
    const error = validateInlineResult(merged);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const row = updateInlineResult(bot.id, existing.id, {
      ...merged,
      description: typeof merged.description === "string" ? merged.description : null,
      buttons: normalizeInlineButtons(merged.buttons),
    });
    return NextResponse.json({ result: row && toInlineResultDto(row) });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, resultId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!deleteInlineResult(bot.id, Number(resultId))) return NextResponse.json({ error: "Result not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
