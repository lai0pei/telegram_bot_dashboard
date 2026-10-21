/**
 * Thin typed wrapper around the Telegram Bot API (https://api.telegram.org).
 * One function per method actually used by the dashboard — not a full SDK.
 */

const BASE_URL = "https://api.telegram.org";

export class BotApiError extends Error {
  constructor(
    public method: string,
    public description: string,
    public errorCode?: number,
    public retryAfter?: number
  ) {
    super(`Bot API ${method} failed: ${description}`);
  }
}

/** getUpdates 409: another poller holds this token ("other") or a webhook is set ("webhook"). */
export function pollConflictKind(err: unknown): "other" | "webhook" | null {
  if (!(err instanceof BotApiError) || err.method !== "getUpdates" || err.errorCode !== 409) return null;
  return /webhook/i.test(err.description) ? "webhook" : "other";
}

async function call<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: params ? JSON.stringify(params) : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!json.ok) {
    throw new BotApiError(method, json.description ?? "Unknown error", json.error_code, json.parameters?.retry_after);
  }
  return json.result as T;
}

/** Like call(), but sends a file as multipart/form-data (sendPhoto, sendDocument, ...). Other fields are stringified. */
async function callMultipart<T>(
  token: string,
  method: string,
  fields: Record<string, unknown>,
  file: { field: string; name: string; type: string; data: Buffer }
): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  form.append(file.field, new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  const res = await fetch(`${BASE_URL}/bot${token}/${method}`, { method: "POST", body: form, cache: "no-store" });
  const json = await res.json();
  if (!json.ok) {
    throw new BotApiError(method, json.description ?? "Unknown error", json.error_code, json.parameters?.retry_after);
  }
  return json.result as T;
}

export interface BotApiUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
  can_connect_to_business?: boolean;
  has_main_web_app?: boolean;
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  ip_address?: string;
  allowed_updates?: string[];
}

export type BotCommandScopeType =
  | "default"
  | "all_private_chats"
  | "all_group_chats"
  | "all_chat_administrators"
  | "chat"
  | "chat_administrators"
  | "chat_member";

export interface CommandOptions {
  scope?: BotCommandScopeType;
  languageCode?: string;
  /** Required for the `chat`, `chat_administrators` and `chat_member` scopes. */
  chatId?: string;
  /** Required for the `chat_member` scope. */
  userId?: string;
}

export type MenuButton =
  | { type: "default" }
  | { type: "commands" }
  | { type: "web_app"; text: string; web_app: { url: string } };

export interface ChatAdministratorRights {
  is_anonymous?: boolean;
  can_manage_chat?: boolean;
  can_delete_messages?: boolean;
  can_manage_video_chats?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
}

export interface SetWebhookOptions {
  secretToken?: string;
  allowedUpdates?: string[];
  maxConnections?: number;
  dropPendingUpdates?: boolean;
}

function commandParams(opts?: CommandOptions): Record<string, unknown> {
  return {
    scope:
      opts?.scope && opts.scope !== "default"
        ? {
            type: opts.scope,
            chat_id: opts.chatId !== undefined ? Number(opts.chatId) : undefined,
            user_id: opts.userId !== undefined ? Number(opts.userId) : undefined,
          }
        : undefined,
    language_code: opts?.languageCode || undefined,
  };
}

