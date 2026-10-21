/**
 * Validation rules mirroring Telegram's own constraints for BotFather/Bot API
 * fields. Shared between client forms (immediate feedback) and API routes
 * (the actual gate — never trust the client).
 */

import type { ButtonStyle, InlineButton, KeyboardButton, ReplyKeyboard } from "./botapi";
import {
  DICE_EMOJIS,
  FOLLOW_UP_KINDS,
  MAX_FOLLOW_UP_DELAY_S,
  MAX_FOLLOW_UPS,
  MAX_TOTAL_DELAY_S,
  RULE_MEDIA_KINDS,
  type FollowUp,
  type FollowUpKind,
  type RuleMediaKind,
  type RuleMediaRef,
} from "./rule-content";

const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{3,30}[bB][oO][tT]$/;

export function validateBotName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required.";
  if (trimmed.length > 64) return "Name must be at most 64 characters.";
  return null;
}

export function validateBotUsername(username: string): string | null {
  const trimmed = username.trim().replace(/^@/, "");
  if (!trimmed) return "Username is required.";
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Username must be 5-32 characters, start with a letter, contain only letters/digits/underscores, and end in "bot".';
  }
  return null;
}

/** Strips the spaces, dashes and brackets people type, and a leading "00" prefix; returns "+digits". */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/[^\d+]/g, "").replace(/^00/, "+");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function validatePhoneNumber(value: string): string | null {
  if (!/^\+\d{7,15}$/.test(normalizePhoneNumber(value))) {
    return "Enter the number with its country code, e.g. +1 555 123 4567.";
  }
  return null;
}

export function validateLoginCode(value: string): string | null {
  return /^\d{4,8}$/.test(value.trim()) ? null : "Enter the numeric code Telegram sent you.";
}

const TELEGRAM_ID_PATTERN = /^\d{1,15}$/;
export const MAX_ALLOWLIST_IDS = 500;

/** The Telegram-ID allowlist as submitted by the Access tab (an array of numeric-ID strings). Shared by the form and the route. */
export function validateTelegramIdList(ids: unknown): string | null {
  if (!Array.isArray(ids)) return "Send the Telegram IDs as a list.";
  if (ids.length > MAX_ALLOWLIST_IDS) return `At most ${MAX_ALLOWLIST_IDS} IDs.`;
  for (const id of ids) {
    if (typeof id !== "string" || !TELEGRAM_ID_PATTERN.test(id.trim())) {
      return `"${String(id).slice(0, 40)}" isn't a Telegram user ID (digits only).`;
    }
  }
  return null;
}

/** Splits free text (commas, spaces or new lines) into trimmed, de-duplicated IDs, keeping the order. */
export function parseTelegramIdText(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}

/** A BotFather token: the bot's numeric id, a colon, and a 35-ish character secret. Shared by the add dialog and the routes. */
export function validateBotToken(value: string): string | null {
  const token = value.trim();
  if (!token) return "Paste the bot's token.";
  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) return "That doesn't look like a bot token. It looks like 123456789:AAH… and comes from @BotFather.";
  return null;
}

export function validateShortDescription(value: string): string | null {
  if (value.length > 120) return "Short description must be at most 120 characters.";
  return null;
}

export function validateDescription(value: string): string | null {
  if (value.length > 512) return "Description must be at most 512 characters.";
  return null;
}

export function validateCommand(command: string): string | null {
  if (!command) return "Command is required.";
  if (command.length > 32) return "Command must be at most 32 characters.";
  if (!/^[a-z0-9_]+$/.test(command)) return "Command may only contain lowercase letters, digits, and underscores.";
  return null;
}

export function validateCommandDescription(description: string): string | null {
  if (!description) return "Command description is required.";
  if (description.length > 256) return "Command description must be at most 256 characters.";
  return null;
}

export function validateWebhookUrl(url: string): string | null {
  if (!url) return "Webhook URL is required.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Webhook URL must be a valid URL.";
  }
  if (parsed.protocol !== "https:") return "Webhook URL must use https://.";
  return null;
}

/** Empty means "default for all languages"; otherwise a two-letter ISO 639-1 code. */
export function validateLanguageCode(code: string): string | null {
  if (code && !/^[a-z]{2}$/.test(code)) return "Language code must be two lowercase letters (e.g. en, de).";
  return null;
}

export const COMMAND_SCOPES = [
  "default",
  "all_private_chats",
  "all_group_chats",
  "all_chat_administrators",
  "chat",
  "chat_administrators",
  "chat_member",
] as const;

/** Scopes that name one chat (and, for chat_member, one user in it). */
export const CHAT_COMMAND_SCOPES = ["chat", "chat_administrators", "chat_member"] as const;

