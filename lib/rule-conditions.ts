/**
 * Per-rule conditions: where a rule applies, when, and how often per person. Pure (no database), like
 * `match-message.ts`, so the poller and the dashboard's test chat run the very same checks. The "how often" part
 * (`oncePerUser`, `cooldownSec`) needs stored state and is checked by the poller (lib/auto-replies.ts).
 */
export type ChatScope = "any" | "private" | "groups";

export interface RuleHours {
  /** First hour the rule applies, 0–23, in `tz`. */
  from: number;
  /** Hour it stops applying, 0–23 (exclusive). Less than `from` means "past midnight"; equal means all day. */
  to: number;
  /** IANA time zone, e.g. "Europe/Berlin". */
  tz: string;
  /** Days of the week it applies (0 = Sunday … 6 = Saturday); absent or empty means every day. */
  days?: number[];
}

export interface RuleConditions {
  chats?: ChatScope;
  /** Answer each person once; later matches fall through to the next rule. */
  oncePerUser?: boolean;
  /** Seconds before the same person can trigger the rule again. */
  cooldownSec?: number;
  hours?: RuleHours;
}

export const MAX_COOLDOWN_SEC = 30 * 24 * 60 * 60;

/** Where a rule of each type applies unless its conditions say otherwise (what the matcher did before conditions existed). */
export const DEFAULT_SCOPE: Record<string, ChatScope> = {
  command: "any",
  exact: "private",
  contains: "private",
  starts_with: "private",
  regex: "private",
  media: "private",
  shared: "private",
  fallback: "private",
  // A `?startgroup=` link sends `/start <payload>` into a group, and deep links always worked there.
  deeplink: "any",
  member_joined: "groups",
  reaction: "private",
};

/** Types whose chat scope the person may change. The others are fixed by what the trigger means. */
export const SCOPE_EDITABLE: ReadonlySet<string> = new Set(["command", "exact", "contains", "starts_with", "regex", "reaction"]);

/** Callback (button) rules take no conditions: they answer a press on a message that already exists. */
export const takesConditions = (matchType: string) => matchType !== "callback" && matchType !== "callback_prefix";

const SCOPES: readonly ChatScope[] = ["any", "private", "groups"];

/** Tolerant reader: a JSON string (the stored column) or an object; anything unusable gives null. */
export function parseConditions(raw: unknown): RuleConditions | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? normalizeConditions(value) : null;
}

