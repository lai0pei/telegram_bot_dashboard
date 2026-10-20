import type { InlineButton, ReplyKeyboard, TelegramMessage } from "./botapi";
import { findCallbackRule } from "./callback-match";
import { matchMessageRule } from "./match-message";

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
}

export interface SimMessage {
  from: "bot" | "user";
  text: string;
  parseMode?: "HTML" | "MarkdownV2" | null;
  buttons?: InlineButton[][] | null;
  /** A pop-up answering a button press; it disappears at the next action, like Telegram's. */
  toast?: boolean;
}

export interface SimState {
  messages: SimMessage[];
  /** The reply keyboard in effect (the last one a bot message set, or null after a "remove"). */
  keyboard: ReplyKeyboard | null;
}

export const emptySim = (): SimState => ({ messages: [], keyboard: null });

const withoutToasts = (s: SimState): SimMessage[] => s.messages.filter((m) => !m.toast);

function botMessage(rule: SimRule): SimMessage {
  return { from: "bot", text: rule.replyText, parseMode: rule.parseMode, buttons: rule.buttons };
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
  const message = {
    message_id: 1,
    date: 0,
    chat: { id: 1, type: "private" },
    from: { id: 1, is_bot: false, first_name: "Alex" },
    text,
  } as unknown as TelegramMessage;
  const messages: SimMessage[] = [...withoutToasts(state), { from: "user", text }];
  const rule = matchMessageRule(rules, botUsername, message);
  if (!rule) return { ...state, messages };
  return { messages: [...messages, botMessage(rule)], keyboard: nextKeyboard(rule, state.keyboard) };
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
    const note = button.copy_text ? `Copies “${button.copy_text.text}”` : button.url ? `Opens ${button.url}` : null;
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
  return { messages: [...base, botMessage(rule)], keyboard: nextKeyboard(rule, state.keyboard) };
}
