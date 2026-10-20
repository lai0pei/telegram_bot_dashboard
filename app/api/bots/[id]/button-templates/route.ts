import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import type { InlineButton } from "@/lib/botapi";
import { createButtonTemplate, listButtonTemplates, toButtonTemplateDto } from "@/lib/button-templates";
import { getBotById } from "@/lib/bots";
import { normalizeInlineButtons, validateInlineButtons } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ templates: (await listButtonTemplates(bot.id)).map(toButtonTemplateDto) });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { name, buttons } */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 60) return NextResponse.json({ error: "A name of 1–60 characters is required." }, { status: 400 });
    const error = validateInlineButtons(body.buttons);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const buttons = normalizeInlineButtons(body.buttons) as InlineButton[][] | null;
    if (!buttons) return NextResponse.json({ error: "Add at least one button." }, { status: 400 });
    return NextResponse.json({ template: toButtonTemplateDto((await createButtonTemplate(bot.id, body.name, buttons))) });
  } catch (err) {
    return errorResponse(err);
  }
});
