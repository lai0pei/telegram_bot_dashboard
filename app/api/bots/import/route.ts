import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { importBotSetup, InvalidSetupFileError, parseSetupFile, type SetupPartResult } from "@/lib/bot-setup-transfer";
import { listBots } from "@/lib/bots";

interface ImportResult {
  telegramId: string;
  username: string;
  botId?: number;
  /** Set when the bot isn't on this account, so nothing was imported for it. */
  error?: string;
  parts: SetupPartResult[];
}

/**
 * POST <the exported file>: adds each bot's setup to the bot of this account with the same Telegram ID. Only adds
 * (existing rules, links and so on are kept) and never turns monitoring on. A failing bot never stops the rest.
 */
export const POST = withAuth(async (req: Request, _ctx: unknown, telegramAccountId: string) => {
  try {
    const raw = await req.json().catch(() => null);
    let file;
    try {
      file = parseSetupFile(raw);
    } catch (err) {
      if (err instanceof InvalidSetupFileError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
    const mine = new Map((await listBots(telegramAccountId)).map((b) => [b.telegramId, b]));
    const results: ImportResult[] = [];
    for (const entry of file.bots) {
      const bot = mine.get(entry.telegramId);
      if (!bot) {
        results.push({
          telegramId: entry.telegramId,
          username: entry.username,
          error: "Not on this account: refresh the bot list, or add it by token, then import again.",
          parts: [],
        });
        continue;
      }
      results.push({ telegramId: entry.telegramId, username: bot.username, botId: bot.id, parts: await importBotSetup(bot, entry) });
    }
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err, 400);
  }
});
