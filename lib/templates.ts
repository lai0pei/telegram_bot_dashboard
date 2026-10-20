import type { ParseMode } from "./botapi";

/** Placeholders an auto-reply's text may contain, replaced with the sender's details when the reply is sent. */
export const TEMPLATE_PLACEHOLDERS = ["first_name", "last_name", "username", "user_id", "payload", "commands"] as const;
export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

export interface TemplateContext {
  firstName?: string;
  lastName?: string;
  username?: string;
  userId?: number | string;
  /** The `/start <payload>` deep-link payload of the message, if any. */
  payload?: string;
  /** Lazily fetched list of the bot's commands (only called when the text uses `{commands}`). */
  commands?: () => Promise<{ command: string; description: string }[]>;
}

/** Escapes a value so it is shown literally under the given parse mode. */
export function escapeFor(value: string, mode: ParseMode | null | undefined): string {
  if (mode === "HTML") return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (mode === "MarkdownV2") return value.replace(/[\\_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
  return value;
}

export function usesPlaceholders(text: string): boolean {
  return /\{(?:first_name|last_name|username|user_id|payload|commands)\}/.test(text);
}

/** Replaces the known `{placeholders}`, escaping each value for `mode`; unknown braces are left as they are. */
export async function renderTemplate(text: string, mode: ParseMode | null | undefined, ctx: TemplateContext): Promise<string> {
  if (!usesPlaceholders(text)) return text;
  const values: Record<Exclude<TemplatePlaceholder, "commands">, string> = {
    first_name: ctx.firstName ?? "",
    last_name: ctx.lastName ?? "",
    username: ctx.username ? `@${ctx.username}` : "",
    user_id: ctx.userId !== undefined ? String(ctx.userId) : "",
    payload: ctx.payload ?? "",
  };
  let commandList = "";
  if (text.includes("{commands}") && ctx.commands) {
    try {
      commandList = (await ctx.commands()).map((c) => `/${c.command} - ${c.description}`).map((l) => escapeFor(l, mode)).join("\n");
    } catch {
      commandList = "";
    }
  }
  return text.replace(/\{(first_name|last_name|username|user_id|payload|commands)\}/g, (_m, key: TemplatePlaceholder) =>
    key === "commands" ? commandList : escapeFor(values[key], mode)
  );
}
