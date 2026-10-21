import { and, asc, desc, eq, sql } from "drizzle-orm";
import { botApi, buttonsForChat, replyKeyboardForChat, type InlineButton, type ReplyKeyboard, type TelegramCallbackQuery, type TelegramMessage } from "./botapi";
import { findCallbackRule } from "./callback-match";
import { db } from "./db";
import { isUniqueViolation } from "./db/errors";
import { autoReplies, autoReplyUserHits, botMessages } from "./db/schema";
import { actorOf, matchMessageRules, matchReactionRules, startPayloadOf } from "./match-message";
import { conditionsForStorage, needsUserState, parseConditions, type RuleConditions } from "./rule-conditions";
import { describeMessage } from "./messages";
import { recordOutgoing } from "./outgoing";
import { recordSetup } from "./setup-cache";
import { logError } from "./error-log";
import { renderTemplate, type TemplateContext } from "./templates";
import { MAX_FOLLOW_UP_DELAY_S, MAX_TOTAL_DELAY_S, parseFollowUps, parseRuleMedia, type FollowUp, type RuleMediaRef } from "./rule-content";
import { pruneRuleMedia, sendRuleMedia } from "./rule-media";

export type AutoReplyRow = typeof autoReplies.$inferSelect;
export type AutoReplyInput = Pick<AutoReplyRow, "matchType" | "pattern" | "replyText" | "parseMode" | "showAlert" | "enabled"> & {
  buttons?: InlineButton[][] | null;
  replyKeyboard?: ReplyKeyboard | null;
  /** Only for callback rules; defaults to "toast". */
  callbackAction?: AutoReplyRow["callbackAction"];
  /** A file attached to the main message (its caption is `replyText`). Not for toast or edit button rules. */
  media?: RuleMediaRef | null;
  /** Messages sent after the main one. Not for toast or edit button rules. */
  followUps?: FollowUp[] | null;
  /** Where, when and how often the rule applies. Message rules only (button rules ignore it). */
  conditions?: RuleConditions | null;
};

/** The dashboard-facing shape: buttons, keyboard, attachment and follow-ups parsed from their JSON columns. */
export function toAutoReplyDto(row: AutoReplyRow) {
  return {
    ...row,
    buttons: parseButtons(row.buttons),
    replyKeyboard: parseReplyKeyboard(row.replyKeyboard),
    media: parseRuleMedia(row.media),
    followUps: parseFollowUps(row.followUps),
    conditions: parseConditions(row.conditions),
  };
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
  if (matchType === "fallback" || matchType === "member_joined") return "*";
  if (matchType === "reaction") return trimmed || "*";
  return trimmed;
}

/** The columns an input writes, shared by create and update. */
function columnsFor(input: AutoReplyInput) {
  const message = sendsMessage(input);
  // An edit can't turn the message into a file or send more after it (same reasoning as the reply keyboard below).
  const rich = message && !(isCallbackRule(input.matchType) && input.callbackAction === "edit");
  return {
    matchType: input.matchType,
    pattern: normalizePattern(input.matchType, input.pattern),
    replyText: input.replyText,
    parseMode: message ? input.parseMode ?? null : null,
    buttons: message && input.buttons?.length ? JSON.stringify(input.buttons) : null,
    // A reply keyboard can only come with a *new* message: an edit can't carry one.
    replyKeyboard:
      message && input.callbackAction !== "edit" && !input.buttons?.length && input.replyKeyboard ? JSON.stringify(input.replyKeyboard) : null,
    media: rich && input.media ? JSON.stringify(input.media) : null,
    followUps: rich && input.followUps?.length ? JSON.stringify(input.followUps) : null,
    conditions: ((c) => (c ? JSON.stringify(c) : null))(conditionsForStorage(input.matchType, input.conditions)),
    showAlert: isCallbackRule(input.matchType) && (input.callbackAction ?? "toast") === "toast" && input.showAlert,
    callbackAction: isCallbackRule(input.matchType) ? input.callbackAction ?? "toast" : ("toast" as const),
    enabled: input.enabled,
  };
}

