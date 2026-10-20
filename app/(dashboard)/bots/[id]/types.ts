import type { InlineButton, ReplyKeyboard, TelegramPoll } from "@/lib/botapi";

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

export interface BotStatsData {
  users: { total: number; newLast7d: number; activeLast7d: number };
  messages: { incoming: number; outgoing: number; activeChatsLast7d: number };
  chats: { members: number; administrator: number };
  perDay: { date: string; incoming: number; outgoing: number }[];
  monitorEnabled: boolean;
}

export interface BotHealth {
  status: "ok" | "warning" | "error";
  message: string | null;
  checkedAt: string | null;
}

export interface BotDetail {
  id: number;
  username: string;
  firstName: string;
  hasToken: boolean;
  token?: string;
  monitorEnabled: boolean;
  /** Last background health check; null before the first one. */
  health?: BotHealth | null;
  info?: {
    id: number;
    first_name: string;
    username?: string;
    can_join_groups?: boolean;
    can_read_all_group_messages?: boolean;
    supports_inline_queries?: boolean;
    can_connect_to_business?: boolean;
    has_main_web_app?: boolean;
  };
  name?: string;
  description?: string;
  shortDescription?: string;
  commands?: BotCommand[];
  webhook?: WebhookInfo | null;
}

export interface BotMessageRow {
  id: number;
  chatId: string;
  fromUserId: string | null;
  fromUsername: string | null;
  fromFirstName: string | null;
  direction: "in" | "out";
  text: string | null;
  mediaType: "photo" | "document" | "video" | "audio" | "voice" | "sticker" | "poll" | "other" | null;
  /** Telegram message ID of the message this one replies to. */
  replyToMessageId: number | null;
  editedAt: string | null;
  pinned: boolean;
  businessConnectionId: string | null;
  /** Telegram reported it deleted in the business chat; kept here as history. */
  deletedAt: string | null;
  telegramMessageId: number | null;
  createdAt: string;
  /** Set for poll messages: options with vote counts, kept current while monitoring is on. */
  poll: TelegramPoll | null;
}

export type ParseModeChoice = "" | "HTML" | "MarkdownV2";

/** What the composer hands to the messages tab to send. */
export interface SendPayload {
  text: string;
  parseMode: ParseModeChoice;
  replyTo?: number;
  buttons?: InlineButton[][];
  replyKeyboard?: ReplyKeyboard;
  /** Message effect (private chats only). */
  effectId?: string;
  /** The Business connection to reply through (set when the open chat is a business chat). */
  businessConnectionId?: string;
  file?: File;
  /** Send an image as an uncompressed file instead of a photo. */
  asFile?: boolean;
}

export interface BotConversation {
  /** Selection key: the chat ID, or `chatId|connectionId` for a Telegram Business chat. */
  key: string;
  chatId: string;
  /** Set for chats of a connected Business account (never forwardable, no contact photo). */
  connectionId: string | null;
  name: string;
  lastText: string | null;
  lastAt: number;
  count: number;
}

export interface BotContact {
  chatId: string;
  name: string;
}

export type AutoReplyMatchType = "command" | "exact" | "contains" | "callback" | "callback_prefix" | "deeplink" | "media" | "shared";

export type CallbackAction = "toast" | "edit" | "reply";

export interface AutoReplyRule {
  id: number;
  matchType: AutoReplyMatchType;
  pattern: string;
  replyText: string;
  parseMode: "HTML" | "MarkdownV2" | null;
  buttons: InlineButton[][] | null;
  replyKeyboard: ReplyKeyboard | null;
  showAlert: boolean;
  callbackAction: CallbackAction;
  hits: number;
  lastHitAt: string | null;
  enabled: boolean;
}

/** A Telegram Business account connected to the bot, and what it allowed. */
export interface BusinessConnectionInfo {
  connectionId: string;
  userId: string;
  userName: string;
  isEnabled: boolean;
  connectedAt: string;
  rights: Record<string, boolean | undefined>;
}

/** A canned result offered when someone types @bot in any chat. */
export interface InlineResultRule {
  id: number;
  prefix: string;
  title: string;
  description: string | null;
  messageText: string;
  parseMode: "HTML" | "MarkdownV2" | null;
  buttons: InlineButton[][] | null;
  uses: number;
  enabled: boolean;
}

export interface BroadcastItem {
  id: number;
  text: string;
  status: "queued" | "running" | "done" | "cancelled" | "failed";
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  error: string | null;
  createdAt: string;
}

export interface ScheduledItem {
  id: number;
  chatId: string;
  text: string;
  sendAt: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  error: string | null;
}
