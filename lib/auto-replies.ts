import { and, asc, desc, eq, sql } from "drizzle-orm";
import { botApi, buttonsForChat, replyKeyboardForChat, type InlineButton, type ReplyKeyboard, type TelegramCallbackQuery, type TelegramMessage } from "./botapi";
import { findCallbackRule } from "./callback-match";
import { db } from "./db";
import { autoReplies, botMessages } from "./db/schema";
import { describeMessage } from "./messages";
import { recordOutgoing } from "./outgoing";
import { renderTemplate } from "./templates";
import type { MEDIA_KINDS } from "./validation";

export type AutoReplyRow = typeof autoReplies.$inferSelect;
export type AutoReplyInput = Pick<AutoReplyRow, "matchType" | "pattern" | "replyText" | "parseMode" | "showAlert" | "enabled"> & {
  buttons?: InlineButton[][] | null;
  replyKeyboard?: ReplyKeyboard | null;
  /** Only for callback rules; defaults to "toast". */
  callbackAction?: AutoReplyRow["callbackAction"];
};

/** The dashboard-facing shape: buttons parsed from their JSON column. */
export function toAutoReplyDto(row: AutoReplyRow) {
  return { ...row, buttons: parseButtons(row.buttons), replyKeyboard: parseReplyKeyboard(row.replyKeyboard) };
}

export function parseButtons(json: string | null): InlineButton[][] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length ? (parsed as InlineButton[][]) : null;
  } catch {
    return null;
  }
}

export function parseReplyKeyboard(json: string | null): ReplyKeyboard | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ReplyKeyboard;
  } catch {
    return null;
  }
}

/** True for the two rule types that answer a pressed inline button. */
export function isCallbackRule(matchType: AutoReplyRow["matchType"]): boolean {
  return matchType === "callback" || matchType === "callback_prefix";
}

/** Whether a rule sends a message (or edits one) rather than only showing a toast: everything but a "toast" callback rule. */
function sendsMessage(input: Pick<AutoReplyInput, "matchType" | "callbackAction">): boolean {
  return !isCallbackRule(input.matchType) || (input.callbackAction ?? "toast") !== "toast";
}

/**
 * Patterns are stored normalized: commands lowercase without the slash, media kinds lowercase, everything else
 * trimmed. Deep-link payloads and callback data stay case-sensitive (Telegram treats them that way).
 */
function normalizePattern(matchType: AutoReplyRow["matchType"], pattern: string): string {
  const trimmed = pattern.trim();
  if (matchType === "command") return trimmed.replace(/^\//, "").toLowerCase();
  if (matchType === "media") return trimmed.toLowerCase();
  return trimmed;
}

/** The columns an input writes, shared by create and update. */
function columnsFor(input: AutoReplyInput) {
  const message = sendsMessage(input);
  return {
    matchType: input.matchType,
    pattern: normalizePattern(input.matchType, input.pattern),
    replyText: input.replyText,
    parseMode: message ? input.parseMode ?? null : null,
    buttons: message && input.buttons?.length ? JSON.stringify(input.buttons) : null,
    // A reply keyboard can only come with a *new* message: an edit can't carry one.
    replyKeyboard:
      message && input.callbackAction !== "edit" && !input.buttons?.length && input.replyKeyboard ? JSON.stringify(input.replyKeyboard) : null,
    showAlert: isCallbackRule(input.matchType) && (input.callbackAction ?? "toast") === "toast" && input.showAlert,
    callbackAction: isCallbackRule(input.matchType) ? input.callbackAction ?? "toast" : ("toast" as const),
    enabled: input.enabled,
  };
}

export function listAutoReplies(botId: number): AutoReplyRow[] {
  return db
    .select()
    .from(autoReplies)
    .where(eq(autoReplies.botId, botId))
    .orderBy(asc(autoReplies.position), asc(autoReplies.id))
    .all();
}

export function getAutoReply(botId: number, id: number): AutoReplyRow | undefined {
  return db
    .select()
    .from(autoReplies)
    .where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, id)))
    .all()[0];
}

