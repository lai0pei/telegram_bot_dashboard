import { and, desc, eq } from "drizzle-orm";
import { botApi } from "./botapi";
import { listAutoReplies, parseButtons, parseReplyKeyboard } from "./auto-replies";
import { CUSTOM_CATEGORY, CUSTOM_TEMPLATE_PREFIX, getBotTemplate, type BotTemplate, type TemplateRule } from "./bot-templates";
import { db } from "./db";
import { customTemplates } from "./db/schema";
import { getTelegramAccountById } from "./telegram-accounts";
import { normalizeInlineButtons, normalizeReplyKeyboard, validateAutoReply, validateCommand, validateCommandDescription } from "./validation";

export const MAX_CUSTOM_TEMPLATES = 50;

type Row = typeof customTemplates.$inferSelect;
interface Content {
  profile?: { shortDescription?: string; description?: string };
  commands: { command: string; description: string }[];
  rules: TemplateRule[];
}

/** The dashboard user behind a linked Telegram account (what custom templates belong to). */
export const ownerOf = async (telegramAccountId: string): Promise<string | null> => (await getTelegramAccountById(telegramAccountId))?.ownerUserId ?? null;

function shows(c: Content): string[] {
  const tags: string[] = [];
  if (c.rules.length) tags.push(`${c.rules.length} repl${c.rules.length === 1 ? "y" : "ies"}`);
  if (c.rules.some((r) => r.buttons?.length)) tags.push("Buttons");
  if (c.commands.length) tags.push(`${c.commands.length} command${c.commands.length === 1 ? "" : "s"}`);
  return tags;
}

/** A saved row as the same shape the built-in templates have, so preview / try / apply / remove need no special case. */
export function toBotTemplate(row: Row): BotTemplate {
  const c = JSON.parse(row.content) as Content;
  return { id: `${CUSTOM_TEMPLATE_PREFIX}${row.id}`, title: row.title, blurb: row.blurb, emoji: row.emoji, category: CUSTOM_CATEGORY, custom: true, shows: shows(c), profile: c.profile, commands: c.commands, rules: c.rules };
}

export async function listCustomTemplates(ownerUserId: string): Promise<BotTemplate[]> {
  return (await db.select().from(customTemplates).where(eq(customTemplates.ownerUserId, ownerUserId)).orderBy(desc(customTemplates.id))).map(toBotTemplate);
}

export async function getCustomTemplate(ownerUserId: string, id: number): Promise<BotTemplate | undefined> {
  const row = (await db.select().from(customTemplates).where(and(eq(customTemplates.id, id), eq(customTemplates.ownerUserId, ownerUserId))))[0];
  return row ? toBotTemplate(row) : undefined;
}

export async function deleteCustomTemplate(ownerUserId: string, id: number): Promise<boolean> {
  return (await db.delete(customTemplates).where(and(eq(customTemplates.id, id), eq(customTemplates.ownerUserId, ownerUserId)))).count > 0;
}

/** A template by ID for a request made as `telegramAccountId`: built-ins, or `custom-<n>` only if that account's owner saved it. */
export async function resolveTemplate(telegramAccountId: string, templateId: string): Promise<BotTemplate | undefined> {
  if (!templateId.startsWith(CUSTOM_TEMPLATE_PREFIX)) return getBotTemplate(templateId);
  const owner = await ownerOf(telegramAccountId);
  const n = Number(templateId.slice(CUSTOM_TEMPLATE_PREFIX.length));
  return owner && Number.isInteger(n) ? (await getCustomTemplate(owner, n)) : undefined;
}

/**
 * A bot's rules as template rules, in list order, keeping their on/off state. A rule that no longer passes validation
 * is left out and named in `notes`.
 */
export async function snapshotRules(botId: number, notes: string[]): Promise<TemplateRule[]> {
  const rules: TemplateRule[] = [];
  for (const r of await listAutoReplies(botId)) {
    const buttons = parseButtons(r.buttons) ?? undefined;
    const replyKeyboard = parseReplyKeyboard(r.replyKeyboard);
    const rule: TemplateRule = {
      matchType: r.matchType,
      pattern: r.pattern,
      replyText: r.replyText,
      parseMode: r.parseMode,
      buttons: normalizeInlineButtons(buttons) ?? undefined,
      callbackAction: r.callbackAction,
      replyKeyboard: normalizeReplyKeyboard(replyKeyboard),
      showAlert: r.showAlert,
      enabled: r.enabled,
    };
    const invalid = validateAutoReply(rule);
    if (invalid) notes.push(`Left out ${r.matchType} “${r.pattern}”: ${invalid}`);
    else rules.push(rule);
  }
  return rules;
}

export type SnapshotPart = "rules" | "commands" | "profile";

/**
 * Saves what a bot has now as a template. Rules are taken in list order and keep their on/off state (dropping a switched
 * off rule would leave a button pointing nowhere). Commands and profile come from Telegram with the stored token; a part
 * that can't be read is reported in `notes` and left out.
 */
export async function createCustomTemplate(
  ownerUserId: string,
  bot: { id: number },
  token: string | null,
  input: { title: string; emoji: string; blurb: string; parts: readonly SnapshotPart[] }
): Promise<{ template: BotTemplate; notes: string[] }> {
  const notes: string[] = [];
  const content: Content = { commands: [], rules: [] };

  if (input.parts.includes("rules")) content.rules = await snapshotRules(bot.id, notes);

  const needToken = input.parts.includes("commands") || input.parts.includes("profile");
  if (needToken && !token) notes.push("This bot has no stored token, so its commands and profile texts were not saved.");
  else if (token) {
    if (input.parts.includes("commands")) {
      try {
        const list = await botApi.getMyCommands(token, { scope: "default", languageCode: "" });
        content.commands = list.filter((c) => !validateCommand(c.command) && !validateCommandDescription(c.description));
      } catch {
        notes.push("Could not read the commands from Telegram, so they were not saved.");
      }
    }
    if (input.parts.includes("profile")) {
      try {
        const [short, long] = await Promise.all([botApi.getMyShortDescription(token), botApi.getMyDescription(token)]);
        if (short.short_description.trim() || long.description.trim()) content.profile = { shortDescription: short.short_description.trim() || undefined, description: long.description.trim() || undefined };
      } catch {
        notes.push("Could not read the profile texts from Telegram, so they were not saved.");
      }
    }
  }

  if (!content.rules.length && !content.commands.length && !content.profile) throw new EmptyTemplateError();
  const taken = (await db.select({ id: customTemplates.id }).from(customTemplates).where(eq(customTemplates.ownerUserId, ownerUserId))).length;
  if (taken >= MAX_CUSTOM_TEMPLATES) throw new TooManyTemplatesError();
  const row = (await db
    .insert(customTemplates)
    .values({ ownerUserId, title: input.title, emoji: input.emoji, blurb: input.blurb, content: JSON.stringify(content), createdAt: new Date() })
    .returning())[0];
  return { template: toBotTemplate(row), notes };
}

export class EmptyTemplateError extends Error {
  constructor() {
    super("There is nothing to save: this bot has no replies, commands or profile texts for the parts you picked.");
  }
}
export class TooManyTemplatesError extends Error {
  constructor() {
    super(`You can keep up to ${MAX_CUSTOM_TEMPLATES} templates. Delete one first.`);
  }
}