export interface TelegramFile {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: { id: number; type: string; username?: string; first_name?: string; last_name?: string; title?: string };
  from?: { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string; language_code?: string };
  text?: string;
  caption?: string;
  photo?: (TelegramFile & { width: number; height: number })[];
  document?: TelegramFile;
  video?: TelegramFile;
  audio?: TelegramFile;
  voice?: TelegramFile;
  sticker?: TelegramFile;
  reply_to_message?: { message_id: number };
  /** Service message: people who joined the group (the bot itself included when it was added). */
  new_chat_members?: { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string; language_code?: string }[];
  poll?: TelegramPoll;
  /** Set when the message came through a Business connection (a chat of the business owner). */
  business_connection_id?: string;
  contact?: { phone_number: string; first_name: string; last_name?: string; user_id?: number };
  location?: { latitude: number; longitude: number };
  venue?: { title: string; address: string; location: { latitude: number; longitude: number } };
  animation?: TelegramFile;
  video_note?: TelegramFile;
  dice?: { emoji: string; value: number };
  /** Answer to a `request_users` keyboard button. */
  users_shared?: { request_id: number; users: { user_id: number; first_name?: string; last_name?: string; username?: string }[] };
  /** Answer to a `request_chat` keyboard button. */
  chat_shared?: { request_id: number; chat_id: number; title?: string; username?: string };
  /** Data sent back by a Mini App opened from a reply-keyboard button. */
  web_app_data?: { data: string; button_text: string };
  story?: { chat: { id: number }; id: number };
}

export interface TelegramPoll {
  id: string;
  question: string;
  options: { text: string; voter_count: number }[];
  total_voter_count: number;
  is_closed: boolean;
  is_anonymous: boolean;
  type: "regular" | "quiz";
  allows_multiple_answers: boolean;
  correct_option_id?: number;
  explanation?: string;
}

/** Someone asked to join a chat through an approval-required invite link. */
export interface TelegramChatJoinRequest {
  chat: { id: number; type: string; title?: string; username?: string };
  from: { id: number; is_bot: boolean; first_name: string; username?: string };
  date: number;
  bio?: string;
}

/** A reaction on a message. Only `emoji` ones can match a rule; custom and paid reactions are ignored. */
export type TelegramReactionType = { type: "emoji"; emoji: string } | { type: "custom_emoji"; custom_emoji_id: string } | { type: "paid" };

/** Someone changed their reactions on a message (needs `message_reaction` in allowed_updates; in groups the bot must be an admin). */
export interface TelegramMessageReaction {
  chat: { id: number; type: string; title?: string };
  message_id: number;
  user?: { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string; language_code?: string };
  date: number;
  old_reaction: TelegramReactionType[];
  new_reaction: TelegramReactionType[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string; language_code?: string };
  message?: TelegramMessage;
  /** Set instead of `message` when the button is on an inline-mode message. */
  inline_message_id?: string;
  data?: string;
  /** Set (without `data`) when the Play button of a game message is pressed. */
  game_short_name?: string;
}

/** A user's membership record in a chat. Which can_* flags are present depends on `status` and the chat type. */
export interface ChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: { id: number; is_bot: boolean; first_name: string; username?: string };
  can_manage_chat?: boolean;
  can_change_info?: boolean;
  can_delete_messages?: boolean;
  can_invite_users?: boolean;
  can_restrict_members?: boolean;
  can_pin_messages?: boolean;
  can_promote_members?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  is_member?: boolean;
}

export interface ChatInviteLink {
  invite_link: string;
  name?: string;
  is_primary: boolean;
  is_revoked: boolean;
  creator?: { id: number; username?: string };
}

export interface TelegramChatMemberUpdate {
  chat: { id: number; type: string; title?: string; username?: string };
  date: number;
  old_chat_member: ChatMember;
  new_chat_member: ChatMember;
}

/** What the business account owner allowed the bot to do (BusinessBotRights). */
export interface BusinessBotRights {
  can_reply?: boolean;
  can_read_messages?: boolean;
  can_delete_sent_messages?: boolean;
  can_delete_all_messages?: boolean;
  can_edit_name?: boolean;
  can_edit_bio?: boolean;
  can_edit_profile_photo?: boolean;
  can_edit_username?: boolean;
}

/** A Telegram Business account connected (or disconnected / changed) this bot. */
export interface BusinessConnection {
  id: string;
  user: { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string };
  user_chat_id: number;
  date: number;
  rights?: BusinessBotRights;
  is_enabled: boolean;
}