export async function listAutoReplies(botId: number): Promise<AutoReplyRow[]> {
  return await db
    .select()
    .from(autoReplies)
    .where(eq(autoReplies.botId, botId))
    .orderBy(asc(autoReplies.position), asc(autoReplies.id));
}

export async function getAutoReply(botId: number, id: number): Promise<AutoReplyRow | undefined> {
  return (await db
    .select()
    .from(autoReplies)
    .where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, id))))[0];
}

/** Thrown when a bot would get a second "anything else" rule; routes answer 422. */
export class DuplicateFallbackError extends Error {
  constructor() {
    super("This bot already has an “anything else” rule. Edit that one instead.");
  }
}

/** The partial unique index `auto_replies_one_fallback_unique` is the real guard; this makes a lost race read like the pre-check. */
async function mapFallbackConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateFallbackError();
    throw err;
  }
}

/** A bot has at most one fallback rule: enforced here (not in the route) so clones and templates can't add a second. */
async function assertSingleFallback(botId: number, input: Pick<AutoReplyInput, "matchType">, exceptId?: number): Promise<void> {
  if (input.matchType !== "fallback") return;
  if ((await listAutoReplies(botId)).some((r) => r.matchType === "fallback" && r.id !== exceptId)) throw new DuplicateFallbackError();
}

export async function createAutoReply(botId: number, input: AutoReplyInput): Promise<AutoReplyRow> {
  await assertSingleFallback(botId, input);
  const last = (await db
    .select({ position: autoReplies.position })
    .from(autoReplies)
    .where(eq(autoReplies.botId, botId))
    .orderBy(desc(autoReplies.position))
    .limit(1))[0];
  const created = (await mapFallbackConflict(() =>
    db
      .insert(autoReplies)
      .values({ botId, ...columnsFor(input), position: (last?.position ?? -1) + 1, createdAt: new Date() })
      .returning()
  ))[0];
  await noteStartRule(botId);
  return created;
}

/** Keeps the cached "has a welcome message" fact (the bot cards' setup figure) in step with the rules. */
export async function noteStartRule(botId: number): Promise<void> {
  await recordSetup(botId, { welcome: (await listAutoReplies(botId)).some((r) => r.enabled && r.matchType === "command" && r.pattern === "start") });
}

export async function updateAutoReply(botId: number, id: number, input: AutoReplyInput): Promise<AutoReplyRow | undefined> {
  await assertSingleFallback(botId, input, id);
  const updated = (await mapFallbackConflict(() =>
    db
      .update(autoReplies)
      .set(columnsFor(input))
      .where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, id)))
      .returning()
  ))[0];
  await noteStartRule(botId);
  await pruneRuleMedia(botId);
  return updated;
}

export async function deleteAutoReply(botId: number, id: number): Promise<boolean> {
  const deleted = (await db.delete(autoReplies).where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, id)))).count > 0;
  await db.delete(autoReplyUserHits).where(and(eq(autoReplyUserHits.botId, botId), eq(autoReplyUserHits.ruleId, id)));
  await noteStartRule(botId);
  await pruneRuleMedia(botId);
  return deleted;
}

