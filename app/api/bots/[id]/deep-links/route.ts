import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { createDeepLink, deepLinkUrl, listDeepLinks, type DeepLinkRow } from "@/lib/deep-links";
import { validateDeepLink } from "@/lib/deep-links-shared";

type Ctx = { params: Promise<{ id: string }> };

function toDto(botUsername: string, link: DeepLinkRow & { arrivals: number | null }) {
  return { ...link, admin: link.admin ? link.admin.split(",") : [], url: deepLinkUrl(botUsername, link) };
}

export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ links: (await listDeepLinks(bot.id)).map((l) => toDto(bot.username, l)) });
  } catch (err) {
    return errorResponse(err);
  }
});

/** POST { label, kind, payload, appShortName?, admin? } */
export const POST = withAuth(async (req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const body = await req.json().catch(() => null);
    const error = body ? validateDeepLink(body) : "Invalid JSON body.";
    if (error) return NextResponse.json({ error }, { status: 400 });
    const link = await createDeepLink(bot.id, body);
    return NextResponse.json({ link: toDto(bot.username, { ...link, arrivals: link.kind === "start" ? 0 : null }) });
  } catch (err) {
    return errorResponse(err);
  }
});