export function validateCommandScope(scope: unknown): string | null {
  if (!COMMAND_SCOPES.includes(scope as (typeof COMMAND_SCOPES)[number])) return "Unknown command scope.";
  return null;
}

/**
 * The chat/user a command scope points at: required for the chat scopes, and rejected elsewhere so a stray ID
 * can't silently change which scope is written.
 */
export function validateCommandTarget(scope: string, chatId: unknown, userId: unknown): string | null {
  const wantsChat = (CHAT_COMMAND_SCOPES as readonly string[]).includes(scope);
  const hasChat = typeof chatId === "string" && chatId !== "";
  const hasUser = typeof userId === "string" && userId !== "";
  if (!wantsChat) return hasChat || hasUser ? "A chat or user only applies to the per-chat scopes." : null;
  if (!hasChat) return "Pick the chat these commands are for.";
  const chatError = validateChatId(chatId as string);
  if (chatError) return chatError;
  if (scope === "chat_member") {
    if (!hasUser) return "Enter the user these commands are for.";
    if (!/^\d{1,15}$/.test((userId as string).trim())) return "User ID must be a Telegram user ID.";
  } else if (hasUser) {
    return "A user only applies to the member scope.";
  }
  return null;
}

export function validateMenuButton(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Menu button is required.";
  const button = value as { type?: unknown; text?: unknown; web_app?: { url?: unknown } };
  if (button.type === "default" || button.type === "commands") return null;
  if (button.type !== "web_app") return "Unknown menu button type.";
  if (typeof button.text !== "string" || button.text.length < 1 || button.text.length > 64) {
    return "Button text must be 1-64 characters.";
  }
  if (typeof button.web_app?.url !== "string") return "Web App URL is required.";
  return validateWebhookUrl(button.web_app.url)?.replace("Webhook", "Web App") ?? null;
}

export function validateWebhookSecret(secret: string): string | null {
  if (secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return "Secret token must be 1-256 characters: letters, digits, _ and -.";
  }
  return null;
}

export function validateMaxConnections(value: unknown): string | null {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    return "Max connections must be a whole number from 1 to 100.";
  }
  return null;
}

export const ALLOWED_UPDATE_TYPES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
  "message_reaction",
  "message_reaction_count",
  "inline_query",
  "chosen_inline_result",
  "callback_query",
  "shipping_query",
  "pre_checkout_query",
  "purchased_paid_media",
  "poll",
  "poll_answer",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "chat_boost",
  "removed_chat_boost",
] as const;

export function validateAllowedUpdates(value: unknown): string | null {
  if (!Array.isArray(value)) return "Allowed updates must be a list.";
  for (const v of value) {
    if (!ALLOWED_UPDATE_TYPES.includes(v)) return `Unknown update type: ${String(v)}.`;
  }
  return null;
}

export function validateChatId(chatId: string): string | null {
  const trimmed = chatId.trim();
  if (!trimmed) return "Chat ID is required.";
  if (!/^-?\d+$/.test(trimmed)) return "Chat ID must be numeric.";
  return null;
}

/** A private chat's ID: a positive number (groups and channels are negative). */
export function validatePrivateChatId(chatId: unknown): string | null {
  if (typeof chatId !== "string") return "Chat ID is required.";
  return validateChatId(chatId) ?? (/^\d{1,15}$/.test(chatId.trim()) ? null : "That isn't a private chat. Use a person's user ID.");
}

/** A message effect ID as sent by the composer (numeric; Telegram rejects an unknown one). Optional. */
export function validateEffectId(effectId: unknown, chatId: string): string | null {
  if (effectId === undefined || effectId === null || effectId === "") return null;
  if (typeof effectId !== "string" || !/^\d{1,20}$/.test(effectId)) return "Unknown message effect.";
  if (!/^\d+$/.test(chatId.trim())) return "Message effects only work in private chats.";
  return null;
}

export function validateMessageText(text: string): string | null {
  if (!text.trim()) return "Message text is required.";
  if (text.length > 4096) return "Message must be at most 4096 characters.";
  return null;
}

export function validateParseMode(mode: unknown): string | null {
  if (mode === undefined || mode === null || mode === "" || mode === "HTML" || mode === "MarkdownV2") return null;
  return "Format must be plain text, HTML or MarkdownV2.";
}

const BUTTON_STYLES = ["primary", "success", "danger"];
const BUTTON_ACTIONS = [
  "url",
  "callback_data",
  "copy_text",
  "web_app",
  "switch_inline_query",
  "switch_inline_query_current_chat",
  "login_url",
  "switch_inline_query_chosen_chat",
] as const;

