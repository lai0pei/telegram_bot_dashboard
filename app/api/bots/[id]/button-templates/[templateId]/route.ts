import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { deleteButtonTemplate } from "@/lib/button-templates";
import { getBotById } from "@/lib/bots";

type Ctx = { params: Promise<{ id: string; templateId: string }> };

export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, templateId } = await ctx.params;
    const bot = getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!deleteButtonTemplate(bot.id, Number(templateId))) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
