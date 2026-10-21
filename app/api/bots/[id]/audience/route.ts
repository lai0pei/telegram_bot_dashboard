import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { getBotById } from "@/lib/bots";
import { MAX_LISTED_CONTACTS, listDestinations } from "@/lib/destinations";

type Ctx = { params: Promise<{ id: string }> };

/** GET: who this bot can send to: people who wrote to it (most recent first, capped) and the groups/channels it is in. */
export const GET = withAuth(async (_req: Request, ctx: Ctx, telegramAccountId: string) => {
  try {
    const bot = await getBotById(Number((await ctx.params).id), telegramAccountId);
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return NextResponse.json({ destinations: await listDestinations(bot.id), contactLimit: MAX_LISTED_CONTACTS });
  } catch (err) {
    return errorResponse(err);
  }
});
