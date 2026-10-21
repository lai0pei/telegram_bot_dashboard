import type { TelegramMessage } from "./botapi";
import { conditionsAllow, parseConditions } from "./rule-conditions";
import { MAX_TEST_CHARS, compileRuleRegex } from "./safe-regex";
import type { MEDIA_KINDS } from "./validation";

/**
 * Which rule answers an incoming message. Pure (no database), like `callback-match.ts`: the poller and the dashboard's
 * test chat run this very function, so what you try in the builder is what your bot does.
 */
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** What a non-text message carries, as a "media" rule would name it (venue before location: a venue has both). */
export function mediaKindOf(message: TelegramMessage): MediaKind | null {
  if (message.photo?.length) return "photo";
  if (message.video) return "video";
  if (message.video_note) return "video_note";
  if (message.voice) return "voice";
  if (message.audio) return "audio";
  if (message.animation) return "animation";
  if (message.sticker) return "sticker";
  if (message.document) return "document";
  if (message.contact) return "contact";
  if (message.venue) return "venue";
  if (message.location) return "location";
  if (message.poll) return "poll";
  if (message.dice) return "dice";
  if (message.web_app_data) return "web_app_data";
  return null;
}

/** The `/start <payload>` payload of a message's text (case preserved), or null. A `/start@other_bot` is not ours. */
export function startPayloadOf(message: TelegramMessage, botUsername: string): string | null {
  const text = message.text?.trim();
  const match = text?.match(/^\/start(?:@(\w+))?\s+(\S+)/i);
  if (!match || (match[1] && match[1].toLowerCase() !== botUsername.toLowerCase())) return null;
  return match[2];
}

/** What the matcher needs of a rule. `conditions` is the stored JSON or the parsed object (lib/rule-conditions.ts). */
export interface MatchableRule {
  enabled: boolean;
  matchType: string;
  pattern: string;
  conditions?: unknown;
}

/** The person a rule's reply is about: whoever joined for a "someone joined" rule, otherwise the sender. */
export function actorOf(message: TelegramMessage): TelegramMessage["from"] {
  const joined = message.new_chat_members?.find((m) => !m.is_bot);
  return joined ?? message.from;
}

/**
 * The enabled message rules that fit `message`, best first; the poller answers with the first one whose per-person
 * limits (once per person, wait between replies) also allow it, so a blocked rule falls through to the next.
 * Where each rule applies and its active hours are checked here (see lib/rule-conditions.ts): by default text rules
 * work in private chats only and commands everywhere. Order: a deep-link rule for the `/start` payload, then rules in
 * list order, then the "anything else" rule for a private message nothing else matched. Messages without text only
 * reach "shared" and "media" rules (and "someone joined" for a group's service message); the fallback never answers a
 * message that carries nothing to answer.
 */
export function matchMessageRules<T extends MatchableRule>(allRules: readonly T[], botUsername: string, message: TelegramMessage, now = new Date()): T[] {
  if (message.from?.is_bot) return [];
  const chatType = message.chat.type;
  const rules = allRules.filter((r) => r.enabled && conditionsAllow(r.matchType, parseConditions(r.conditions), chatType, now));
  const fallback = rules.filter((r) => r.matchType === "fallback");
  const text = message.text?.trim();

  if (!text) {
    if (message.new_chat_members?.length) {
      return message.new_chat_members.some((m) => !m.is_bot) ? rules.filter((r) => r.matchType === "member_joined") : [];
    }
    const shared = message.users_shared?.request_id ?? message.chat_shared?.request_id;
    if (shared !== undefined) return [...rules.filter((r) => r.matchType === "shared" && r.pattern === String(shared)), ...fallback];
    const kind = mediaKindOf(message);
    return kind ? [...rules.filter((r) => r.matchType === "media" && r.pattern === kind), ...fallback] : [];
  }

  const payload = startPayloadOf(message, botUsername);
  const deepLinks = payload !== null ? rules.filter((r) => r.matchType === "deeplink" && r.pattern === payload) : [];

  let command: string | null = null;
  if (text.startsWith("/")) {
    const [head] = text.slice(1).split(/\s/, 1);
    const [name, target] = head.split("@");
    // "/start@other_bot" in a group is meant for another bot.
    if (!target || target.toLowerCase() === botUsername.toLowerCase()) command = name.toLowerCase();
  }
  const lower = text.toLowerCase();

  const matches = rules.filter((rule) => {
    switch (rule.matchType) {
      case "command":
        return command !== null && command === rule.pattern.toLowerCase();
      case "exact":
        return lower === rule.pattern.toLowerCase();
      case "contains":
        return lower.includes(rule.pattern.toLowerCase());
      case "starts_with":
        return lower.startsWith(rule.pattern.toLowerCase());
      case "regex":
        // A longer message never matches (cutting it short would let `$` match mid-message).
        return text.length <= MAX_TEST_CHARS && (compileRuleRegex(rule.pattern)?.test(text) ?? false);
      default:
        return false;
    }
  });
  return [...deepLinks, ...matches, ...fallback];
}

/** The first rule that fits, ignoring per-person limits (what the dashboard's test chat uses). */
export function matchMessageRule<T extends MatchableRule>(allRules: readonly T[], botUsername: string, message: TelegramMessage, now = new Date()): T | undefined {
  return matchMessageRules(allRules, botUsername, message, now)[0];
}

/** Emoji with and without the variation selector are the same reaction (a phone keyboard types "❤️", Telegram sends "❤"). */
export const bareEmoji = (emoji: string): string => emoji.replace(/\uFE0F/g, "");

/** The enabled "someone reacted" rules for these new emoji reactions in a chat of this type, in list order. */
export function matchReactionRules<T extends MatchableRule>(allRules: readonly T[], emojis: readonly string[], chatType: string, now = new Date()): T[] {
  const reacted = emojis.map(bareEmoji);
  return allRules.filter(
    (r) =>
      r.enabled &&
      r.matchType === "reaction" &&
      (r.pattern.trim() === "*" || reacted.includes(bareEmoji(r.pattern.trim()))) &&
      conditionsAllow(r.matchType, parseConditions(r.conditions), chatType, now)
  );
}
