import { NextResponse } from "next/server";
import { withAuth, errorResponse } from "@/lib/api-guard";
import { CLONE_SECTIONS, cloneBotSettings, type CloneSection } from "@/lib/bot-clone";
import { botApi } from "@/lib/botapi";
import { disableMonitoring, enableMonitoring } from "@/lib/bot-claims";
import { getBotById, getBotToken } from "@/lib/bots";
import { refreshBotHealth } from "@/lib/health";

const ACTIONS = ["monitor_on", "monitor_off", "health", "copy"] as const;
type Action = (typeof ACTIONS)[number];

interface BulkResult {
  botId: number;
  username: string;
  ok: boolean;
  message: string;
}

/**
 * POST { action: "monitor_on" | "monitor_off" | "health" | "copy", botIds: number[], sourceBotId?, include? }
 * Runs one action over several of the account's bots, one at a time (so a long list isn't a burst of Telegram calls),
 * and reports each bot's outcome: one failing bot never stops the rest. "copy" copies `sourceBotId`'s settings
 * (`include` as in the clone route) onto every other selected bot.
 */
export const POST = withAuth(async (req: Request, _ctx: unknown, telegramAccountId: string) => {
  try {
    const body = await req.json().catch(() => null);
    const action = body?.action as Action;
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const ids: unknown = body?.botIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((i) => !Number.isInteger(i))) {
      return NextResponse.json({ error: "Select 1–100 bots." }, { status: 400 });
    }

    let source: { id: number; token: string } | null = null;
    let include: CloneSection[] = [];
    if (action === "copy") {
      const sourceBot = await getBotById(Number(body.sourceBotId), telegramAccountId);
      const token = sourceBot && getBotToken(sourceBot);
      if (!sourceBot || !token) return NextResponse.json({ error: "The source bot needs a stored token." }, { status: 400 });
      include = Array.isArray(body.include) ? body.include : [];
      if (include.length === 0 || !include.every((s) => CLONE_SECTIONS.includes(s))) return NextResponse.json({ error: "Choose what to copy." }, { status: 400 });
      source = { id: sourceBot.id, token };
    }

    const results: BulkResult[] = [];
    for (const id of new Set<number>(ids)) {
      // Scoped lookup: an ID that isn't this account's bot is reported, never acted on.
      const bot = await getBotById(id, telegramAccountId);
      if (!bot) {
        results.push({ botId: id, username: String(id), ok: false, message: "Bot not found." });
        continue;
      }
      const report = (ok: boolean, message: string) => results.push({ botId: bot.id, username: bot.username, ok, message });
      try {
        const token = getBotToken(bot);
        if (action === "monitor_off") {
          await disableMonitoring(bot);
          report(true, "Monitoring off.");
        } else if (!token) {
          report(false, "No token stored; fetch it from the bot's Info tab.");
        } else if (action === "monitor_on") {
          if ((await botApi.getWebhookInfo(token)).url) report(false, "Has a webhook; remove it first.");
          else {
            // A bot another dashboard runs is reported, never taken over in bulk: that choice is made per bot.
            await enableMonitoring(bot);
            report(true, "Monitoring on.");
          }
        } else if (action === "health") {
          const health = await refreshBotHealth(bot);
          report(health !== null && health.status !== "error", health ? health.message ?? "Healthy." : "Telegram was unreachable.");
        } else if (source && bot.id !== source.id) {
          const done = await cloneBotSettings(source, { id: bot.id, token }, include);
          const errors = Object.entries(done).flatMap(([section, r]) => (r?.errors ?? []).map((e) => `${section}: ${e}`));
          const copied = Object.values(done).reduce((n, r) => n + (r?.copied ?? 0), 0);
          report(errors.length === 0, errors.length ? errors.join("; ") : `Copied ${copied} item${copied === 1 ? "" : "s"}.`);
        } else {
          report(true, "Source bot; skipped.");
        }
      } catch (err) {
        report(false, err instanceof Error ? err.message : "Failed.");
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
});
