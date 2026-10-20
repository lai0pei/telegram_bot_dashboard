import { NextResponse } from "next/server";
import { withAuth, withSession, errorResponse } from "@/lib/api-guard";
import { getBotById, getBotToken } from "@/lib/bots";
import { createCustomTemplate, EmptyTemplateError, listCustomTemplates, ownerOf, TooManyTemplatesError, type SnapshotPart } from "@/lib/custom-templates";

const PARTS: SnapshotPart[] = ["rules", "commands", "profile"];

/** GET — the templates this dashboard user saved (usable on every linked Telegram account). */
export const GET = withSession(async (_req: Request, _ctx: unknown, userId: string) => {
  try {
    return NextResponse.json({ templates: (await listCustomTemplates(userId)) });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { botId, title, emoji?, blurb?, parts } — saves what one of the active account's bots has now as a template. */
export const POST = withAuth(async (req: Request, _ctx: unknown, telegramAccountId: string) => {
  try {
    const body = await req.json().catch(() => null);
    const owner = await ownerOf(telegramAccountId);
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (title.length < 1 || title.length > 64) return NextResponse.json({ error: "Give the template a name of 1–64 characters." }, { status: 400 });
    const blurb = typeof body?.blurb === "string" ? body.blurb.trim() : "";
    if (blurb.length > 200) return NextResponse.json({ error: "The description can be at most 200 characters." }, { status: 400 });
    const emoji = typeof body?.emoji === "string" && body.emoji.trim() && [...body.emoji.trim()].length <= 4 ? body.emoji.trim() : "⭐";
    const parts = Array.isArray(body?.parts) ? (body.parts as unknown[]).filter((p): p is SnapshotPart => PARTS.includes(p as SnapshotPart)) : [];
    if (!parts.length) return NextResponse.json({ error: "Choose what to save." }, { status: 400 });
    const bot = await getBotById(Number(body?.botId), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const { template, notes } = await createCustomTemplate(owner, bot, getBotToken(bot), { title, emoji, blurb: blurb || "Saved from one of your bots.", parts });
    return NextResponse.json({ template, notes });
  } catch (err) {
    if (err instanceof EmptyTemplateError || err instanceof TooManyTemplatesError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
});