/** Messages deleted in a chat of a connected business account. */
export interface BusinessMessagesDeleted {
  business_connection_id: string;
  chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
  message_ids: number[];
}

/** Someone typed @bot … in a chat. Only the fields the dashboard uses. */
export interface TelegramInlineQuery {
  id: string;
  from: { id: number; is_bot: boolean; first_name: string; username?: string };
  query: string;
  offset: string;
}

/** A result the user picked and sent. Only delivered when inline feedback is on in BotFather. */
export interface TelegramChosenInlineResult {
  result_id: string;
  from: { id: number; is_bot: boolean; first_name: string; username?: string };
  query: string;
  inline_message_id?: string;
}

/** An inline result that sends a text message when picked. */
export interface InlineArticle {
  type: "article";
  id: string;
  title: string;
  description?: string;
  input_message_content: { message_text: string; parse_mode?: ParseMode };
  reply_markup?: { inline_keyboard: InlineButton[][] };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramChatMemberUpdate;
  chat_join_request?: TelegramChatJoinRequest;
  message_reaction?: TelegramMessageReaction;
  poll?: TelegramPoll;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
  business_connection?: BusinessConnection;
  business_message?: TelegramMessage;
  edited_business_message?: TelegramMessage;
  deleted_business_messages?: BusinessMessagesDeleted;
}

/** The update types the poller asks for. Sent explicitly because Telegram otherwise keeps whatever list was set before. */
export const POLLED_UPDATE_TYPES = ["message", "edited_message", "callback_query", "my_chat_member", "chat_join_request",
  "message_reaction",
  "poll",
  "inline_query",
  "chosen_inline_result",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
];

export interface StarAmount {
  amount: number;
  nanostar_amount?: number;
}

/** Either side of a Stars transaction. Only the `user` variant carries a person; others are Telegram/Fragment/ads etc. */
export interface TransactionPartner {
  type: string;
  transaction_type?: string;
  user?: { id: number; is_bot: boolean; first_name: string; username?: string };
  invoice_payload?: string;
}

export interface StarTransaction {
  /** For incoming payments this is SuccessfulPayment.telegram_payment_charge_id, which refundStarPayment needs. */
  id: string;
  amount: number;
  nanostar_amount?: number;
  date: number;
  source?: TransactionPartner;
  receiver?: TransactionPartner;
}

export type ParseMode = "HTML" | "MarkdownV2";

export type ButtonStyle = "primary" | "success" | "danger";

/**
 * An inline button: a label plus exactly one action. Telegram restrictions: `web_app` only works in a private chat
 * with the bot; `switch_inline_query*` only does anything when the bot has inline mode on.
 */
export interface InlineButton {
  text: string;
  style?: ButtonStyle;
  url?: string;
  /** Reported back to the bot when pressed (only noticed while monitoring is on). */
  callback_data?: string;
  copy_text?: { text: string };
  web_app?: { url: string };
  /** May be empty: the bot's username is inserted with no query. */
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  /** Telegram Login button: the URL's host must be the bot's login domain (BotFather /setdomain). */
  login_url?: { url: string; forward_text?: string; bot_username?: string; request_write_access?: boolean };
  /** Lets the user pick a chat of the allowed kinds, then opens it with the bot's inline query. */
  switch_inline_query_chosen_chat?: {
    query?: string;
    allow_user_chats?: boolean;
    allow_bot_chats?: boolean;
    allow_group_chats?: boolean;
    allow_channel_chats?: boolean;
  };
}

/** True for a positive chat ID, i.e. a private chat with a user (groups and channels are negative). */
export function isPrivateChatId(chatId: string | number): boolean {
  return /^\d+$/.test(String(chatId));
}

/**
 * The buttons Telegram will accept in this chat: Mini App buttons are dropped outside private chats (the whole
 * message would otherwise be rejected). Empty rows are removed; returns undefined when nothing is left.
 */
