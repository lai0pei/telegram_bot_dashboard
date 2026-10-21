import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { buildSetupFile, exportBotSetup, MAX_SETUP_BOTS, type BotSetupEntry } from "@/lib/bot-setup-transfer";
import { getBotById } from "@/lib/bots";

/**
 * GET ?ids=1,2,3: downloads the dashboard-only setup (rules, deep links, inline results, button templates, games, Mini
 * Apps) of the account's own bots as a JSON file for importing into another dashboard. No tokens, contacts or messages.
 */
export const GET = withAuth(async (req: Request, _ctx: unknown, telegramAccountId: string) => {
  try {
    const ids = [...new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).map(Number))];
    if (ids.length === 0 || ids.length > MAX_SETUP_BOTS || ids.some((i) => !Number.isInteger(i))) {
      return NextResponse.json({ error: `Select 1–${MAX_SETUP_BOTS} bots.` }, { status: 400 });
    }
    const entries: BotSetupEntry[] = [];
    for (const id of ids) {
      // Scoped lookup: an ID that isn't this account's bot is left out, never exported.
      const bot = await getBotById(id, telegramAccountId);
      if (bot) entries.push(await exportBotSetup(bot));
    }
    if (entries.length === 0) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    return new NextResponse(JSON.stringify(buildSetupFile(entries), null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bot-setup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