/** Swaps a rule with its neighbour in list order. */
export async function moveAutoReply(botId: number, id: number, direction: "up" | "down"): Promise<void> {
  const rules = await listAutoReplies(botId);
  const index = rules.findIndex((r) => r.id === id);
  const other = rules[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  await db.transaction(async (tx) => {
    // Positions can tie (default 0), so assign the whole order explicitly.
    const order = rules.map((r) => r.id);
    [order[index], order[order.indexOf(other.id)]] = [other.id, id];
    for (const [position, ruleId] of order.entries()) {
      await tx.update(autoReplies).set({ position }).where(and(eq(autoReplies.botId, botId), eq(autoReplies.id, ruleId)));
    }
  });
}

export { MEDIA_KINDS } from "./validation";
export type { MediaKind } from "./match-message";
export { mediaKindOf, startPayloadOf } from "./match-message";

/**
 * Whether the person's history allows this rule to answer them now: "once per person" and "wait between replies" need
 * the stored record of earlier answers. A rule without those conditions, or an unknown person, is always allowed.
 */
async function personAllows(rule: AutoReplyRow, userId: number | undefined): Promise<boolean> {
  const c = parseConditions(rule.conditions);
  if (!needsUserState(c) || userId === undefined) return true;
  const row = (await db
    .select()
    .from(autoReplyUserHits)
    .where(and(eq(autoReplyUserHits.ruleId, rule.id), eq(autoReplyUserHits.userId, String(userId)))))[0];
  if (!row) return true;
  if (c!.oncePerUser) return false;
  return !(c!.cooldownSec && Date.now() - row.lastAt.getTime() < c!.cooldownSec * 1000);
}

/**
 * The rule that answers `message`: the first candidate from the shared matcher (`matchMessageRules`, which the
 * dashboard's test chat also runs) whose per-person limits allow it, so a rule that already answered this person
 * "once" lets the next matching rule (often "anything else") reply instead.
 */
export async function matchAutoReply(botId: number, botUsername: string, message: TelegramMessage): Promise<AutoReplyRow | undefined> {
  const candidates = matchMessageRules(await listAutoReplies(botId), botUsername, message);
  const userId = actorOf(message)?.id;
  for (const rule of candidates) if (await personAllows(rule, userId)) return rule;
  return undefined;
}

/** The "someone reacted" rule for a new emoji reaction, honouring the same per-person limits. */
export async function matchReactionRule(botId: number, emojis: readonly string[], chatType: string, userId: number | undefined): Promise<AutoReplyRow | undefined> {
  for (const rule of matchReactionRules(await listAutoReplies(botId), emojis, chatType)) if (await personAllows(rule, userId)) return rule;
  return undefined;
}

/** The first enabled rule answering a pressed button with this callback data (exact data or a data prefix). */
export async function matchCallbackRule(botId: number, data: string): Promise<AutoReplyRow | undefined> {
  return findCallbackRule((await listAutoReplies(botId)), data);
}

/** Counts a rule firing. Called when its reply is sent (after the update's writes), not when it is matched. */
async function bumpHits(ruleId: number): Promise<void> {
  await db.update(autoReplies)
    .set({ hits: sql`${autoReplies.hits} + 1`, lastHitAt: new Date() })
    .where(eq(autoReplies.id, ruleId));
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
 * retry of the update after a database error can't reply twice.
 */
export async function sendAutoReply(botId: number, token: string, rule: AutoReplyRow, message: TelegramMessage, botUsername = ""): Promise<void> {
  // For a "someone joined" rule the reply is about the person who joined, not whoever added them.
  await fireRule(botId, token, rule, message.chat.id, actorOf(message), startPayloadOf(message, botUsername));
}

/**
 * Counts the rule firing, remembers the person (only for rules with a per-person limit) and sends the reply in the
 * background. The writes come first and the send is not awaited, as in `sendAutoReply`: a retried update can't reply twice.
 */
export async function fireRule(botId: number, token: string, rule: AutoReplyRow, chatId: number, sender: TelegramMessage["from"], payload: string | null): Promise<void> {
  await bumpHits(rule.id);
  await recordUserHit(rule, sender?.id);
  deliverRuleReply(botId, token, rule, chatId, sender, payload).catch((err) =>
    logError("auto-reply", `bot ${botId} rule ${rule.id} failed`, err, { botId, ruleId: rule.id })
  );
}

async function recordUserHit(rule: AutoReplyRow, userId: number | undefined): Promise<void> {
  if (userId === undefined || !needsUserState(parseConditions(rule.conditions))) return;
  const now = new Date();
  await db
    .insert(autoReplyUserHits)
    .values({ ruleId: rule.id, botId: rule.botId, userId: String(userId), lastAt: now, count: 1 })
    .onConflictDoUpdate({ target: [autoReplyUserHits.ruleId, autoReplyUserHits.userId], set: { lastAt: now, count: sql`${autoReplyUserHits.count} + 1` } });
}

async function deliverRuleReply(
  botId: number,
  token: string,
  rule: AutoReplyRow,
  chatId: number,
  sender: TelegramMessage["from"],
  payload: string | null
): Promise<void> {
  const ctx = templateContext(token, sender, payload);
  const text = await renderTemplate(rule.replyText, rule.parseMode, ctx);
  const opts = {
    parseMode: rule.parseMode ?? undefined,
    // A rule fires in groups too, where Telegram rejects Mini App buttons (and the failure is only logged by the caller).
    buttons: buttonsForChat(parseButtons(rule.buttons), chatId),
    replyKeyboard: replyKeyboardForChat(parseReplyKeyboard(rule.replyKeyboard), chatId),
  };
  const media = parseRuleMedia(rule.media);
  const sent = media ? await sendRuleMedia(botId, token, chatId, media, text, opts) : await botApi.sendMessage(token, chatId, text, opts);
  await recordOutgoing(botId, sent);
  await deliverFollowUps(botId, token, chatId, parseFollowUps(rule.followUps), ctx);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends a rule's follow-up messages in order, each after its own wait (with "typing…" if asked). The waits are
 * capped in total; the first failure stops the rest, since later messages usually build on earlier ones.
 */
async function deliverFollowUps(botId: number, token: string, chatId: number, followUps: FollowUp[], ctx: TemplateContext): Promise<void> {
  let budgetMs = MAX_TOTAL_DELAY_S * 1000;
  for (const f of followUps) {
    const waitMs = Math.min(f.delaySec ?? 0, MAX_FOLLOW_UP_DELAY_S) * 1000;
    if (waitMs > budgetMs) break;
    budgetMs -= waitMs;
    if (f.typing) await botApi.sendChatAction(token, chatId).catch(() => {});
    if (waitMs) await sleep(waitMs);
    await recordOutgoing(botId, await sendFollowUp(botId, token, chatId, f, ctx));
  }
}

async function sendFollowUp(botId: number, token: string, chatId: number, f: FollowUp, ctx: TemplateContext): Promise<TelegramMessage> {
  switch (f.kind) {
    case "text":
      return botApi.sendMessage(token, chatId, await renderTemplate(f.text, f.parseMode, ctx), {
        parseMode: f.parseMode ?? undefined,
        buttons: buttonsForChat(f.buttons, chatId),
      });
    case "media":
      return sendRuleMedia(botId, token, chatId, f.media, await renderTemplate(f.caption ?? "", f.parseMode, ctx), {
        parseMode: f.parseMode ?? undefined,
        buttons: buttonsForChat(f.buttons, chatId),
      });
    case "location":
      return botApi.sendLocation(token, chatId, f.latitude, f.longitude);
    case "contact":
      return botApi.sendContact(token, chatId, f);
    case "dice":
      return botApi.sendDice(token, chatId, f.emoji);
  }
}

/** Updates the stored copy of a message the bot just edited. Does nothing when it was never stored (it predates monitoring). */
async function updateStoredMessage(botId: number, message: TelegramMessage): Promise<void> {
  const { text, mediaType } = describeMessage(message);
  await db.update(botMessages)
    .set({ text, mediaType, raw: JSON.stringify(message), editedAt: new Date((message.edit_date ?? message.date) * 1000) })
    .where(and(eq(botMessages.botId, botId), eq(botMessages.chatId, String(message.chat.id)), eq(botMessages.telegramMessageId, message.message_id)));
}

const isNotModified = (err: unknown) => err instanceof Error && /message is not modified/i.test(err.message);

/**
 * Answers a pressed button according to its rule: a toast/alert, an edit of the message the button is on, or a new
 * message in that chat. Every case ends by answering the callback so the spinner stops. Never throws.
 * An edit falls back to a new message when the original can't be edited (too old, not the bot's); a button on an
 * inline-mode message has no chat to message, so those only get the toast.
 */
export async function answerCallbackWithRule(botId: number, token: string, rule: AutoReplyRow, query: TelegramCallbackQuery): Promise<void> {
  await bumpHits(rule.id);
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
        if (edited !== true) await updateStoredMessage(botId, edited);
        return;
      } catch (err) {
        if (isNotModified(err)) return;
        // Fall through to a new message.
      }
    }
    // A new message (or the fallback of a failed edit): same delivery as a message rule, so attachments and follow-ups work.
    await deliverRuleReply(botId, token, rule, chat.id, query.from, null);
  })().catch((err) => logError("auto-reply", `bot ${botId} button rule ${rule.id} failed`, err, { botId, ruleId: rule.id }));
}
