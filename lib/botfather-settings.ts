import type { BotApiUser } from "./botapi";

/**
 * Bot settings that only @BotFather can change (the Bot API has no method for them). Each entry is DATA for the
 * conversation engine in lib/botfather.ts (`runSettingOn`): which command to send, and how the answer is picked.
 * Nothing here is wording the engine trusts blindly. A choice is only sent if a button with a matching label really
 * exists on BotFather's reply, and a free-text answer only after the prompt passes `promptHint`; otherwise the flow
 * stops and quotes what BotFather actually said. `confirmed` is false until the dialogue was recorded by hand.
 */
export type SettingKey = "joinGroups" | "privacy" | "inline" | "inlineFeedback" | "inlineGeo" | "domain";

/** The value each setting takes: on/off, a percentage, or text (null turns the text setting off). */
export type SettingValue = boolean | number | string | null;

export interface SettingSpec {
  key: SettingKey;
  /** The BotFather command that starts the flow. */
  command: string;
  kind: "choice" | "text";
  /** Choice settings: the label of the button to press for this value. */
  label?: (value: SettingValue) => RegExp;
  /** Text settings: a loose check on BotFather's prompt (after the bot is chosen) before the text is sent. */
  promptHint?: RegExp;
  /** Text settings: what to send to turn the setting off. */
  offText?: string;
  /** Whether Telegram reports the result afterwards (getMe), so it can be double-checked. */
  verifiable: boolean;
  /** True once this flow's real dialogue was recorded and matched (see CLAUDE.md). */
  confirmed: boolean;
}

export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  joinGroups: {
    key: "joinGroups",
    command: "/setjoingroups",
    kind: "choice",
    label: (v) => (v ? /^enable/i : /^disable/i),
    verifiable: true,
    confirmed: false,
  },
  privacy: {
    key: "privacy",
    command: "/setprivacy",
    kind: "choice",
    // "Enable" = privacy mode ON (the bot sees only commands/mentions in groups). getMe reports the inverse, see below.
    label: (v) => (v ? /^enable/i : /^disable/i),
    verifiable: true,
    confirmed: false,
  },
  inline: {
    key: "inline",
    command: "/setinline",
    kind: "text",
    promptHint: /inline|placeholder/i,
    offText: "/empty",
    verifiable: true,
    confirmed: false,
  },
  inlineFeedback: {
    key: "inlineFeedback",
    command: "/setinlinefeedback",
    kind: "choice",
    label: (v) => new RegExp(`^${String(v)}\\s*%`),
    verifiable: false,
    confirmed: false,
  },
  inlineGeo: {
    key: "inlineGeo",
    command: "/setinlinegeo",
    kind: "choice",
    label: (v) => (v ? /^enable/i : /^disable/i),
    verifiable: false,
    confirmed: false,
  },
  domain: {
    key: "domain",
    command: "/setdomain",
    kind: "text",
    promptHint: /domain/i,
    offText: "/empty",
    verifiable: false,
    confirmed: false,
  },
};

export const FEEDBACK_PERCENTAGES = [0, 10, 25, 50, 100] as const;

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(SETTING_SPECS, key);
}

/** Validation message for a setting's value, or null. */
export function validateSettingValue(key: SettingKey, value: unknown): string | null {
  switch (key) {
    case "joinGroups":
    case "privacy":
    case "inlineGeo":
      return typeof value === "boolean" ? null : "Choose on or off.";
    case "inlineFeedback":
      return typeof value === "number" && (FEEDBACK_PERCENTAGES as readonly number[]).includes(value)
        ? null
        : `Choose one of ${FEEDBACK_PERCENTAGES.join("%, ")}%.`;
    case "inline":
      if (value === null) return null;
      // A leading "/" would reach BotFather as a command (for example /empty, which turns inline mode off).
      if (typeof value === "string" && value.trim().startsWith("/")) return "The placeholder can't start with a slash.";
      return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 64
        ? null
        : "The inline placeholder must be 1–64 characters (or off).";
    case "domain":
      if (value === null) return null;
      return typeof value === "string" && /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim())
        ? null
        : "Enter a bare domain such as example.com (no https:// or path).";
  }
}

/**
 * Privacy mode is inverted in getMe: `can_read_all_group_messages` is true when privacy mode is OFF.
 * One function so the route's check and the UI's switch can't disagree.
 */
export function privacyOnFromInfo(info: Pick<BotApiUser, "can_read_all_group_messages">): boolean {
  return !info.can_read_all_group_messages;
}

/** Did getMe end up showing the requested value? null = this setting can't be read back. */
export function matchesRequested(key: SettingKey, value: SettingValue, info: BotApiUser): boolean | null {
  switch (key) {
    case "joinGroups":
      return Boolean(info.can_join_groups) === value;
    case "privacy":
      return privacyOnFromInfo(info) === value;
    case "inline":
      return Boolean(info.supports_inline_queries) === (value !== null);
    default:
      return null;
  }
}

/**
 * The request body for the settings route: `{ setting, value }`. `value` must be present, so a missing field can
 * never be mistaken for the explicit `null` that turns inline mode or the domain off.
 */
export function parseSettingRequest(body: unknown): { key: SettingKey; value: SettingValue } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid JSON body." };
  const { setting, value } = body as { setting?: unknown; value?: unknown };
  if (!isSettingKey(setting)) return { error: "Unknown setting." };
  if (value === undefined) return { error: "A value is required (use null to turn it off)." };
  const error = validateSettingValue(setting, value);
  if (error) return { error };
  return { key: setting, value: typeof value === "string" ? value.trim() : (value as SettingValue) };
}

/** True while some flow's real BotFather dialogue hasn't been recorded and matched yet (the UI says so). */
export const hasUnconfirmedSettings = Object.values(SETTING_SPECS).some((spec) => !spec.confirmed);
