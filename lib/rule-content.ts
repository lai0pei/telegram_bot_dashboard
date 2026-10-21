import type { InlineButton } from "./botapi";

/**
 * What an auto-reply rule can send besides plain text: one attached file on the main message and up to four
 * follow-up messages. Types and tolerant parsers only (no `db` import), because client components use them; the
 * validators are in lib/validation.ts and the storage and sending are in lib/rule-media.ts / lib/auto-replies.ts.
 */

export const RULE_MEDIA_KINDS = ["photo", "video", "animation", "document", "audio", "voice", "sticker"] as const;
export type RuleMediaKind = (typeof RULE_MEDIA_KINDS)[number];

export const RULE_MEDIA_LABELS: Record<RuleMediaKind, string> = {
  photo: "Photo",
  video: "Video",
  animation: "GIF / animation",
  document: "File",
  audio: "Audio",
  voice: "Voice message",
  sticker: "Sticker",
};

/** Dice emoji Telegram accepts for sendDice. */
export const DICE_EMOJIS = ["🎲", "🎯", "🏀", "⚽", "🎳", "🎰"] as const;

export const MAX_FOLLOW_UPS = 4;
export const MAX_FOLLOW_UP_DELAY_S = 10;
/** All follow-up delays together: the reply is sent in the background, but a minute-long one would look broken. */
export const MAX_TOTAL_DELAY_S = 30;
/** Files kept per bot (they live in the database). */
export const MAX_RULE_MEDIA_PER_BOT = 50;
export const MAX_RULE_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_RULE_FILE_BYTES = 20 * 1024 * 1024;

/** A file attached to a rule. `kind` and `name` are copied from the stored file when the rule is saved. */
export interface RuleMediaRef {
  mediaId: number;
  kind: RuleMediaKind;
  name: string;
}

interface FollowUpBase {
  /** Seconds to wait before sending (0–10). */
  delaySec?: number;
  /** Show "typing…" while waiting. */
  typing?: boolean;
}

export type FollowUp =
  | (FollowUpBase & { kind: "text"; text: string; parseMode?: "HTML" | "MarkdownV2" | null; buttons?: InlineButton[][] | null })
  | (FollowUpBase & { kind: "media"; media: RuleMediaRef; caption?: string; parseMode?: "HTML" | "MarkdownV2" | null; buttons?: InlineButton[][] | null })
  | (FollowUpBase & { kind: "location"; latitude: number; longitude: number })
  | (FollowUpBase & { kind: "contact"; phone: string; firstName: string; lastName?: string })
  | (FollowUpBase & { kind: "dice"; emoji: (typeof DICE_EMOJIS)[number] });

export type FollowUpKind = FollowUp["kind"];
export const FOLLOW_UP_KINDS: readonly FollowUpKind[] = ["text", "media", "location", "contact", "dice"];
export const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = {
  text: "Text",
  media: "Photo / file",
  location: "Location",
  contact: "Contact card",
  dice: "Dice / game",
};

export function parseRuleMedia(json: string | null | undefined): RuleMediaRef | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<RuleMediaRef> | null;
    if (parsed && Number.isInteger(parsed.mediaId) && RULE_MEDIA_KINDS.includes(parsed.kind as RuleMediaKind)) {
      return { mediaId: parsed.mediaId as number, kind: parsed.kind as RuleMediaKind, name: typeof parsed.name === "string" ? parsed.name : "" };
    }
  } catch {
    // falls through
  }
  return null;
}

export function parseFollowUps(json: string | null | undefined): FollowUp[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed.filter((f) => f && typeof f === "object" && FOLLOW_UP_KINDS.includes((f as FollowUp).kind)) as FollowUp[]) : [];
  } catch {
    return [];
  }
}

/** One line describing a follow-up, for lists and previews. */
export function followUpSummary(f: FollowUp): string {
  switch (f.kind) {
    case "text":
      return f.text;
    case "media":
      return `${RULE_MEDIA_LABELS[f.media.kind]}${f.caption ? `: ${f.caption}` : ""}`;
    case "location":
      return `Location ${f.latitude}, ${f.longitude}`;
    case "contact":
      return `Contact: ${f.firstName}${f.lastName ? ` ${f.lastName}` : ""} (${f.phone})`;
    case "dice":
      return `${f.emoji} dice`;
  }
}
