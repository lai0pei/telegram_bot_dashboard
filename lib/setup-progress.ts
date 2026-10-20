/**
 * How far a bot is from "ready for people", as six yes/no facts. Pure (no database, no React) so the setup checklist,
 * the sidebar badge and the cached figure on the bot cards all count the same way. "Try it in Telegram" is an
 * optional seventh step kept in the browser only, so it is not part of these.
 */
export const SETUP_STEPS = ["photo", "short", "about", "welcome", "commands", "listening"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];
export type SetupFlags = Record<SetupStepId, boolean>;

export interface SetupInput {
  /** null = unknown (the photo check failed for a reason other than "no photo"); counts as not done. */
  hasPhoto: boolean | null;
  shortDescription?: string | null;
  description?: string | null;
  /** An enabled `/start` command rule exists. */
  startRuleEnabled: boolean;
  commandsCount: number;
  monitorEnabled: boolean;
  webhookUrl?: string | null;
}

export function setupFlags(i: SetupInput): SetupFlags {
  return {
    photo: i.hasPhoto === true,
    short: Boolean(i.shortDescription?.trim()),
    about: Boolean(i.description?.trim()),
    welcome: i.startRuleEnabled,
    commands: i.commandsCount > 0,
    // Auto-replies only run while the poller listens, and a webhook turns it off.
    listening: i.monitorEnabled && !i.webhookUrl,
  };
}

export function setupProgress(flags: Partial<SetupFlags>): { done: number; total: number } {
  return { done: SETUP_STEPS.filter((s) => flags[s] === true).length, total: SETUP_STEPS.length };
}

/** The cached `bots.setup_progress` column: a JSON object holding only the facts learned so far. */
export function parseSetupCache(json: string | null | undefined): Partial<SetupFlags> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Partial<SetupFlags> = {};
    for (const step of SETUP_STEPS) if (typeof parsed[step] === "boolean") out[step] = parsed[step];
    return out;
  } catch {
    return {};
  }
}

/** The cache as a figure for a card: null until every fact is known (a half-known count would understate the bot). */
export function cachedProgress(json: string | null | undefined): { done: number; total: number; hasStart: boolean } | null {
  const flags = parseSetupCache(json);
  if (!SETUP_STEPS.every((s) => typeof flags[s] === "boolean")) return null;
  return { ...setupProgress(flags), hasStart: flags.welcome === true };
}
