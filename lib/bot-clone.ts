import { BotApiError, botApi, type BotCommandScopeType } from "./botapi";
import { createAutoReply, DuplicateFallbackError, listAutoReplies, parseButtons, parseReplyKeyboard } from "./auto-replies";
import { withRetry as attempt } from "./bot-api-retry";
import { COMMON_LANGUAGES } from "./languages";

export const CLONE_SECTIONS = ["profile", "commands", "menuButton", "adminRights", "autoReplies"] as const;
export type CloneSection = (typeof CLONE_SECTIONS)[number];

export interface CloneResult {
  copied: number;
  skipped: number;
  errors: string[];
}

const SCOPES: BotCommandScopeType[] = ["default", "all_private_chats", "all_group_chats", "all_chat_administrators"];
const LANGUAGES = ["", ...COMMON_LANGUAGES];

function message(err: unknown): string {
  return err instanceof BotApiError ? err.description : err instanceof Error ? err.message : String(err);
}

const label = (lang: string) => (lang ? `[${lang}]` : "[default]");

/**
 * Copies settings from one bot to another with their tokens. Telegram can't list which languages a bot has
 * overrides for, so profile and commands probe the languages in COMMON_LANGUAGES. Never touches BotFather.
 * Each item succeeds or fails on its own; the result says what was copied, skipped (nothing to copy) and failed.
 */
export async function cloneBotSettings(
  source: { id: number; token: string },
  target: { id: number; token: string },
  include: CloneSection[]
): Promise<Partial<Record<CloneSection, CloneResult>>> {
  const results: Partial<Record<CloneSection, CloneResult>> = {};
  const start = (section: CloneSection): CloneResult => {
    const result: CloneResult = { copied: 0, skipped: 0, errors: [] };
    results[section] = result;
    return result;
  };

  if (include.includes("profile")) {
    const r = start("profile");
    const defaults = { name: "", description: "", short: "" };
    for (const lang of LANGUAGES) {
      try {
        const [name, description, short] = await Promise.all([
          attempt(() => botApi.getMyName(source.token, lang)),
          attempt(() => botApi.getMyDescription(source.token, lang)),
          attempt(() => botApi.getMyShortDescription(source.token, lang)),
        ]);
        if (lang === "") Object.assign(defaults, { name: name.name, description: description.description, short: short.short_description });
        // A language without its own value answers with the default one: copying that would create overrides nobody made.
        const items: [string, string, string, () => Promise<unknown>][] = [
          ["name", name.name, defaults.name, () => botApi.setMyName(target.token, name.name, lang)],
          ["description", description.description, defaults.description, () => botApi.setMyDescription(target.token, description.description, lang)],
          ["short description", short.short_description, defaults.short, () => botApi.setMyShortDescription(target.token, short.short_description, lang)],
        ];
        for (const [what, value, fallback, write] of items) {
          if (!value || (lang !== "" && value === fallback)) {
            r.skipped++;
            continue;
          }
          try {
            await attempt(write);
            r.copied++;
          } catch (err) {
            r.errors.push(`${what} ${label(lang)}: ${message(err)}`);
          }
        }
      } catch (err) {
        r.errors.push(`reading ${label(lang)}: ${message(err)}`);
      }
    }
  }

  if (include.includes("commands")) {
    const r = start("commands");
    for (const scope of SCOPES) {
      for (const lang of LANGUAGES) {
        try {
          const commands = await attempt(() => botApi.getMyCommands(source.token, { scope, languageCode: lang }));
          if (commands.length === 0) {
            r.skipped++;
            continue;
          }
          await attempt(() => botApi.setMyCommands(target.token, commands, { scope, languageCode: lang }));
          r.copied++;
        } catch (err) {
          r.errors.push(`${scope} ${label(lang)}: ${message(err)}`);
        }
      }
    }
  }

  if (include.includes("menuButton")) {
    const r = start("menuButton");
    try {
      const menuButton = await attempt(() => botApi.getChatMenuButton(source.token));
      await attempt(() => botApi.setChatMenuButton(target.token, menuButton));
      r.copied++;
    } catch (err) {
      r.errors.push(message(err));
    }
  }

  if (include.includes("adminRights")) {
    const r = start("adminRights");
    for (const forChannels of [false, true]) {
      try {
        const rights = await attempt(() => botApi.getMyDefaultAdministratorRights(source.token, forChannels));
        await attempt(() => botApi.setMyDefaultAdministratorRights(target.token, rights, forChannels));
        r.copied++;
      } catch (err) {
        r.errors.push(`${forChannels ? "channels" : "groups"}: ${message(err)}`);
      }
    }
  }

  if (include.includes("autoReplies")) {
    const r = start("autoReplies");
    // Appended after the target's own rules, in the source's order; nothing existing is replaced.
    for (const rule of listAutoReplies(source.id)) {
      try {
        createAutoReply(target.id, { ...rule, buttons: parseButtons(rule.buttons), replyKeyboard: parseReplyKeyboard(rule.replyKeyboard) });
        r.copied++;
      } catch (err) {
        // The target keeps its own "anything else" rule; that's not a failure.
        if (err instanceof DuplicateFallbackError) continue;
        r.errors.push(`${rule.pattern}: ${message(err)}`);
      }
    }
  }

  return results;
}