export function createAutoReply(botId: number, input: AutoReplyInput): AutoReplyRow {
  const last = db
    .select({ position: autoReplies.position })
    .from(autoReplies)
    .where(eq(autoReplies.botId, botId))
    .orderBy(desc(autoReplies.position))
    .limit(1)
    .all()[0];
  return db
    .insert(autoReplies)
    .values({ botId, ...columnsFor(input), position: (last?.position ?? -1) + 1, createdAt: new Date() })
    .returning()
    .get();
}

export function updateAutoReply(botId: number, id: number, input: AutoReplyInput): AutoReplyRow | undefined {
  return db
    .update(autoReplies)
    .set(columnsFor(input))
    .where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, id)))
    .returning()
    .get();
}

export function deleteAutoReply(botId: number, id: number): boolean {
  return db.delete(autoReplies).where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, id))).run().changes > 0;
}

/** Swaps a rule with its neighbour in list order. */
export function moveAutoReply(botId: number, id: number, direction: "up" | "down"): void {
  const rules = listAutoReplies(botId);
  const index = rules.findIndex((r) => r.id === id);
  const other = rules[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  db.transaction((tx) => {
    // Positions can tie (default 0), so assign the whole order explicitly.
    const order = rules.map((r) => r.id);
    [order[index], order[order.indexOf(other.id)]] = [other.id, id];
    order.forEach((ruleId, position) => {
      tx.update(autoReplies).set({ position }).where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, ruleId))).run();
    });
  });
}

export { MEDIA_KINDS } from "./validation";
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
 */
