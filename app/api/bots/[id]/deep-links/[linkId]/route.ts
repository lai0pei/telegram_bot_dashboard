import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { deleteDeepLink } from "@/lib/deep-links";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

export const DELETE = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const { id, linkId } = await ctx.params;
    const bot = await getBotById(Number(id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (!(await deleteDeepLink(bot.id, Number(linkId)))) return NextResponse.json({ error: "Link not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
