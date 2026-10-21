import type { InlineButton, ReplyKeyboard, TelegramMessage } from "./botapi";
import { findCallbackRule } from "./callback-match";
import { matchMessageRule } from "./match-message";
import { RULE_MEDIA_LABELS, followUpSummary, type FollowUp, type RuleMediaRef } from "./rule-content";

/** The slice of an auto-reply rule a simulated conversation needs. */
export interface SimRule {
  enabled: boolean;
  matchType: string;
  pattern: string;
  replyText: string;
  parseMode: "HTML" | "MarkdownV2" | null;
  buttons: InlineButton[][] | null;
  replyKeyboard: ReplyKeyboard | null;
  callbackAction: "toast" | "edit" | "reply";
  /** Attachment and follow-up messages (optional: templates and older callers have none). */
  media?: RuleMediaRef | null;
  followUps?: readonly FollowUp[];
  /** Where / when the rule applies (lib/rule-conditions.ts); the per-person limits are not simulated. */
  conditions?: unknown;
}

export interface SimMessage {
  from: "bot" | "user";
  text: string;
  parseMode?: "HTML" | "MarkdownV2" | null;
  buttons?: InlineButton[][] | null;
  /** A pop-up answering a button press; it disappears at the next action, like Telegram's. */
  toast?: boolean;
  /** A file sent with the message; `mediaId` lets the caller show the stored picture. */
  media?: { kind: "photo" | "file"; name: string; mediaId?: number };
}

export interface SimState {
  messages: SimMessage[];
  /** The reply keyboard in effect (the last one a bot message set, or null after a "remove"). */
  keyboard: ReplyKeyboard | null;
}

export const emptySim = (): SimState => ({ messages: [], keyboard: null });

const withoutToasts = (s: SimState): SimMessage[] => s.messages.filter((m) => !m.toast);

const mediaOf = (ref: RuleMediaRef | null | undefined): SimMessage["media"] =>
  ref ? { kind: ref.kind === "photo" || ref.kind === "sticker" ? "photo" : "file", name: ref.name || RULE_MEDIA_LABELS[ref.kind], mediaId: ref.mediaId } : undefined;

/** One bubble per message the rule sends: the main message, then each follow-up (waits and "typing…" are not simulated). */
function botMessages(rule: SimRule): SimMessage[] {
  const main: SimMessage = { from: "bot", text: rule.replyText, parseMode: rule.parseMode, buttons: rule.buttons, media: mediaOf(rule.media) };
  const more = (rule.followUps ?? []).map((f): SimMessage => {
    if (f.kind === "text") return { from: "bot", text: f.text, parseMode: f.parseMode, buttons: f.buttons };
    if (f.kind === "media") return { from: "bot", text: f.caption ?? "", parseMode: f.parseMode, buttons: f.buttons, media: mediaOf(f.media) };
    return { from: "bot", text: followUpSummary(f) };
  });
  return [main, ...more];
}

function nextKeyboard(rule: SimRule, current: SimState["keyboard"]): SimState["keyboard"] {
  const kb = rule.replyKeyboard;
  if (!kb) return current;
  return kb.kind === "remove" ? null : kb;
}

/**
 * What the bot does when a private chat sends `text`: the same matcher the poller runs (`matchMessageRule`), so what
 * you try here is what your bot answers. Nothing matching means silence, exactly like the real bot.
 */
export function simulateSend(state: SimState, rules: readonly SimRule[], botUsername: string, text: string): SimState {
  return simulateIncoming(state, rules, botUsername, { text }, text);
}

/** What a keyboard button that asks for a contact or location shares in the test chat (sample values, like the preview's "Alex"). */
export type SimShareKind = "contact" | "location";

/**
 * Pressing a "share my contact / location" keyboard button: the person sends a contact or location instead of its
 * label, which only `media` rules (and the fallback) can answer, exactly as in the poller.
 */
export function simulateShare(state: SimState, rules: readonly SimRule[], botUsername: string, kind: SimShareKind): SimState {
  const payload =
    kind === "contact"
      ? { contact: { phone_number: "+15550100", first_name: "Alex", user_id: 1 } }
      : { location: { latitude: 52.52, longitude: 13.405 } };
  return simulateIncoming(state, rules, botUsername, payload, kind === "contact" ? "📱 Contact shared" : "📍 Location shared");
}

function simulateIncoming(state: SimState, rules: readonly SimRule[], botUsername: string, content: Record<string, unknown>, shown: string): SimState {
  const message = {
    message_id: 1,
    date: 0,
    chat: { id: 1, type: "private" },
    from: { id: 1, is_bot: false, first_name: "Alex" },
    ...content,
  } as unknown as TelegramMessage;
  const messages: SimMessage[] = [...withoutToasts(state), { from: "user", text: shown }];
  const rule = matchMessageRule(rules, botUsername, message);
  if (!rule) return { ...state, messages };
  return { messages: [...messages, ...botMessages(rule)], keyboard: nextKeyboard(rule, state.keyboard) };
}

/**
 * What pressing `button` on message `index` does, copying the poller: a rule answers with a pop-up, replaces the
 * pressed message, or sends a new one; a button no rule answers does nothing, and link / copy buttons show a note of what they would do.
 */
export function simulatePress(state: SimState, rules: readonly SimRule[], index: number, button: InlineButton): SimState {
  const pressed = state.messages[index];
  if (!pressed) return { ...state, messages: withoutToasts(state) };
  if (button.callback_data === undefined) {
    // Link and copy buttons act on the phone, not on the bot: say what Telegram would do, so they don't look dead.
    const note = button.copy_text ? `Copies “${button.copy_text.text}”` : button.url ? `Opens ${button.url}` : button.web_app ? `Opens the Mini App ${button.web_app.url}` : null;
    const base = withoutToasts(state);
    return { ...state, messages: note ? [...base, { from: "bot", text: note, toast: true }] : base };
  }
  const rule = findCallbackRule(rules, button.callback_data);
  // `index` refers to the list as shown (pop-ups included), so locate the message before dropping the pop-ups.
  const base = state.messages.filter((m) => !m.toast);
  const at = base.indexOf(pressed);
  if (!rule) return { ...state, messages: base };
  if (rule.callbackAction === "toast") return { ...state, messages: [...base, { from: "bot", text: rule.replyText.slice(0, 200), toast: true }] };
  if (rule.callbackAction === "edit") {
    const edited = base.map((m, i) => (i === at ? { ...m, text: rule.replyText, parseMode: rule.parseMode, buttons: rule.buttons } : m));
    return { ...state, messages: edited };
  }
  return { messages: [...base, ...botMessages(rule)], keyboard: nextKeyboard(rule, state.keyboard) };
}