export function buttonsForChat(buttons: InlineButton[][] | null | undefined, chatId: string | number): InlineButton[][] | undefined {
  if (!buttons?.length) return undefined;
  const isPrivate = isPrivateChatId(chatId);
  const rows = buttons.map((row) => row.filter((b) => isPrivate || !b.web_app)).filter((row) => row.length);
  return rows.length ? rows : undefined;
}

/** Pick-a-user request: the answer arrives as a `users_shared` service message carrying `request_id`. */
export interface KeyboardRequestUsers {
  request_id: number;
  user_is_bot?: boolean;
  user_is_premium?: boolean;
  /** 1–10; default 1. */
  max_quantity?: number;
  request_name?: boolean;
  request_username?: boolean;
  request_photo?: boolean;
}

/** Pick-a-chat request: the answer arrives as a `chat_shared` service message carrying `request_id`. */
export interface KeyboardRequestChat {
  request_id: number;
  chat_is_channel: boolean;
  chat_is_forum?: boolean;
  chat_has_username?: boolean;
  /** Only chats the user owns. */
  chat_is_created?: boolean;
  bot_is_member?: boolean;
  request_title?: boolean;
  request_username?: boolean;
  request_photo?: boolean;
}

/**
 * A button on a reply keyboard: it sends its text, or (at most one) asks for a contact, location, user, chat or poll,
 * or opens a Mini App. All of the requests only work in private chats.
 */
export interface KeyboardButton {
  text: string;
  style?: ButtonStyle;
  request_contact?: boolean;
  request_location?: boolean;
  request_users?: KeyboardRequestUsers;
  request_chat?: KeyboardRequestChat;
  request_poll?: { type?: "quiz" | "regular" };
  web_app?: { url: string };
}

/** The keys of KeyboardButton that make it more than a plain text button (all private-chat only). */
export const KEYBOARD_REQUEST_KEYS = ["request_contact", "request_location", "request_users", "request_chat", "request_poll", "web_app"] as const;

/**
 * What replaces the user's keyboard: custom buttons that send their text as a message, a removal of that keyboard,
 * or a forced reply box. Sent as `reply_markup`, so it can't be combined with inline buttons. Not allowed in channels.
 */
export type ReplyKeyboard =
  | { kind: "keyboard"; rows: KeyboardButton[][]; persistent?: boolean; resize?: boolean; oneTime?: boolean; placeholder?: string }
  | { kind: "remove" }
  | { kind: "force_reply"; placeholder?: string };

/** The keyboard as it can be sent to this chat: request and Mini App buttons are reduced to plain text buttons outside private chats. */
export function replyKeyboardForChat(keyboard: ReplyKeyboard | null | undefined, chatId: string | number): ReplyKeyboard | undefined {
  if (!keyboard) return undefined;
  if (keyboard.kind !== "keyboard" || isPrivateChatId(chatId)) return keyboard;
  const rows = keyboard.rows.map((row) =>
    row.map((b) => Object.fromEntries(Object.entries(b).filter(([key]) => !(KEYBOARD_REQUEST_KEYS as readonly string[]).includes(key))) as KeyboardButton)
  );
  return { ...keyboard, rows };
}

function replyMarkup(opts: SendOptions): Record<string, unknown> | undefined {
  if (opts.buttons?.length) return { inline_keyboard: opts.buttons };
  const k = opts.replyKeyboard;
  if (!k) return undefined;
  if (k.kind === "remove") return { remove_keyboard: true };
  if (k.kind === "force_reply") return { force_reply: true, input_field_placeholder: k.placeholder || undefined };
  return {
    keyboard: k.rows,
    is_persistent: k.persistent || undefined,
    resize_keyboard: k.resize || undefined,
    one_time_keyboard: k.oneTime || undefined,
    input_field_placeholder: k.placeholder || undefined,
  };
}

export interface PollParams {
  question: string;
  options: string[];
  isAnonymous: boolean;
  allowsMultiple: boolean;
  /** Present for a quiz: exactly one correct option. */
  quiz?: { correctIndex: number; explanation?: string };
}