function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateConditions(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "Conditions are invalid.";
  const c = value as Record<string, unknown>;
  if (c.chats !== undefined && !SCOPES.includes(c.chats as ChatScope)) return "Choose where the rule applies: everywhere, private chats or groups.";
  if (c.oncePerUser !== undefined && typeof c.oncePerUser !== "boolean") return "“Once per person” must be on or off.";
  if (c.cooldownSec !== undefined) {
    if (typeof c.cooldownSec !== "number" || !Number.isInteger(c.cooldownSec) || c.cooldownSec < 0 || c.cooldownSec > MAX_COOLDOWN_SEC) {
      return "The wait between replies is a whole number of seconds, at most 30 days.";
    }
  }
  if (c.hours !== undefined && c.hours !== null) {
    const h = c.hours as Record<string, unknown>;
    if (typeof h !== "object") return "Active hours are invalid.";
    for (const key of ["from", "to"] as const) {
      if (typeof h[key] !== "number" || !Number.isInteger(h[key]) || (h[key] as number) < 0 || (h[key] as number) > 23) return "Active hours are whole hours from 0 to 23.";
    }
    if (!validTimeZone(h.tz)) return "Choose a time zone for the active hours.";
    if (h.days !== undefined && (!Array.isArray(h.days) || h.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) return "Days are 0 (Sunday) to 6 (Saturday).";
  }
  return null;
}

/** Only what differs from "no conditions", in a fixed shape; null when nothing is set. Call after validateConditions. */
export function normalizeConditions(value: unknown): RuleConditions | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const out: RuleConditions = {};
  if (SCOPES.includes(c.chats as ChatScope)) out.chats = c.chats as ChatScope;
  if (c.oncePerUser === true) out.oncePerUser = true;
  if (typeof c.cooldownSec === "number" && c.cooldownSec > 0) out.cooldownSec = c.cooldownSec;
  const h = c.hours as Record<string, unknown> | null | undefined;
  if (h && typeof h === "object" && typeof h.from === "number" && typeof h.to === "number" && validTimeZone(h.tz)) {
    const days = Array.isArray(h.days) ? [...new Set((h.days as unknown[]).filter((d): d is number => Number.isInteger(d)))].sort() : [];
    out.hours = { from: h.from, to: h.to, tz: h.tz, ...(days.length && days.length < 7 ? { days } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The conditions a rule of this type actually stores: none for button rules, and no chat scope where the type fixes it
 * (a "media" rule is always private, a "someone joined" rule always groups). Use for every write so stored rules stay canonical.
 */
export function conditionsForStorage(matchType: string, raw: unknown): RuleConditions | null {
  if (!takesConditions(matchType)) return null;
  const c = normalizeConditions(raw);
  if (!c) return null;
  if (!SCOPE_EDITABLE.has(matchType) && c.chats) {
    const { chats: _fixed, ...rest } = c;
    return Object.keys(rest).length ? rest : null;
  }
  return c;
}

/** Whether a rule needs the per-person state table (the poller records a hit only for these). */
export const needsUserState = (c: RuleConditions | null | undefined): boolean => Boolean(c?.oncePerUser || c?.cooldownSec);

/** The chat scope in force for a rule: its own setting where the type allows one, else the type's default. */
export function scopeOf(matchType: string, c: RuleConditions | null | undefined): ChatScope {
  return SCOPE_EDITABLE.has(matchType) && c?.chats ? c.chats : DEFAULT_SCOPE[matchType] ?? "private";
}

export function scopeAllows(scope: ChatScope, chatType: string): boolean {
  if (scope === "any") return true;
  return scope === "private" ? chatType === "private" : chatType === "group" || chatType === "supergroup";
}

/** Whether `now` falls in the rule's active hours (always true without any). */
export function withinHours(hours: RuleHours | undefined, now: Date): boolean {
  if (!hours) return true;
  let hour: number;
  let weekday: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: hours.tz, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
    weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
  } catch {
    return true; // an unusable zone shouldn't silence the rule
  }
  if (hours.days?.length && !hours.days.includes(weekday)) return false;
  if (hours.from === hours.to) return true;
  return hours.from < hours.to ? hour >= hours.from && hour < hours.to : hour >= hours.from || hour < hours.to;
}

/** The checks that need no stored state: where the rule applies and when. */
export function conditionsAllow(matchType: string, c: RuleConditions | null | undefined, chatType: string, now: Date): boolean {
  return scopeAllows(scopeOf(matchType, c), chatType) && withinHours(c?.hours, now);
}

/** One-line summary of what is set, for rule lists ("groups · once per person · 9–18"). */
export function conditionsSummary(matchType: string, c: RuleConditions | null | undefined): string[] {
  const out: string[] = [];
  if (c?.chats && SCOPE_EDITABLE.has(matchType)) out.push(c.chats === "any" ? "everywhere" : c.chats === "groups" ? "groups" : "private only");
  if (c?.oncePerUser) out.push("once per person");
  if (c?.cooldownSec) out.push(`every ${formatSeconds(c.cooldownSec)}`);
  if (c?.hours) out.push(`${c.hours.from}–${c.hours.to}h`);
  return out;
}

export function formatSeconds(sec: number): string {
  if (sec % 86400 === 0) return `${sec / 86400} day${sec === 86400 ? "" : "s"}`;
  if (sec % 3600 === 0) return `${sec / 3600} h`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${sec} s`;
}
