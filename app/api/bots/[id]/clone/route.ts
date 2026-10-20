import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { CLONE_SECTIONS, cloneBotSettings, type CloneSection } from "@/lib/bot-clone";
import { getBotById, getBotToken } from "@/lib/bots";

/**
 * POST { targetBotId, include: ("profile" | "commands" | "menuButton" | "adminRights" | "autoReplies")[] }
 * Copies this bot's settings onto another bot of the same Telegram account. Uses the stored tokens only.
 */
export const POST = withAuth(async (req: Request, ctx: { params: Promise<{ id: string }> }, telegramAccountId: string) => {
  try {
    const source = getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!source) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const target = getBotById(Number(body?.targetBotId), telegramAccountId);
    if (!target) return NextResponse.json({ error: "Target bot not found." }, { status: 404 });
    if (target.id === source.id) return NextResponse.json({ error: "Pick a different bot to copy to." }, { status: 400 });

    const include = Array.isArray(body?.include) ? (body.include as unknown[]) : [];
    if (include.length === 0 || !include.every((s) => CLONE_SECTIONS.includes(s as CloneSection))) {
      return NextResponse.json({ error: "Choose what to copy." }, { status: 400 });
    }

    const sourceToken = getBotToken(source);
    const targetToken = getBotToken(target);
    if (!sourceToken || !targetToken) {
      return NextResponse.json({ error: "Both bots need a stored token. Fetch the missing one from its Info tab." }, { status: 400 });
    }

    const results = await cloneBotSettings(
      { id: source.id, token: sourceToken },
      { id: target.id, token: targetToken },
      include as CloneSection[]
    );
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
});
