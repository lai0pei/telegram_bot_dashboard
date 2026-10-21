import { applyTemplate } from "./apply-template";
import type { InlineButton } from "./botapi";
import { createButtonTemplate, listButtonTemplates, toButtonTemplateDto } from "./button-templates";
import { snapshotRules } from "./custom-templates";
import { createDeepLink, listDeepLinks } from "./deep-links";
import { validateDeepLink, type DeepLinkInput } from "./deep-links-shared";
import { getBotById } from "./bots";
import { listGames, saveGame } from "./games";
import { createInlineResult, listInlineResults, toInlineResultDto, type InlineResultInput } from "./inline-results";
import { listMiniApps, saveMiniApp } from "./mini-apps";
import { CUSTOM_CATEGORY, type TemplateRule } from "./bot-templates";
import { mediaIdsOf, createRuleMedia, pruneRuleMedia, getRuleMedia, listRuleMediaMeta, validateRuleUpload } from "./rule-media";
import { RULE_MEDIA_KINDS, type RuleMediaKind, type RuleMediaRef } from "./rule-content";
import { normalizeInlineButtons, validateInlineButtons, validateInlineResult } from "./validation";

export const SETUP_FORMAT = "tgdash-bot-setup";
/** 2 adds `attachments`; version 1 files (no attachments) are still accepted. */
export const SETUP_VERSION = 2;
export const MAX_SETUP_BOTS = 100;
/** Attached files carried per bot (base64 in the JSON, so roughly a third more on disk). The rest are left out with a note. */
export const MAX_EXPORT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

interface NamedApp {
  shortName: string;
  title: string;
  description: string;
  url: string;
}

/** A file attached to one of the rules, carried inside the setup file (rules refer to it by `id`). */
export interface SetupAttachment {
  id: number;
  kind: RuleMediaKind;
  name: string;
  mime: string;
  /** Base64 of the file's bytes. */
  data: string;
}

/** One bot's dashboard-only setup. Tokens, contacts, messages, schedules and monitoring are deliberately not part of it. */
export interface BotSetupEntry {
  telegramId: string;
  username: string;
  rules: TemplateRule[];
  /** Files the rules attach; absent in version 1 files. */
  attachments?: SetupAttachment[];
  /** Things the export could not carry (e.g. files over the size limit). Informational; an import ignores it. */
  notes?: string[];
  deepLinks: DeepLinkInput[];
  inlineResults: InlineResultInput[];
  buttonTemplates: { name: string; buttons: InlineButton[][] }[];
  games: NamedApp[];
  miniApps: NamedApp[];
}

export interface BotSetupFile {
  format: typeof SETUP_FORMAT;
  version: typeof SETUP_VERSION;
  exportedAt: string;
  bots: BotSetupEntry[];
}

export interface SetupPartResult {
  part: "rules" | "deepLinks" | "inlineResults" | "buttonTemplates" | "games" | "miniApps";
  applied: number;
  skipped: number;
  errors: string[];
}

export class InvalidSetupFileError extends Error {}

type Bot = NonNullable<Awaited<ReturnType<typeof getBotById>>>;

export async function exportBotSetup(bot: Bot): Promise<BotSetupEntry> {
  const notes: string[] = [];
  // Carry files oldest first until the size limit; rules naming a file that doesn't fit lose it (see snapshotRules).
  const carried = new Set<number>();
  let bytes = 0;
  for (const m of await listRuleMediaMeta(bot.id)) {
    if (bytes + m.size > MAX_EXPORT_ATTACHMENT_BYTES) continue;
    bytes += m.size;
    carried.add(m.id);
  }
  const rules = await snapshotRules(bot.id, notes, (id) => carried.has(id));
  const attachments: SetupAttachment[] = [];
  const used = new Set(rules.flatMap((r) => mediaIdsOf({ media: r.media ? JSON.stringify(r.media) : null, followUps: r.followUps ? JSON.stringify(r.followUps) : null })));
  for (const id of used) {
    const row = await getRuleMedia(bot.id, id);
    if (row) attachments.push({ id: row.id, kind: row.kind, name: row.name, mime: row.mime, data: row.data.toString("base64") });
  }
  return {
    telegramId: bot.telegramId,
    username: bot.username,
    rules,
    attachments,
    notes,
    deepLinks: (await listDeepLinks(bot.id)).map((l) => ({
      label: l.label,
      kind: l.kind as DeepLinkInput["kind"],
      payload: l.payload,
      appShortName: l.appShortName,
      admin: l.admin ? l.admin.split(",").filter(Boolean) : undefined,
    })),
    inlineResults: (await listInlineResults(bot.id)).map((row) => {
      const r = toInlineResultDto(row);
      return { prefix: r.prefix, title: r.title, description: r.description, messageText: r.messageText, parseMode: r.parseMode, buttons: r.buttons, enabled: r.enabled };
    }),
    buttonTemplates: (await listButtonTemplates(bot.id)).map((row) => {
      const t = toButtonTemplateDto(row);
      return { name: t.name, buttons: t.buttons };
    }),
    games: (await listGames(bot.id)).map((g) => ({ shortName: g.shortName, title: g.title, description: g.description ?? "", url: g.url ?? "" })),
    miniApps: (await listMiniApps(bot.id)).map((a) => ({ shortName: a.shortName, title: a.title, description: a.description ?? "", url: a.url ?? "" })),
  };
}