/** Options shared by the send* methods. */
export interface SendOptions {
  parseMode?: ParseMode;
  replyToMessageId?: number;
  disableNotification?: boolean;
  /** Rows of inline buttons (URL or callback). Callback presses are only answered while monitoring is on. */
  buttons?: InlineButton[][];
  /** Reply keyboard / remove / force-reply. Ignored when `buttons` is set (a message has one reply_markup). */
  replyKeyboard?: ReplyKeyboard;
  /** Animation behind the message (`message_effect_id`); private chats only. */
  effectId?: string;
  /** Send on behalf of a connected business account (needs its can_reply right). */
  businessConnectionId?: string;
}

function sendParams(opts: SendOptions = {}): Record<string, unknown> {
  return {
    parse_mode: opts.parseMode,
    reply_parameters: opts.replyToMessageId ? { message_id: opts.replyToMessageId, allow_sending_without_reply: true } : undefined,
    disable_notification: opts.disableNotification || undefined,
    reply_markup: replyMarkup(opts),
    message_effect_id: opts.effectId || undefined,
    business_connection_id: opts.businessConnectionId || undefined,
  };
}

export type MediaMethod = "sendPhoto" | "sendDocument" | "sendVideo" | "sendAudio" | "sendAnimation" | "sendVoice" | "sendSticker";

export interface BotApiChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo?: { small_file_id: string; big_file_id: string };
  description?: string;
  invite_link?: string;
}

interface BotApiFile {
  file_id: string;
  file_size?: number;
  file_path?: string;
}

/** Display name of a chat: person name for private chats, title for groups/channels, @username as a last resort. */
export function botApiChatName(chat: Pick<BotApiChat, "title" | "first_name" | "last_name" | "username">): string | null {
  const person = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  return chat.title || person || (chat.username ? `@${chat.username}` : null);
}

/**
 * Downloads a file by `file_id` (Bot API limit: 20 MB). The download URL contains the bot token, so failures
 * are rethrown with a generic message and never carry the URL.
 */