/** An action is "set" when it has a value; the inline-query ones may legitimately be an empty string. */
function hasAction(b: Record<string, unknown>, action: (typeof BUTTON_ACTIONS)[number]): boolean {
  const value = b[action];
  if (action === "url" || action === "callback_data") return typeof value === "string" && value !== "";
  if (action === "switch_inline_query" || action === "switch_inline_query_current_chat") return typeof value === "string";
  return value !== null && typeof value === "object";
}

function validateHttpsUrl(raw: unknown, label: string, allowTg: boolean): string | null {
  if (typeof raw !== "string") return `${label} is required.`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `"${raw}" is not a valid URL.`;
  }
  if (url.protocol === "https:" || (allowTg && url.protocol === "tg:")) return null;
  return allowTg ? "Button links must start with https:// or tg://." : `${label} must start with https://.`;
}

/**
 * Rows of inline buttons for a message. Each button has a text, an optional colour and exactly one action: a link,
 * `callback_data` (1–64 bytes, reported back while monitoring is on), `copy_text`, a Mini App (`web_app`, https,
 * private chats only) or an inline query. Pass `chatId` when the destination is known so a Mini App button
 * aimed at a group is rejected up front instead of by Telegram.
 */
export function validateInlineButtons(buttons: unknown, chatId?: string): string | null {
  if (buttons === undefined || buttons === null) return null;
  if (!Array.isArray(buttons)) return "Buttons must be a list of rows.";
  const privateOnly = chatId !== undefined && !/^\d+$/.test(chatId.trim());
  let total = 0;
  for (const row of buttons) {
    if (!Array.isArray(row) || row.length === 0 || row.length > 8) return "Each button row needs 1–8 buttons.";
    for (const b of row) {
      total++;
      if (!b || typeof b.text !== "string") return "Each button needs text.";
      if (!b.text.trim() || b.text.length > 64) return "Button text must be 1–64 characters.";
      if (b.style !== undefined && b.style !== null && !BUTTON_STYLES.includes(b.style)) return "Unknown button colour.";
      const actions = BUTTON_ACTIONS.filter((a) => hasAction(b, a));
      if (actions.length !== 1) return "Each button needs exactly one action (link, callback, copy text, Mini App or inline query).";
      switch (actions[0]) {
        case "callback_data":
          if (new TextEncoder().encode(b.callback_data).length > 64) return "Callback data must be at most 64 bytes.";
          break;
        case "url": {
          const error = validateHttpsUrl(b.url, "Link", true);
          if (error) return error;
          break;
        }
        case "copy_text":
          if (typeof b.copy_text.text !== "string" || b.copy_text.text.length < 1 || b.copy_text.text.length > 256) {
            return "Text to copy must be 1–256 characters.";
          }
          break;
        case "web_app": {
          if (privateOnly) return "Mini App buttons only work in private chats.";
          const error = validateHttpsUrl(b.web_app.url, "Mini App URL", false);
          if (error) return error;
          break;
        }
        case "login_url": {
          const error = validateHttpsUrl(b.login_url.url, "Login URL", false);
          if (error) return error;
          const { forward_text, bot_username } = b.login_url;
          if (forward_text !== undefined && (typeof forward_text !== "string" || forward_text.length > 64)) return "Forward text must be at most 64 characters.";
          if (bot_username !== undefined && bot_username !== "" && (typeof bot_username !== "string" || !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bot_username.replace(/^@/, "")))) {
            return "Login bot username is not valid.";
          }
          break;
        }
        case "switch_inline_query_chosen_chat": {
          const c = b.switch_inline_query_chosen_chat;
          if (c.query !== undefined && (typeof c.query !== "string" || c.query.length > 256)) return "An inline query must be at most 256 characters.";
          if (!(c.allow_user_chats || c.allow_bot_chats || c.allow_group_chats || c.allow_channel_chats)) return "Pick at least one kind of chat the user may choose.";
          break;
        }
        default:
          if (b[actions[0]].length > 256) return "An inline query must be at most 256 characters.";
      }
    }
  }
  if (total > 20) return "At most 20 buttons per message.";
  return null;
}

const KEYBOARD_REQUEST_KEYS = ["request_contact", "request_location", "request_users", "request_chat", "request_poll", "web_app"] as const;

const isRequestId = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 2_147_483_647;

