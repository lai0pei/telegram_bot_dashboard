import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { createInlineResult, listInlineResults, toInlineResultDto } from "@/lib/inline-results";
import { normalizeInlineButtons, validateInlineResult } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ results: (await listInlineResults(bot.id)).map(toInlineResultDto), monitorEnabled: bot.monitorEnabled });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { prefix?, title, description?, messageText, parseMode?, buttons?, enabled? } */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const error = body ? validateInlineResult(body) : "Invalid JSON body.";
    if (error) return NextResponse.json({ error }, { status: 400 });

    const row = await createInlineResult(bot.id, {
      prefix: typeof body.prefix === "string" ? body.prefix : "",
      title: body.title,
      description: typeof body.description === "string" ? body.description : null,
      messageText: body.messageText,
      parseMode: body.parseMode || null,
      buttons: normalizeInlineButtons(body.buttons),
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ result: toInlineResultDto(row) });
  } catch (err) {
    return errorResponse(err);
  }
});
