import type { TelegramMessage } from "./botapi";
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

/**
 * The first enabled message rule that fits `message`, or undefined. Text rules only apply in private chats (commands
 * everywhere). Text messages: a deep-link rule for the `/start` payload beats everything, then rules in list order.
 * Messages without text: "shared" rules (a user/chat picked through a keyboard button) and "media" rules.
 * Last of all, a private message nothing else matched gets the "fallback" rule ("anything else"), wherever it sits in
 * the list. It never answers a message that carries nothing to answer (a service message).
 */
export function matchMessageRule<T extends { enabled: boolean; matchType: string; pattern: string }>(
  allRules: readonly T[],
  botUsername: string,
  message: TelegramMessage
): T | undefined {
  if (message.from?.is_bot) return undefined;
  const isPrivate = message.chat.type === "private";
  const rules = allRules.filter((r) => r.enabled);
  const fallback = isPrivate ? rules.find((r) => r.matchType === "fallback") : undefined;
  const text = message.text?.trim();

  if (!text) {
    if (!isPrivate) return undefined;
    const shared = message.users_shared?.request_id ?? message.chat_shared?.request_id;
    if (shared !== undefined) return rules.find((r) => r.matchType === "shared" && r.pattern === String(shared)) ?? fallback;
    const kind = mediaKindOf(message);
    return kind ? rules.find((r) => r.matchType === "media" && r.pattern === kind) ?? fallback : undefined;
  }

  const payload = startPayloadOf(message, botUsername);
  if (payload !== null) {
    const deepLink = rules.find((r) => r.matchType === "deeplink" && r.pattern === payload);
    if (deepLink) return deepLink;
  }

  let command: string | null = null;
  if (text.startsWith("/")) {
    const [head] = text.slice(1).split(/\s/, 1);
    const [name, target] = head.split("@");
    // "/start@other_bot" in a group is meant for another bot.
    if (!target || target.toLowerCase() === botUsername.toLowerCase()) command = name.toLowerCase();
  }
  const lower = text.toLowerCase();

  return (
    rules.find((rule) => {
      const pattern = rule.pattern.toLowerCase();
      switch (rule.matchType) {
        case "command":
          return command !== null && command === pattern;
        case "exact":
          return isPrivate && lower === pattern;
        case "contains":
          return isPrivate && lower.includes(pattern);
        default:
          return false;
      }
    }) ?? fallback
  );
}