/** At most one request per button, and each request's own fields. */
function validateKeyboardRequest(b: Record<string, unknown>): string | null {
  const set = KEYBOARD_REQUEST_KEYS.filter((k) => (k === "request_contact" || k === "request_location" ? b[k] === true : b[k] !== undefined && b[k] !== null));
  if (set.length > 1) return "A keyboard button can do only one thing: send text, ask for a contact, location, user, chat or poll, or open a Mini App.";
  const users = b.request_users as Record<string, unknown> | undefined;
  if (users) {
    if (!isRequestId(users.request_id)) return "Request ID must be a whole number between 1 and 2147483647.";
    if (users.max_quantity !== undefined && !(Number.isInteger(users.max_quantity) && (users.max_quantity as number) >= 1 && (users.max_quantity as number) <= 10)) {
      return "Users to pick must be 1–10.";
    }
  }
  const chat = b.request_chat as Record<string, unknown> | undefined;
  if (chat) {
    if (!isRequestId(chat.request_id)) return "Request ID must be a whole number between 1 and 2147483647.";
    if (typeof chat.chat_is_channel !== "boolean") return "Choose whether the user picks a channel or a group.";
    if (chat.chat_is_channel && chat.chat_is_forum === true) return "A channel can't be a forum.";
  }
  const poll = b.request_poll as Record<string, unknown> | undefined;
  if (poll && poll.type !== undefined && poll.type !== "quiz" && poll.type !== "regular") return "Unknown poll type.";
  const app = b.web_app as Record<string, unknown> | undefined;
  if (app) return validateHttpsUrl(app.url, "Mini App URL", false);
  return null;
}

/** A reply keyboard / remove / force-reply as sent by the form. null/undefined means none. */
export function validateReplyKeyboard(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const k = value as { kind?: unknown; rows?: unknown; placeholder?: unknown };
  if (k.kind === "remove") return null;
  if (k.placeholder !== undefined && k.placeholder !== null && k.placeholder !== "") {
    if (typeof k.placeholder !== "string" || k.placeholder.length > 64) return "The input placeholder must be at most 64 characters.";
  }
  if (k.kind === "force_reply") return null;
  if (k.kind !== "keyboard") return "Unknown keyboard type.";
  if (!Array.isArray(k.rows) || k.rows.length === 0 || k.rows.length > 12) return "A keyboard needs 1–12 rows.";
  let total = 0;
  for (const row of k.rows) {
    if (!Array.isArray(row) || row.length === 0 || row.length > 8) return "Each keyboard row needs 1–8 buttons.";
    for (const b of row) {
      total++;
      if (!b || typeof b.text !== "string" || !b.text.trim() || b.text.length > 64) return "Keyboard button text must be 1–64 characters.";
      if (b.style !== undefined && b.style !== null && !BUTTON_STYLES.includes(b.style)) return "Unknown button colour.";
      const error = validateKeyboardRequest(b);
      if (error) return error;
    }
  }
  if (total > 40) return "At most 40 keyboard buttons.";
  return null;
}

/** The keyboard reduced to known fields (call after validateReplyKeyboard), or null when there is none. */
export function normalizeReplyKeyboard(value: unknown): ReplyKeyboard | null {
  if (value === undefined || value === null) return null;
  const k = value as Record<string, unknown>;
  if (k.kind === "remove") return { kind: "remove" };
  const placeholder = typeof k.placeholder === "string" && k.placeholder ? k.placeholder : undefined;
  if (k.kind === "force_reply") return { kind: "force_reply", placeholder };
  const rows = (k.rows as Record<string, unknown>[][]).map((row) =>
    row.map((b) => {
      const out: KeyboardButton = { text: (b.text as string).trim() };
      if (typeof b.style === "string") out.style = b.style as ButtonStyle;
      if (b.request_contact === true) out.request_contact = true;
      if (b.request_location === true) out.request_location = true;
      const flag = (src: Record<string, unknown>, keys: string[]) =>
        Object.fromEntries(keys.filter((k) => src[k] === true).map((k) => [k, true]));
      if (b.request_users) {
        const u = b.request_users as Record<string, unknown>;
        out.request_users = {
          request_id: u.request_id as number,
          ...(typeof u.user_is_bot === "boolean" ? { user_is_bot: u.user_is_bot } : {}),
          ...(typeof u.user_is_premium === "boolean" ? { user_is_premium: u.user_is_premium } : {}),
          ...(typeof u.max_quantity === "number" && u.max_quantity > 1 ? { max_quantity: u.max_quantity } : {}),
          ...flag(u, ["request_name", "request_username", "request_photo"]),
        };
      }
      if (b.request_chat) {
        const c = b.request_chat as Record<string, unknown>;
        out.request_chat = {
          request_id: c.request_id as number,
          chat_is_channel: c.chat_is_channel as boolean,
          ...(typeof c.chat_is_forum === "boolean" ? { chat_is_forum: c.chat_is_forum } : {}),
          ...(typeof c.chat_has_username === "boolean" ? { chat_has_username: c.chat_has_username } : {}),
          ...flag(c, ["chat_is_created", "bot_is_member", "request_title", "request_username", "request_photo"]),
        };
      }
      if (b.request_poll) {
        const t = (b.request_poll as { type?: unknown }).type;
        out.request_poll = t === "quiz" || t === "regular" ? { type: t } : {};
      }
      if (b.web_app) out.web_app = { url: (b.web_app as { url: string }).url };
      return out;
    })
  );
  return {
    kind: "keyboard",
    rows,
    persistent: k.persistent === true || undefined,
    resize: k.resize === true || undefined,
    oneTime: k.oneTime === true || undefined,
    placeholder,
  };
}

