import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { applyTemplate } from "@/lib/apply-template";
import { TEMPLATE_PARTS, getBotTemplate, type TemplatePart } from "@/lib/bot-templates";
import { getBotById, getBotToken } from "@/lib/bots";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { templateId, parts: ("profile" | "commands" | "rules" | "monitoring")[], overwriteProfile? }
 * Adds a starter template to the bot. The template content comes from the server (`lib/bot-templates.ts`), never from
 * the request; the stored token is used as-is (like cloning), so a bot without one reports it per part.
 */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const template = typeof body?.templateId === "string" ? getBotTemplate(body.templateId) : undefined;
    if (!template) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

    const parts = Array.isArray(body?.parts) ? (body.parts as unknown[]) : [];
    if (parts.length === 0 || !parts.every((p) => TEMPLATE_PARTS.includes(p as TemplatePart))) {
      return NextResponse.json({ error: "Choose what to add." }, { status: 400 });
    }

    const results = await applyTemplate({ id: bot.id, token: getBotToken(bot) }, template, parts as TemplatePart[], {
      overwriteProfile: body.overwriteProfile === true,
    });
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
});