export function matchAutoReply(botId: number, botUsername: string, message: TelegramMessage): AutoReplyRow | undefined {
  if (message.from?.is_bot) return undefined;
  const isPrivate = message.chat.type === "private";
  const rules = listAutoReplies(botId).filter((r) => r.enabled);
  const text = message.text?.trim();

  if (!text) {
    if (!isPrivate) return undefined;
    const shared = message.users_shared?.request_id ?? message.chat_shared?.request_id;
    if (shared !== undefined) return rules.find((r) => r.matchType === "shared" && r.pattern === String(shared));
    const kind = mediaKindOf(message);
    return kind ? rules.find((r) => r.matchType === "media" && r.pattern === kind) : undefined;
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

  return rules.find((rule) => {
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
  });
}

/** The first enabled rule answering a pressed button with this callback data (exact data or a data prefix). */
export function matchCallbackRule(botId: number, data: string): AutoReplyRow | undefined {
  return findCallbackRule(listAutoReplies(botId), data);
}

/** Counts a rule firing. Called when its reply is sent (after the update's writes), not when it is matched. */
function bumpHits(ruleId: number): void {
  db.update(autoReplies)
    .set({ hits: sql`${autoReplies.hits} + 1`, lastHitAt: new Date() })
    .where(eq(autoReplies.id, ruleId))
    .run();
}

/** The sender-specific values a rule's `{placeholders}` are filled with. */
function templateContext(token: string, sender: TelegramMessage["from"], payload: string | null) {
  return {
    firstName: sender?.first_name,
    lastName: sender?.last_name,
    username: sender?.username,
    userId: sender?.id,
    payload: payload ?? undefined,
    commands: async () => {
      const language = sender?.language_code;
      const localized = language ? await botApi.getMyCommands(token, { languageCode: language }).catch(() => []) : [];
      return localized.length ? localized : botApi.getMyCommands(token);
    },
  };
}

/**
 * Sends the rule's reply to `message`'s chat and stores it. Never throws: a failed reply (blocked user, revoked
 * token) is logged so the update still counts as handled. Call it after the update's database writes, so a
 * SQLite retry of the update can't reply twice.
 */
export function sendAutoReply(botId: number, token: string, rule: AutoReplyRow, message: TelegramMessage, botUsername = ""): void {
  bumpHits(rule.id);
  deliverRuleReply(botId, token, rule, message.chat.id, message.from, startPayloadOf(message, botUsername)).catch((err) =>
    console.error(`[auto-reply] bot ${botId} rule ${rule.id} failed:`, err instanceof Error ? err.message : err)
  );
}

async function deliverRuleReply(
  botId: number,
  token: string,
  rule: AutoReplyRow,
  chatId: number,
  sender: TelegramMessage["from"],
  payload: string | null
): Promise<void> {
  const text = await renderTemplate(rule.replyText, rule.parseMode, templateContext(token, sender, payload));
  const sent = await botApi.sendMessage(token, chatId, text, {
    parseMode: rule.parseMode ?? undefined,
    // A rule fires in groups too, where Telegram rejects Mini App buttons (and the failure is only logged by the caller).
    buttons: buttonsForChat(parseButtons(rule.buttons), chatId),
    replyKeyboard: replyKeyboardForChat(parseReplyKeyboard(rule.replyKeyboard), chatId),
  });
  recordOutgoing(botId, sent);
}

/** Updates the stored copy of a message the bot just edited. Does nothing when it was never stored (it predates monitoring). */
function updateStoredMessage(botId: number, message: TelegramMessage): void {
  const { text, mediaType } = describeMessage(message);
  db.update(botMessages)
    .set({ text, mediaType, raw: JSON.stringify(message), editedAt: new Date((message.edit_date ?? message.date) * 1000) })
    .where(and(eq(botMessages.botId, botId), eq(botMessages.chatId, String(message.chat.id)), eq(botMessages.telegramMessageId, message.message_id)))
    .run();
}

const isNotModified = (err: unknown) => err instanceof Error && /message is not modified/i.test(err.message);

/**
 * Answers a pressed button according to its rule: a toast/alert, an edit of the message the button is on, or a new
 * message in that chat. Every case ends by answering the callback so the spinner stops. Never throws.
 * An edit falls back to a new message when the original can't be edited (too old, not the bot's); a button on an
 * inline-mode message has no chat to message, so those only get the toast.
 */
export function answerCallbackWithRule(botId: number, token: string, rule: AutoReplyRow, query: TelegramCallbackQuery): void {
  bumpHits(rule.id);
  const chat = query.message?.chat;
  const toast = rule.callbackAction === "toast" || !chat;
  const answer = botApi
    .answerCallbackQuery(token, query.id, toast ? { text: rule.replyText.slice(0, 200), showAlert: rule.showAlert } : {})
    .catch(() => {});
  if (toast || !chat || !query.message) return;

  const message = query.message;
  void (async () => {
    await answer;
    const text = await renderTemplate(rule.replyText, rule.parseMode, templateContext(token, query.from, null));
    const buttons = buttonsForChat(parseButtons(rule.buttons), chat.id);
    if (rule.callbackAction === "edit") {
      try {
        // A photo/video/document message has a caption, not text.
        const hasText = message.text !== undefined;
        const edited = hasText
          ? await botApi.editMessageText(token, chat.id, message.message_id, text, { parseMode: rule.parseMode ?? undefined, buttons })
          : await botApi.editMessageCaption(token, chat.id, message.message_id, text, { parseMode: rule.parseMode ?? undefined, buttons });
        if (edited !== true) updateStoredMessage(botId, edited);
        return;
      } catch (err) {
        if (isNotModified(err)) return;
        // Fall through to a new message.
      }
    }
    const sent = await botApi.sendMessage(token, chat.id, text, {
      parseMode: rule.parseMode ?? undefined,
      buttons,
      replyKeyboard: replyKeyboardForChat(parseReplyKeyboard(rule.replyKeyboard), chat.id),
    });
    recordOutgoing(botId, sent);
  })().catch((err) => console.error(`[auto-reply] bot ${botId} button rule ${rule.id} failed:`, err instanceof Error ? err.message : err));
}
