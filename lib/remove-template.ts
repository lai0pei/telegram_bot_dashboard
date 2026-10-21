import { deleteAutoReply, listAutoReplies, parseButtons, parseReplyKeyboard } from "./auto-replies";
import { parseFollowUps, parseRuleMedia } from "./rule-content";
import { BotApiError, botApi } from "./botapi";
import { withRetry } from "./bot-api-retry";
import { planRemoval, type BotTemplate } from "./bot-templates";

export interface RemoveResult {
  part: "rules" | "commands";
  removed: number;
  /** Things with the template's name that were edited since, so left alone. */
  kept: string[];
  errors: string[];
}

const message = (err: unknown) => (err instanceof BotApiError ? err.description : err instanceof Error ? err.message : String(err));

/** Rows as `planRemoval` reads them (JSON columns parsed). */
export const storedRules = async (botId: number) =>
  (await listAutoReplies(botId)).map((r) => ({
    ...r,
    buttons: parseButtons(r.buttons),
    replyKeyboard: parseReplyKeyboard(r.replyKeyboard),
    media: parseRuleMedia(r.media),
    followUps: parseFollowUps(r.followUps),
  }));

/**
 * Removes what a template added and nobody has changed since: rules and default-scope commands that still match it
 * exactly. Edited ones stay and are listed. The profile texts and monitoring are never touched.
 */
export async function removeTemplate(bot: { id: number; token: string | null }, template: BotTemplate): Promise<RemoveResult[]> {
  const results: RemoveResult[] = [];

  let commands: { command: string; description: string }[] = [];
  let commandError: string | null = null;
  if (template.commands.length) {
    if (!bot.token) commandError = "This bot has no stored token. Fetch it first (header → “No token — fetch it”).";
    else {
      try {
        commands = await withRetry(() => botApi.getMyCommands(bot.token!, { scope: "default", languageCode: "" }));
      } catch (err) {
        commandError = message(err);
      }
    }
  }

  const plan = planRemoval(template, (await storedRules(bot.id)), commands);

  const rules: RemoveResult = { part: "rules", removed: 0, kept: plan.keptRules.map((r) => r.pattern), errors: [] };
  for (const rule of plan.rules) if ((await deleteAutoReply(bot.id, rule.id))) rules.removed++;
  results.push(rules);

  if (template.commands.length) {
    const r: RemoveResult = { part: "commands", removed: 0, kept: plan.keptCommands.map((c) => `/${c}`), errors: [] };
    if (commandError) r.errors.push(commandError);
    else if (plan.commands.length) {
      try {
        const left = commands.filter((c) => !plan.commands.includes(c.command.toLowerCase()));
        // An empty list is cleared with deleteMyCommands: Telegram treats setMyCommands([]) the same, but this states the intent.
        if (left.length) await withRetry(() => botApi.setMyCommands(bot.token!, left, { scope: "default", languageCode: "" }));
        else await withRetry(() => botApi.deleteMyCommands(bot.token!, { scope: "default", languageCode: "" }));
        r.removed = plan.commands.length;
      } catch (err) {
        r.errors.push(message(err));
      }
    }
    results.push(r);
  }
  return results;
}