export async function downloadBotFile(token: string, fileId: string): Promise<{ data: Buffer; contentType: string | null }> {
  const file = await call<BotApiFile>(token, "getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram didn't provide a download path for that file (it may be over 20 MB).");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/file/bot${token}/${file.file_path}`, { cache: "no-store" });
  } catch {
    throw new Error("Couldn't reach Telegram to download the file.");
  }
  if (!res.ok) throw new BotApiError("getFile", `download failed with status ${res.status}`, res.status === 401 ? 401 : undefined);
  return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
}

export const botApi = {
  getMe: (token: string) => call<BotApiUser>(token, "getMe"),

  getMyName: (token: string, languageCode?: string) =>
    call<{ name: string }>(token, "getMyName", { language_code: languageCode || undefined }),
  setMyName: (token: string, name: string, languageCode?: string) =>
    call<true>(token, "setMyName", { name, language_code: languageCode || undefined }),

  getMyDescription: (token: string, languageCode?: string) =>
    call<{ description: string }>(token, "getMyDescription", { language_code: languageCode || undefined }),
  setMyDescription: (token: string, description: string, languageCode?: string) =>
    call<true>(token, "setMyDescription", { description, language_code: languageCode || undefined }),

  getMyShortDescription: (token: string, languageCode?: string) =>
    call<{ short_description: string }>(token, "getMyShortDescription", { language_code: languageCode || undefined }),
  setMyShortDescription: (token: string, short_description: string, languageCode?: string) =>
    call<true>(token, "setMyShortDescription", { short_description, language_code: languageCode || undefined }),

  getMyCommands: (token: string, opts?: CommandOptions) =>
    call<BotCommand[]>(token, "getMyCommands", commandParams(opts)),
  setMyCommands: (token: string, commands: BotCommand[], opts?: CommandOptions) =>
    call<true>(token, "setMyCommands", { commands, ...commandParams(opts) }),
  deleteMyCommands: (token: string, opts?: CommandOptions) =>
    call<true>(token, "deleteMyCommands", commandParams(opts)),

  /** The bot-wide default menu button, or (with `chatId`, a private chat) the one that user sees. */
  getChatMenuButton: (token: string, chatId?: number) => call<MenuButton>(token, "getChatMenuButton", { chat_id: chatId }),
  /** With `chatId` only that private chat changes; `{ type: "default" }` there removes the override. */
  setChatMenuButton: (token: string, menuButton: MenuButton, chatId?: number) =>
    call<true>(token, "setChatMenuButton", { menu_button: menuButton, chat_id: chatId }),

  getMyDefaultAdministratorRights: (token: string, forChannels = false) =>
    call<ChatAdministratorRights>(token, "getMyDefaultAdministratorRights", { for_channels: forChannels }),
  setMyDefaultAdministratorRights: (token: string, rights: ChatAdministratorRights, forChannels = false) =>
    call<true>(token, "setMyDefaultAdministratorRights", { rights, for_channels: forChannels }),

  getWebhookInfo: (token: string) => call<WebhookInfo>(token, "getWebhookInfo"),
  setWebhook: (token: string, url: string, opts: SetWebhookOptions = {}) =>
    call<true>(token, "setWebhook", {
      url,
      secret_token: opts.secretToken,
      allowed_updates: opts.allowedUpdates,
      max_connections: opts.maxConnections,
      drop_pending_updates: opts.dropPendingUpdates,
    }),
  deleteWebhook: (token: string, dropPendingUpdates = false) =>
    call<true>(token, "deleteWebhook", { drop_pending_updates: dropPendingUpdates }),

  getUpdates: (token: string, offset?: number, timeout = 0) =>
    call<TelegramUpdate[]>(token, "getUpdates", {
      offset,
      timeout,
      allowed_updates: POLLED_UPDATE_TYPES,
    }),

  getChat: (token: string, chatId: number | string) => call<BotApiChat>(token, "getChat", { chat_id: chatId }),

  sendMessage: (token: string, chatId: number | string, text: string, opts?: SendOptions) =>
    call<TelegramMessage>(token, "sendMessage", { chat_id: chatId, text, ...sendParams(opts) }),

  /** sendPhoto / sendDocument / sendVideo / sendAudio with an uploaded file and optional caption. */
  sendMedia: (
    token: string,
    method: MediaMethod,
    chatId: number | string,
    file: { name: string; type: string; data: Buffer },
    caption?: string,
    opts?: SendOptions
  ) =>
    callMultipart<TelegramMessage>(
      token,
      method,
      { chat_id: chatId, caption: caption || undefined, ...sendParams(opts) },
      { field: method.slice("send".length).toLowerCase(), ...file }
    ),

  /** Sends a file Telegram already has (a `file_id` from an earlier upload) with no upload; fails with 400 if the ID isn't valid for this bot. */
  sendMediaById: (token: string, method: MediaMethod, chatId: number | string, fileId: string, caption?: string, opts?: SendOptions) =>
    call<TelegramMessage>(token, method, {
      chat_id: chatId,
      [method.slice("send".length).toLowerCase()]: fileId,
      caption: caption || undefined,
      ...sendParams(opts),
    }),

  sendLocation: (token: string, chatId: number | string, latitude: number, longitude: number, opts?: SendOptions) =>
    call<TelegramMessage>(token, "sendLocation", { chat_id: chatId, latitude, longitude, ...sendParams(opts) }),

  sendContact: (token: string, chatId: number | string, contact: { phone: string; firstName: string; lastName?: string }, opts?: SendOptions) =>
    call<TelegramMessage>(token, "sendContact", {
      chat_id: chatId,
      phone_number: contact.phone,
      first_name: contact.firstName,
      last_name: contact.lastName || undefined,
      ...sendParams(opts),
    }),

  sendDice: (token: string, chatId: number | string, emoji: string, opts?: SendOptions) =>
    call<TelegramMessage>(token, "sendDice", { chat_id: chatId, emoji, ...sendParams(opts) }),

  editMessageText: (token: string, chatId: number | string, messageId: number, text: string, opts?: SendOptions) =>
    call<TelegramMessage | true>(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: opts?.parseMode,
      reply_markup: opts?.buttons?.length ? { inline_keyboard: opts.buttons } : undefined,
    }),

  editMessageCaption: (token: string, chatId: number | string, messageId: number, caption: string, opts?: SendOptions) =>
    call<TelegramMessage | true>(token, "editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption,
      parse_mode: opts?.parseMode,
      reply_markup: opts?.buttons?.length ? { inline_keyboard: opts.buttons } : undefined,
    }),

  pinChatMessage: (token: string, chatId: number | string, messageId: number) =>
    call<true>(token, "pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true }),
  unpinChatMessage: (token: string, chatId: number | string, messageId: number) =>
    call<true>(token, "unpinChatMessage", { chat_id: chatId, message_id: messageId }),

  forwardMessage: (token: string, chatId: number | string, fromChatId: number | string, messageId: number) =>
    call<TelegramMessage>(token, "forwardMessage", { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId }),
  /** Returns only the new message's ID (copyMessage's result is a MessageId, not a full message). */
  copyMessage: (token: string, chatId: number | string, fromChatId: number | string, messageId: number) =>
    call<{ message_id: number }>(token, "copyMessage", { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId }),

  getChatMember: (token: string, chatId: number | string, userId: number) =>
    call<ChatMember>(token, "getChatMember", { chat_id: chatId, user_id: userId }),
  getChatMemberCount: (token: string, chatId: number | string) => call<number>(token, "getChatMemberCount", { chat_id: chatId }),
  getChatAdministrators: (token: string, chatId: number | string) =>
    call<ChatMember[]>(token, "getChatAdministrators", { chat_id: chatId }),

  setChatTitle: (token: string, chatId: number | string, title: string) =>
    call<true>(token, "setChatTitle", { chat_id: chatId, title }),
  setChatDescription: (token: string, chatId: number | string, description: string) =>
    call<true>(token, "setChatDescription", { chat_id: chatId, description }),
  setChatPhoto: (token: string, chatId: number | string, file: { name: string; type: string; data: Buffer }) =>
    callMultipart<true>(token, "setChatPhoto", { chat_id: chatId }, { field: "photo", ...file }),
  deleteChatPhoto: (token: string, chatId: number | string) => call<true>(token, "deleteChatPhoto", { chat_id: chatId }),

  /** Revokes the chat's primary link and issues a new one (returns the link string). */
  exportChatInviteLink: (token: string, chatId: number | string) =>
    call<string>(token, "exportChatInviteLink", { chat_id: chatId }),
  createChatInviteLink: (token: string, chatId: number | string, name?: string, createsJoinRequest = false) =>
    call<ChatInviteLink>(token, "createChatInviteLink", {
      chat_id: chatId,
      name: name || undefined,
      creates_join_request: createsJoinRequest || undefined,
    }),
  revokeChatInviteLink: (token: string, chatId: number | string, inviteLink: string) =>
    call<ChatInviteLink>(token, "revokeChatInviteLink", { chat_id: chatId, invite_link: inviteLink }),

  banChatMember: (token: string, chatId: number | string, userId: number, revokeMessages = false) =>
    call<true>(token, "banChatMember", { chat_id: chatId, user_id: userId, revoke_messages: revokeMessages || undefined }),
  unbanChatMember: (token: string, chatId: number | string, userId: number) =>
    call<true>(token, "unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true }),
  /** `untilDate` (unix seconds) makes the restriction temporary; Telegram treats under 30s / over 366 days as forever. */
  restrictChatMember: (token: string, chatId: number | string, userId: number, canSend: boolean, untilDate?: number) =>
    call<true>(token, "restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
      permissions: {
        can_send_messages: canSend,
        can_send_audios: canSend,
        can_send_documents: canSend,
        can_send_photos: canSend,
        can_send_videos: canSend,
        can_send_video_notes: canSend,
        can_send_voice_notes: canSend,
        can_send_polls: canSend,
        can_send_other_messages: canSend,
        can_add_web_page_previews: canSend,
      },
    }),
  /** Promote with basic rights, or demote (all rights false). */
  promoteChatMember: (token: string, chatId: number | string, userId: number, promote: boolean) =>
    call<true>(token, "promoteChatMember", {
      chat_id: chatId,
      user_id: userId,
      can_manage_chat: promote,
      can_delete_messages: promote,
      can_invite_users: promote,
      can_pin_messages: promote,
      can_restrict_members: promote,
    }),
  leaveChat: (token: string, chatId: number | string) => call<true>(token, "leaveChat", { chat_id: chatId }),

  sendChatAction: (token: string, chatId: number | string, action = "typing") =>
    call<true>(token, "sendChatAction", { chat_id: chatId, action }),

  /** `text` shows as a toast (or a modal with `showAlert`); with neither it only clears the button's spinner. */
  answerCallbackQuery: (token: string, callbackQueryId: string, opts: { text?: string; showAlert?: boolean; url?: string } = {}) =>
    call<true>(token, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: opts.text || undefined,
      show_alert: opts.showAlert || undefined,
      url: opts.url || undefined,
    }),

  /** Sends a game by its BotFather short name; Telegram attaches the Play button. */
  sendGame: (token: string, chatId: number | string, gameShortName: string) =>
    call<TelegramMessage>(token, "sendGame", { chat_id: chatId, game_short_name: gameShortName }),

  sendPoll: (token: string, chatId: number | string, poll: PollParams) =>
    call<TelegramMessage>(token, "sendPoll", {
      chat_id: chatId,
      question: poll.question,
      options: poll.options.map((text) => ({ text })),
      is_anonymous: poll.isAnonymous,
      type: poll.quiz ? "quiz" : "regular",
      allows_multiple_answers: poll.quiz ? undefined : poll.allowsMultiple,
      correct_option_id: poll.quiz?.correctIndex,
      explanation: poll.quiz?.explanation || undefined,
    }),
  /** Returns the final poll with its vote counts. */
  stopPoll: (token: string, chatId: number | string, messageId: number) =>
    call<TelegramPoll>(token, "stopPoll", { chat_id: chatId, message_id: messageId }),

  approveChatJoinRequest: (token: string, chatId: number | string, userId: number) =>
    call<true>(token, "approveChatJoinRequest", { chat_id: chatId, user_id: userId }),
  declineChatJoinRequest: (token: string, chatId: number | string, userId: number) =>
    call<true>(token, "declineChatJoinRequest", { chat_id: chatId, user_id: userId }),

  getMyStarBalance: (token: string) => call<StarAmount>(token, "getMyStarBalance"),
  /** Oldest first: `offset` skips from the oldest transaction. `limit` is 1-100. */
  getStarTransactions: (token: string, offset: number, limit = 100) =>
    call<{ transactions: StarTransaction[] }>(token, "getStarTransactions", { offset, limit }),

  /** Always answer, with an empty list when nothing matches. A small `cacheTime` keeps dashboard edits visible quickly. */
  answerInlineQuery: (token: string, inlineQueryId: string, results: InlineArticle[], opts: { cacheTime: number; isPersonal: boolean }) =>
    call<true>(token, "answerInlineQuery", {
      inline_query_id: inlineQueryId,
      results,
      cache_time: opts.cacheTime,
      is_personal: opts.isPersonal || undefined,
    }),


  deleteMessage: (token: string, chatId: number | string, messageId: number) =>
    call<true>(token, "deleteMessage", { chat_id: chatId, message_id: messageId }),
};