/** Kept for callers that only ever build URL buttons (the composer's draft rows). */
export const validateUrlButtons = validateInlineButtons;

/** An inline result from a form/API body: what is offered (title, description) and what gets sent (text, buttons). */
export function validateInlineResult(r: {
  prefix?: unknown;
  title?: unknown;
  description?: unknown;
  messageText?: unknown;
  parseMode?: unknown;
  buttons?: unknown;
}): string | null {
  if (r.prefix !== undefined && r.prefix !== null && (typeof r.prefix !== "string" || r.prefix.length > 64)) {
    return "The trigger must be at most 64 characters.";
  }
  if (typeof r.title !== "string" || !r.title.trim() || r.title.length > 64) return "Title must be 1–64 characters.";
  if (r.description !== undefined && r.description !== null && (typeof r.description !== "string" || r.description.length > 128)) {
    return "Description must be at most 128 characters.";
  }
  if (typeof r.messageText !== "string") return "Message text is required.";
  // "-1": inline messages are never a private chat with the bot, so Mini App buttons are rejected here.
  return validateMessageText(r.messageText) ?? validateParseMode(r.parseMode) ?? validateInlineButtons(r.buttons, "-1");
}

export const AUTO_REPLY_MATCH_TYPES = ["command", "exact", "contains", "callback", "callback_prefix", "deeplink", "media", "shared", "fallback"] as const;
export const CALLBACK_ACTIONS = ["toast", "edit", "reply"] as const;

/** The kinds of non-text message a "media" rule can name (see mediaKindOf in lib/auto-replies.ts). */
export const MEDIA_KINDS = [
  "photo",
  "video",
  "video_note",
  "voice",
  "audio",
  "animation",
  "sticker",
  "document",
  "contact",
  "location",
  "venue",
  "poll",
  "dice",
  "web_app_data",
] as const;