export function buildSetupFile(bots: BotSetupEntry[]): BotSetupFile {
  return { format: SETUP_FORMAT, version: SETUP_VERSION, exportedAt: new Date().toISOString(), bots };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Shape check only; each item is validated again with the normal validators when it is imported. */
export function parseSetupFile(value: unknown): BotSetupFile {
  if (!isRecord(value) || value.format !== SETUP_FORMAT) throw new InvalidSetupFileError("This is not a bot setup file exported from the dashboard.");
  if (value.version !== SETUP_VERSION && value.version !== 1) throw new InvalidSetupFileError("This setup file comes from a different version of the dashboard.");
  if (!Array.isArray(value.bots) || value.bots.length === 0 || value.bots.length > MAX_SETUP_BOTS) {
    throw new InvalidSetupFileError(`The file must contain 1–${MAX_SETUP_BOTS} bots.`);
  }
  const bots = value.bots.map((b): BotSetupEntry => {
    if (!isRecord(b) || !str(b.telegramId)) throw new InvalidSetupFileError("A bot in the file has no Telegram ID.");
    return {
      telegramId: str(b.telegramId),
      username: str(b.username),
      rules: list(b.rules) as TemplateRule[],
      attachments: list(b.attachments).filter(isAttachment),
      deepLinks: list(b.deepLinks) as DeepLinkInput[],
      inlineResults: list(b.inlineResults) as InlineResultInput[],
      buttonTemplates: list(b.buttonTemplates) as BotSetupEntry["buttonTemplates"],
      games: list(b.games) as NamedApp[],
      miniApps: list(b.miniApps) as NamedApp[],
    };
  });
  return { format: SETUP_FORMAT, version: SETUP_VERSION, exportedAt: str(value.exportedAt), bots };
}

const isAttachment = (a: unknown): a is SetupAttachment =>
  isRecord(a) &&
  Number.isInteger(a.id) &&
  RULE_MEDIA_KINDS.includes(a.kind as RuleMediaKind) &&
  typeof a.name === "string" &&
  typeof a.mime === "string" &&
  typeof a.data === "string";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs one part: a failure is reported on that part and the others still run. */
async function part(name: SetupPartResult["part"], run: (r: SetupPartResult) => Promise<void>): Promise<SetupPartResult> {
  const r: SetupPartResult = { part: name, applied: 0, skipped: 0, errors: [] };
  try {
    await run(r);
  } catch (err) {
    r.errors.push(message(err));
  }
  return r;
}

const validAppShape = (a: unknown): a is NamedApp => isRecord(a) && /^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(str(a.shortName)) && Boolean(str(a.title).trim());

/**
 * Adds one bot's setup to a bot of this account. It only adds: anything already there (same rule key, link payload,
 * trigger and title, name or short name) is left as it is, so importing twice, or onto a bot that is set up, can't
 * destroy anything. Monitoring is never switched on.
 */
export async function importBotSetup(bot: Bot, entry: BotSetupEntry): Promise<SetupPartResult[]> {
  const results: SetupPartResult[] = [];

  results.push(
    await part("rules", async (r) => {
      // Files first: each rule that names one is added with this bot's own copy (a rule whose file can't be stored is reported).
      const mediaMap = new Map<number, RuleMediaRef>();
      for (const a of entry.attachments ?? []) {
        try {
          const data = Buffer.from(a.data, "base64");
          const invalid = validateRuleUpload(a.kind, { type: a.mime, size: data.length });
          if (invalid) throw new Error(invalid);
          const row = await createRuleMedia(bot.id, a.kind, { name: a.name, type: a.mime, data });
          mediaMap.set(a.id, { mediaId: row.id, kind: row.kind, name: row.name });
        } catch (err) {
          r.errors.push(`File “${a.name}”: ${message(err)}`);
        }
      }
      const [res] = await applyTemplate(
        { id: bot.id, ownerUserId: bot.ownerUserId, telegramId: bot.telegramId, token: null },
        { id: "import", title: "Import", blurb: "", emoji: "", category: CUSTOM_CATEGORY, shows: [], commands: [], rules: entry.rules },
        ["rules"],
        { mediaMap }
      );
      r.applied = res?.applied ?? 0;
      r.skipped = res?.skipped ?? 0;
      r.errors.push(...(res?.errors ?? []));
      // Files of rules that were skipped as already present would otherwise sit unused.
      await pruneRuleMedia(bot.id);
    })
  );

  results.push(
    await part("deepLinks", async (r) => {
      const have = new Set((await listDeepLinks(bot.id)).map((l) => `${l.kind}:${l.payload}`));
      for (const link of entry.deepLinks) {
        const invalid = validateDeepLink(link);
        if (invalid) {
          r.errors.push(`${link?.label ?? "link"}: ${invalid}`);
          continue;
        }
        const key = `${link.kind}:${link.payload}`;
        if (have.has(key)) {
          r.skipped++;
          continue;
        }
        await createDeepLink(bot.id, link);
        have.add(key);
        r.applied++;
      }
    })
  );

  results.push(
    await part("inlineResults", async (r) => {
      const have = new Set((await listInlineResults(bot.id)).map((x) => `${x.prefix.toLowerCase()}|${x.title.toLowerCase()}`));
      for (const item of entry.inlineResults) {
        const invalid = validateInlineResult(item);
        if (invalid) {
          r.errors.push(`${item?.title ?? "result"}: ${invalid}`);
          continue;
        }
        const key = `${str(item.prefix).trim().toLowerCase()}|${item.title.trim().toLowerCase()}`;
        if (have.has(key)) {
          r.skipped++;
          continue;
        }
        await createInlineResult(bot.id, { ...item, prefix: str(item.prefix), buttons: normalizeInlineButtons(item.buttons) ?? null, enabled: item.enabled !== false });
        have.add(key);
        r.applied++;
      }
    })
  );

  results.push(
    await part("buttonTemplates", async (r) => {
      const have = new Set((await listButtonTemplates(bot.id)).map((t) => t.name.toLowerCase()));
      for (const t of entry.buttonTemplates) {
        const name = str(t?.name).trim();
        const invalid = !name || name.length > 60 ? "A name of 1–60 characters is required." : validateInlineButtons(t.buttons);
        if (invalid) {
          r.errors.push(`${name || "template"}: ${invalid}`);
          continue;
        }
        if (have.has(name.toLowerCase())) {
          r.skipped++;
          continue;
        }
        await createButtonTemplate(bot.id, name, normalizeInlineButtons(t.buttons) ?? []);
        have.add(name.toLowerCase());
        r.applied++;
      }
    })
  );

  // Games and Mini Apps mirror what was created in BotFather for this same bot, so only an owned bot can have them.
  results.push(
    await part("games", async (r) => {
      if (!entry.games.length) return;
      if (bot.source !== "owned") {
        r.skipped = entry.games.length;
        return;
      }
      const have = new Set((await listGames(bot.id)).map((g) => g.shortName.toLowerCase()));
      for (const g of entry.games) {
        if (!validAppShape(g)) {
          r.errors.push("A game in the file is missing its short name or title.");
          continue;
        }
        if (have.has(g.shortName.toLowerCase())) {
          r.skipped++;
          continue;
        }
        await saveGame(bot.id, { shortName: g.shortName, title: g.title, description: str(g.description), url: str(g.url) || null });
        r.applied++;
      }
    })
  );

  results.push(
    await part("miniApps", async (r) => {
      if (!entry.miniApps.length) return;
      if (bot.source !== "owned") {
        r.skipped = entry.miniApps.length;
        return;
      }
      const have = new Set((await listMiniApps(bot.id)).map((a) => a.shortName.toLowerCase()));
      for (const a of entry.miniApps) {
        if (!validAppShape(a) || !/^https:\/\//.test(str(a.url))) {
          r.errors.push("A Mini App in the file is missing its short name, title or https URL.");
          continue;
        }
        if (have.has(a.shortName.toLowerCase())) {
          r.skipped++;
          continue;
        }
        await saveMiniApp(bot.id, { shortName: a.shortName, title: a.title, description: str(a.description), url: a.url });
        r.applied++;
      }
    })
  );

  return results;
}
