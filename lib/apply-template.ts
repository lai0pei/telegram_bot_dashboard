import { createAutoReply, listAutoReplies } from "./auto-replies";
import { BotApiError, botApi } from "./botapi";
import { withRetry } from "./bot-api-retry";
import { templateRuleKey, type BotTemplate, type TemplatePart } from "./bot-templates";
import { enableMonitoring } from "./bot-claims";
import type { BotRow } from "./bots";
import type { FollowUp, RuleMediaRef } from "./rule-content";
import { normalizeFollowUps, normalizeInlineButtons, normalizeReplyKeyboard, validateAutoReply } from "./validation";

export interface PartResult {
  part: TemplatePart;
  /** Things written (profile fields, commands, rules, 1 for monitoring). */
  applied: number;
  /** Things left alone because they were already there. */
  skipped: number;
  errors: string[];
}

const message = (err: unknown) => (err instanceof BotApiError ? err.description : err instanceof Error ? err.message : String(err));

/** A rule's attachment and follow-ups pointed at this bot's own copies of the files, or an error if one is missing. */
function remapAttachments(
  rule: { media?: RuleMediaRef | null; followUps?: FollowUp[] },
  map: ReadonlyMap<number, RuleMediaRef> | undefined
): { media: RuleMediaRef | null; followUps: FollowUp[] | null } | { error: string } {
  const missing = { error: "an attached file is not part of this setup." };
  let media: RuleMediaRef | null = null;
  if (rule.media) {
    media = map?.get(rule.media.mediaId) ?? null;
    if (!media) return missing;
  }
  const followUps = normalizeFollowUps(rule.followUps);
  for (const [i, f] of (followUps ?? []).entries()) {
    if (f.kind !== "media") continue;
    const mapped = map?.get(f.media?.mediaId);
    if (!mapped) return missing;
    followUps![i] = { ...f, media: mapped };
  }
  return { media, followUps };
}

/**
 * Applies the chosen parts of a template to a bot. It only adds: existing profile text, commands and rules are never
 * replaced (unless `overwriteProfile`), so applying a template twice, or onto a set-up bot, can't destroy anything.
 * Each part is independent, like a clone: one failing part is reported and the others still run.
 */
export async function applyTemplate(
  bot: Pick<BotRow, "id" | "ownerUserId" | "telegramId"> & { token: string | null },
  template: BotTemplate,
  parts: readonly TemplatePart[],
  opts: {
    overwriteProfile?: boolean;
    /**
     * Where the attachments a template's rules name now live (setup import: old file ID → the copy stored for this bot).
     * A rule naming a file that isn't in the map is reported, not added.
     */
    mediaMap?: ReadonlyMap<number, RuleMediaRef>;
  } = {}
): Promise<PartResult[]> {
  const results: PartResult[] = [];
  const start = (part: TemplatePart) => {
    const r: PartResult = { part, applied: 0, skipped: 0, errors: [] };
    results.push(r);
    return r;
  };
  const needToken = (r: PartResult) => {
    if (bot.token) return bot.token;
    r.errors.push("This bot has no stored token. Fetch it first (header → “No token — fetch it”).");
    return null;
  };

  if (parts.includes("profile") && template.profile) {
    const r = start("profile");
    const token = needToken(r);
    if (token) {
      const fields = [
        { what: "short description", value: template.profile.shortDescription, read: async () => (await botApi.getMyShortDescription(token)).short_description, write: (v: string) => botApi.setMyShortDescription(token, v) },
        { what: "description", value: template.profile.description, read: async () => (await botApi.getMyDescription(token)).description, write: (v: string) => botApi.setMyDescription(token, v) },
      ];
      for (const f of fields) {
        if (!f.value) continue;
        try {
          if (!opts.overwriteProfile && (await withRetry(f.read)).trim()) {
            r.skipped++;
            continue;
          }
          await withRetry(() => f.write(f.value!));
          r.applied++;
        } catch (err) {
          r.errors.push(`${f.what}: ${message(err)}`);
        }
      }
    }
  }

  if (parts.includes("commands") && template.commands.length) {
    const r = start("commands");
    const token = needToken(r);
    if (token) {
      try {
        const current = await withRetry(() => botApi.getMyCommands(token, { scope: "default", languageCode: "" }));
        const have = new Set(current.map((c) => c.command.toLowerCase()));
        const missing = template.commands.filter((c) => !have.has(c.command));
        r.skipped = template.commands.length - missing.length;
        if (missing.length) {
          await withRetry(() => botApi.setMyCommands(token, [...current, ...missing], { scope: "default", languageCode: "" }));
          r.applied = missing.length;
        }
      } catch (err) {
        r.errors.push(message(err));
      }
    }
  }

  if (parts.includes("rules") && template.rules.length) {
    const r = start("rules");
    const existing = new Set((await listAutoReplies(bot.id)).map((rule) => templateRuleKey(rule)));
    for (const rule of template.rules) {
      if (existing.has(templateRuleKey(rule))) {
        r.skipped++;
        continue;
      }
      // Templates go through the same gate as a rule typed into the form.
      const buttons = normalizeInlineButtons(rule.buttons) ?? undefined;
      const replyKeyboard = normalizeReplyKeyboard(rule.replyKeyboard);
      const content = remapAttachments(rule, opts.mediaMap);
      if ("error" in content) {
        r.errors.push(`${rule.pattern}: ${content.error}`);
        continue;
      }
      const invalid = validateAutoReply({ ...rule, buttons, replyKeyboard, ...content });
      if (invalid) {
        r.errors.push(`${rule.pattern}: ${invalid}`);
        continue;
      }
      await createAutoReply(bot.id, {
        matchType: rule.matchType,
        pattern: rule.pattern,
        replyText: rule.replyText,
        parseMode: rule.parseMode ?? null,
        showAlert: rule.showAlert === true,
        enabled: rule.enabled !== false,
        buttons,
        replyKeyboard,
        callbackAction: rule.callbackAction,
        ...content,
      });
      r.applied++;
    }
  }

  if (parts.includes("monitoring")) {
    const r = start("monitoring");
    const token = needToken(r);
    if (token) {
      try {
        // Monitoring and a webhook exclude each other (same rule as PUT /monitor).
        if ((await botApi.getWebhookInfo(token)).url) r.errors.push("This bot has a webhook set. Remove it in Delivery before turning monitoring on.");
        else {
          // Throws when another dashboard runs this bot; the part reports it like any other failure.
          await enableMonitoring(bot);
          r.applied = 1;
        }
      } catch (err) {
        r.errors.push(message(err));
      }
    }
  }

  return results;
}