/** An auto-reply rule from a form/API body. `callback` rules answer with a toast/alert (200 chars), the others send a message. */
export function validateAutoReply(rule: {
  matchType?: unknown;
  pattern?: unknown;
  replyText?: unknown;
  parseMode?: unknown;
  buttons?: unknown;
  replyKeyboard?: unknown;
  callbackAction?: unknown;
  /** A file attached to the main message (then `replyText` is its caption and may be empty). */
  media?: unknown;
  /** Messages sent after the main one. */
  followUps?: unknown;
}): string | null {
  if (!AUTO_REPLY_MATCH_TYPES.includes(rule.matchType as (typeof AUTO_REPLY_MATCH_TYPES)[number])) return "Unknown match type.";
  if (typeof rule.pattern !== "string" || typeof rule.replyText !== "string") return "Pattern and reply are required.";
  const pattern = rule.pattern.trim();
  // "Anything else" has nothing to match on; its stored pattern is always "*".
  if (!pattern && rule.matchType !== "fallback") return "Pattern is required.";
  if (rule.matchType === "fallback") {
    // nothing to check
  } else if (rule.matchType === "command") {
    const error = validateCommand(pattern.replace(/^\//, "").toLowerCase());
    if (error) return error;
  } else if (rule.matchType === "callback" || rule.matchType === "callback_prefix") {
    if (new TextEncoder().encode(pattern).length > 64) return "Callback data must be at most 64 bytes.";
  } else if (rule.matchType === "deeplink") {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(pattern)) return "A deep-link payload is 1–64 letters, digits, underscores or dashes.";
  } else if (rule.matchType === "media") {
    if (!MEDIA_KINDS.includes(pattern.toLowerCase() as (typeof MEDIA_KINDS)[number])) return "Unknown kind of message.";
  } else if (rule.matchType === "shared") {
    if (!/^\d{1,10}$/.test(pattern) || Number(pattern) < 1 || Number(pattern) > 2_147_483_647) return "The request ID is a whole number from 1 to 2147483647.";
  } else if (pattern.length > 200) {
    return "Pattern must be at most 200 characters.";
  }
  const isCallback = rule.matchType === "callback" || rule.matchType === "callback_prefix";
  const action = rule.callbackAction ?? "toast";
  if (isCallback && !CALLBACK_ACTIONS.includes(action as (typeof CALLBACK_ACTIONS)[number])) return "Unknown button action.";
  // A toast is text only, and an edit can't change a message into a file or add messages after it: both ignore media and follow-ups.
  const textOnly = isCallback && (action === "toast" || action === "edit");
  const media = textOnly ? null : rule.media;
  if (!rule.replyText.trim() && !media) return "Reply text is required.";
  if (isCallback && action === "toast") {
    if (rule.replyText.length > 200) return "A button answer must be at most 200 characters.";
    return null;
  }
  if (isCallback && action === "edit" && rule.replyKeyboard) return "Editing a message can't add a reply keyboard; use inline buttons.";
  const textError = media ? validateMediaCaption(media, rule.replyText) : validateMessageText(rule.replyText);
  return (
    textError ??
    validateParseMode(rule.parseMode) ??
    validateInlineButtons(rule.buttons) ??
    validateReplyKeyboard(rule.replyKeyboard) ??
    (hasInlineButtons(rule.buttons) && rule.replyKeyboard ? "Use inline buttons or a reply keyboard, not both." : null) ??
    (textOnly ? null : validateFollowUps(rule.followUps))
  );
}

/** The attached file's reference and the caption it comes with. */
function validateMediaCaption(media: unknown, caption: string): string | null {
  const error = validateRuleMediaRef(media);
  if (error) return error;
  if ((media as RuleMediaRef).kind === "sticker" && caption.trim()) return "A sticker can't have text. Send the text as a follow-up message.";
  return validateCaption(caption);
}

export function validateRuleMediaRef(media: unknown): string | null {
  const m = media as Partial<RuleMediaRef> | null;
  if (!m || typeof m !== "object" || !Number.isInteger(m.mediaId) || (m.mediaId as number) < 1) return "The attached file is missing.";
  if (!RULE_MEDIA_KINDS.includes(m.kind as RuleMediaKind)) return "Unknown kind of attachment.";
  return null;
}

/** Up to 4 follow-up messages; `undefined`/`null` means none. */
export function validateFollowUps(followUps: unknown): string | null {
  if (followUps === undefined || followUps === null) return null;
  if (!Array.isArray(followUps)) return "Follow-up messages must be a list.";
  if (followUps.length > MAX_FOLLOW_UPS) return `At most ${MAX_FOLLOW_UPS} follow-up messages.`;
  let totalDelay = 0;
  for (const [i, raw] of followUps.entries()) {
    const f = raw as Record<string, unknown> | null;
    const at = `Follow-up ${i + 1}: `;
    if (!f || typeof f !== "object" || !FOLLOW_UP_KINDS.includes(f.kind as FollowUpKind)) return `${at}unknown kind of message.`;
    const delay = f.delaySec ?? 0;
    if (typeof delay !== "number" || !Number.isInteger(delay) || delay < 0 || delay > MAX_FOLLOW_UP_DELAY_S) {
      return `${at}the wait is a whole number of seconds from 0 to ${MAX_FOLLOW_UP_DELAY_S}.`;
    }
    totalDelay += delay;
    const error = validateFollowUp(f);
    if (error) return at + error;
  }
  return totalDelay > MAX_TOTAL_DELAY_S ? `The waits add up to more than ${MAX_TOTAL_DELAY_S} seconds.` : null;
}

function validateFollowUp(f: Record<string, unknown>): string | null {
  switch (f.kind) {
    case "text":
      return (
        (typeof f.text !== "string" ? "text is required." : validateMessageText(f.text)) ??
        validateParseMode(f.parseMode) ??
        validateInlineButtons(f.buttons)
      );
    case "media": {
      const caption = typeof f.caption === "string" ? f.caption : "";
      return validateMediaCaption(f.media, caption) ?? validateParseMode(f.parseMode) ?? validateInlineButtons(f.buttons);
    }
    case "location":
      if (typeof f.latitude !== "number" || !Number.isFinite(f.latitude) || f.latitude < -90 || f.latitude > 90) return "latitude is a number from -90 to 90.";
      if (typeof f.longitude !== "number" || !Number.isFinite(f.longitude) || f.longitude < -180 || f.longitude > 180) return "longitude is a number from -180 to 180.";
      return null;
    case "contact":
      if (typeof f.phone !== "string" || !/^\+?[0-9 ()\-]{3,30}$/.test(f.phone.trim())) return "enter a phone number (digits, spaces, dashes, optional +).";
      if (typeof f.firstName !== "string" || !f.firstName.trim() || f.firstName.length > 64) return "a first name of 1–64 characters is required.";
      if (f.lastName !== undefined && (typeof f.lastName !== "string" || f.lastName.length > 64)) return "the last name is at most 64 characters.";
      return null;
    case "dice":
      return DICE_EMOJIS.includes(f.emoji as (typeof DICE_EMOJIS)[number]) ? null : "choose one of the dice emoji.";
    default:
      return "unknown kind of message.";
  }
}

/**
 * Follow-ups reduced to the fields we store (call after validateFollowUps), or null when there are none.
 * Rebuilt from a whitelist, like normalizeInlineButtons: a field not listed here is silently dropped.
 */
export function normalizeFollowUps(followUps: unknown): FollowUp[] | null {
  if (!Array.isArray(followUps) || followUps.length === 0) return null;
  return (followUps as Record<string, unknown>[]).map((f): FollowUp => {
    const common = { ...(f.delaySec ? { delaySec: f.delaySec as number } : {}), ...(f.typing === true ? { typing: true } : {}) };
    const parseMode = f.parseMode === "HTML" || f.parseMode === "MarkdownV2" ? f.parseMode : undefined;
    const buttons = normalizeInlineButtons(f.buttons);
    switch (f.kind) {
      case "text":
        return { kind: "text", text: f.text as string, ...(parseMode ? { parseMode } : {}), ...(buttons ? { buttons } : {}), ...common };
      case "media": {
        const m = f.media as RuleMediaRef;
        return {
          kind: "media",
          media: { mediaId: m.mediaId, kind: m.kind, name: typeof m.name === "string" ? m.name.slice(0, 200) : "" },
          ...(typeof f.caption === "string" && f.caption.trim() && m.kind !== "sticker" ? { caption: f.caption } : {}),
          ...(parseMode ? { parseMode } : {}),
          ...(buttons ? { buttons } : {}),
          ...common,
        };
      }
      case "location":
        return { kind: "location", latitude: f.latitude as number, longitude: f.longitude as number, ...common };
      case "contact":
        return {
          kind: "contact",
          phone: (f.phone as string).trim(),
          firstName: (f.firstName as string).trim(),
          ...(typeof f.lastName === "string" && f.lastName.trim() ? { lastName: f.lastName.trim() } : {}),
          ...common,
        };
      default:
        return { kind: "dice", emoji: f.emoji as (typeof DICE_EMOJIS)[number], ...common };
    }
  });
}

/** The attached file reduced to its stored shape, or null. */
export function normalizeRuleMedia(media: unknown): RuleMediaRef | null {
  if (validateRuleMediaRef(media)) return null;
  const m = media as RuleMediaRef;
  return { mediaId: m.mediaId, kind: m.kind, name: typeof m.name === "string" ? m.name.slice(0, 200) : "" };
}

/** True when `buttons` holds at least one button. */
export function hasInlineButtons(buttons: unknown): boolean {
  return Array.isArray(buttons) && buttons.some((row) => Array.isArray(row) && row.length > 0);
}

export function validatePoll(poll: {
  question?: unknown;
  options?: unknown;
  allowsMultiple?: unknown;
  quiz?: unknown;
}): string | null {
  if (typeof poll.question !== "string" || !poll.question.trim()) return "A question is required.";
  if (poll.question.length > 300) return "The question must be at most 300 characters.";
  if (!Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 10) return "A poll needs 2–10 options.";
  for (const option of poll.options) {
    if (typeof option !== "string" || !option.trim() || option.length > 100) return "Each option must be 1–100 characters.";
  }
  if (new Set(poll.options.map((o: string) => o.trim())).size !== poll.options.length) return "Options must be different.";
  if (poll.quiz !== undefined && poll.quiz !== null) {
    const quiz = poll.quiz as { correctIndex?: unknown; explanation?: unknown };
    if (!Number.isInteger(quiz.correctIndex) || (quiz.correctIndex as number) < 0 || (quiz.correctIndex as number) >= poll.options.length) {
      return "Pick the correct option for the quiz.";
    }
    if (quiz.explanation !== undefined && (typeof quiz.explanation !== "string" || quiz.explanation.length > 200)) {
      return "The explanation must be at most 200 characters.";
    }
    if (poll.allowsMultiple) return "A quiz has exactly one correct answer, so it can't allow multiple answers.";
  }
  return null;
}

const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** `sendAt` is epoch milliseconds (the browser converts its local datetime-local value). */
export function validateSendAt(sendAt: unknown, now = Date.now()): string | null {
  if (typeof sendAt !== "number" || !Number.isFinite(sendAt)) return "Pick when to send it.";
  if (sendAt < now + 30_000) return "Pick a time at least a minute from now.";
  if (sendAt > now + MAX_SCHEDULE_AHEAD_MS) return "Pick a time within the next year.";
  return null;
}

export function validateCaption(caption: string): string | null {
  if (caption.length > 1024) return "Caption must be at most 1024 characters.";
  return null;
}

export const MAX_BOT_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_BOT_FILE_BYTES = 50 * 1024 * 1024;

/** Bot API upload limits: photos 10 MB, other files 50 MB. */
export function validateBotUpload(file: { type: string; size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_BOT_FILE_BYTES) return "Files must be at most 50 MB.";
  return null;
}

export const MAX_PROFILE_PHOTO_BYTES = 10 * 1024 * 1024;

/** `file` is a File on the client and a Blob/File from formData() on the server; both have `type` and `size`. */
export function validateProfilePhoto(file: { type: string; size: number }): string | null {
  if (file.type !== "image/jpeg" && file.type !== "image/png") return "Photo must be a JPEG or PNG image.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_PROFILE_PHOTO_BYTES) return "Photo must be at most 10 MB.";
  return null;
}

/** A bot's profile picture may also be a short square MP4 (Telegram's profile videos). */
export function validateProfileMedia(file: { type: string; size: number }): string | null {
  if (file.type === "video/mp4") {
    if (file.size === 0) return "That file is empty.";
    if (file.size > MAX_PROFILE_PHOTO_BYTES) return "Video must be at most 10 MB.";
    return null;
  }
  return validateProfilePhoto(file);
}

const CHAT_USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{3,30}[a-zA-Z0-9]$/;

export function validateChatTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Title is required.";
  if (trimmed.length > 128) return "Title must be at most 128 characters.";
  return null;
}

export function validateChatAbout(about: string): string | null {
  if (about.length > 255) return "Description must be at most 255 characters.";
  return null;
}

/** Empty is allowed and means "private". */
export function validateChatUsername(username: string): string | null {
  const trimmed = username.trim().replace(/^@/, "");
  if (!trimmed) return null;
  if (!CHAT_USERNAME_PATTERN.test(trimmed)) {
    return "Username must be 5-32 characters, start with a letter, contain only letters/digits/underscores, and not end with an underscore.";
  }
  return null;
}

/**
 * Buttons reduced to the fields Telegram accepts (call after validateInlineButtons), or null when there are none.
 * Rebuilt from a whitelist so nothing unexpected is forwarded or stored; every action kind must be listed here.
 */
export function normalizeInlineButtons(buttons: unknown): InlineButton[][] | null {
  if (!Array.isArray(buttons) || buttons.length === 0) return null;
  return buttons.map((row: Record<string, unknown>[]) =>
    row.map((b) => {
      const out: InlineButton = { text: (b.text as string).trim() };
      if (typeof b.style === "string") out.style = b.style as ButtonStyle;
      const action = BUTTON_ACTIONS.find((a) => hasAction(b, a));
      if (action === "copy_text") out.copy_text = { text: (b.copy_text as { text: string }).text };
      else if (action === "web_app") out.web_app = { url: (b.web_app as { url: string }).url };
      else if (action === "login_url") {
        const l = b.login_url as NonNullable<InlineButton["login_url"]>;
        out.login_url = { url: l.url };
        if (l.forward_text) out.login_url.forward_text = l.forward_text;
        if (l.bot_username) out.login_url.bot_username = l.bot_username.replace(/^@/, "");
        if (l.request_write_access === true) out.login_url.request_write_access = true;
      } else if (action === "switch_inline_query_chosen_chat") {
        const c = b.switch_inline_query_chosen_chat as NonNullable<InlineButton["switch_inline_query_chosen_chat"]>;
        out.switch_inline_query_chosen_chat = {
          ...(c.query ? { query: c.query } : {}),
          ...(c.allow_user_chats === true ? { allow_user_chats: true } : {}),
          ...(c.allow_bot_chats === true ? { allow_bot_chats: true } : {}),
          ...(c.allow_group_chats === true ? { allow_group_chats: true } : {}),
          ...(c.allow_channel_chats === true ? { allow_channel_chats: true } : {}),
        };
      }
      else if (action) (out as unknown as Record<string, unknown>)[action] = b[action];
      return out;
    })
  );
}

/** Error text unless `raw` is an https:// URL (labelled for the message). */
export function validateHttpsUrlOrNull(raw: unknown, label: string): string | null {
  return validateHttpsUrl(raw, label, false);
}

/** Short names of games and Mini Apps: 3–30 letters, digits or underscores, starting with a letter (BotFather's rule). */
export function validateAppShortName(short: unknown): string | null {
  if (typeof short !== "string" || !/^[A-Za-z][A-Za-z0-9_]{2,29}$/.test(short)) return "Short name is 3–30 letters, digits or underscores, starting with a letter.";
  return null;
}

/** Title (≤ 64) and description (≤ 512) of a game or Mini App. */
export function validateAppTexts(title: unknown, description: unknown): string | null {
  if (typeof title !== "string" || !title.trim() || title.length > 64) return "A title of 1–64 characters is required.";
  if (typeof description !== "string" || !description.trim() || description.length > 512) return "A description of 1–512 characters is required.";
  return null;
}

/** A Telegram username for ownership transfer (with or without @). */
export function validateTelegramUsername(username: unknown): string | null {
  if (typeof username !== "string" || !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username.trim())) return "Enter the new owner's Telegram @username.";
  return null;
}
