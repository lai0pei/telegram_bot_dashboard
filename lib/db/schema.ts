import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import type { InlineButton } from "../botapi";

/**
 * A dashboard account. Can be linked to multiple Telegram accounts (see
 * telegramAccounts). Sign-in is a Telegram QR scan, not a password — a
 * dashboard user is created automatically the first time an unrecognized
 * Telegram account signs in (lib/mtproto.ts finishLogin), so `username` is
 * just a display name (its Telegram @username or name), not unique or used
 * to authenticate.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * One row per Telegram account linked to a dashboard user. `id` is what
 * bots/chats.ownerUserId points at — bots and chats belong to a specific
 * linked Telegram account, not directly to the dashboard user. `ownerUserId`
 * is nullable: a row migrated from the old single-account `session` table
 * starts unclaimed (null) until someone binds that same Telegram account.
 * `telegramId` is globally unique since a given Telegram account can only
 * ever be linked to one dashboard user (the live MTProto client map in
 * lib/mtproto.ts is keyed by Telegram ID, so double-linking would let two
 * dashboard users drive the same live session).
 */
export const telegramAccounts = sqliteTable(
  "telegram_accounts",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id"),
    telegramId: text("telegram_id").notNull(),
    encryptedSessionString: text("encrypted_session_string").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    /** Set when Telegram reports the session ended (e.g. terminated from the phone's Devices list). Cleared by re-linking. */
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("telegram_accounts_telegram_id_unique").on(table.telegramId)]
);

export const bots = sqliteTable(
  "bots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerUserId: text("owner_user_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    username: text("username").notNull(),
    firstName: text("first_name").notNull(),
    encryptedToken: text("encrypted_token"),
    tokenFetchedAt: integer("token_fetched_at", { mode: "timestamp_ms" }),
    monitorEnabled: integer("monitor_enabled", { mode: "boolean" }).notNull().default(false),
    lastUpdateId: integer("last_update_id"),
    /** Result of the last background health check (lib/health.ts); null until the first check. */
    healthStatus: text("health_status", { enum: ["ok", "warning", "error"] }),
    healthMessage: text("health_message"),
    healthCheckedAt: integer("health_checked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("bots_owner_telegram_id_unique").on(table.ownerUserId, table.telegramId),
    uniqueIndex("bots_owner_username_unique").on(table.ownerUserId, table.username),
  ]
);

/**
 * Local mirror of the channels/groups a user owns or admins, synced from
 * their dialogs. Mainly exists to keep each channel's access hash, which
 * every channel API call needs and the session string doesn't persist.
 */
export const chats = sqliteTable(
  "chats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerUserId: text("owner_user_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    kind: text("kind", { enum: ["channel", "supergroup", "group"] }).notNull(),
    accessHash: text("access_hash"), // null for basic groups
    title: text("title").notNull(),
    username: text("username"),
    isCreator: integer("is_creator", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("chats_owner_telegram_id_unique").on(table.ownerUserId, table.telegramId)]
);

export const botMessages = sqliteTable(
  "bot_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    fromUserId: text("from_user_id"),
    fromUsername: text("from_username"),
    fromFirstName: text("from_first_name"),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    text: text("text"),
    raw: text("raw"), // JSON blob of the full Telegram message object
    telegramMessageId: integer("telegram_message_id"),
    mediaType: text("media_type", { enum: ["photo", "document", "video", "audio", "voice", "sticker", "poll", "other"] }),
    replyToMessageId: integer("reply_to_message_id"), // Telegram message ID of the message this one replies to
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    /** Set for messages that came through a Telegram Business connection (a chat of the business owner, not of the bot). */
    businessConnectionId: text("business_connection_id"),
    /** Set when Telegram reported the message deleted in the business chat; the row is kept as history. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("bot_messages_bot_chat_created_idx").on(table.botId, table.chatId, table.createdAt)]
);

/**
 * Groups/supergroups/channels a bot is (or was) in. The Bot API can't list a bot's chats, so rows come from
 * my_chat_member updates, group messages the poller sees, and the manual "add" / "import" actions.
 * `rights` is the bot's own member record there (JSON of its can_* flags), used to disable actions it can't do.
 */
export const botChats = sqliteTable(
  "bot_chats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    type: text("type", { enum: ["group", "supergroup", "channel"] }).notNull(),
    title: text("title").notNull(),
    username: text("username"),
    status: text("status", { enum: ["member", "administrator", "left", "kicked"] }).notNull(),
    rights: text("rights"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("bot_chats_bot_chat_unique").on(table.botId, table.chatId)]
);

/**
 * Telegram Business accounts that connected this bot (business_connection updates). The Bot API can't list them,
 * so rows come from updates only. `rights` is the JSON of BusinessBotRights.
 */
export const botBusinessConnections = sqliteTable(
  "bot_business_connections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    connectionId: text("connection_id").notNull(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    userChatId: text("user_chat_id").notNull(),
    rights: text("rights"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
    connectedAt: integer("connected_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("bot_business_connections_bot_connection_unique").on(table.botId, table.connectionId)]
);

/**
 * Sticker / custom-emoji sets this bot manages. The Bot API can't list a bot's sets, so rows are the ones created
 * here or imported by name. `name` is the full short name and always ends in `_by_<bot username>`.
 */
export const botStickerSets = sqliteTable(
  "bot_sticker_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    type: text("type", { enum: ["regular", "mask", "custom_emoji"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("bot_sticker_sets_bot_name_unique").on(table.botId, table.name)]
);

export const botUsers = sqliteTable("bot_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  botId: integer("bot_id").notNull(),
  chatId: text("chat_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  /** Set when Telegram says the user blocked the bot (or never started it); cleared when they write again. */
  blockedAt: integer("blocked_at", { mode: "timestamp_ms" }),
  /** The deep-link payload of the first `/start <payload>` that brought this contact (attribution). */
  startPayload: text("start_payload"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** An inline button as stored in JSON columns: a label, an optional colour and exactly one action (see InlineButton). */
export type StoredButton = InlineButton;

/** Rules the poller applies to incoming updates (see lib/auto-replies.ts). `callback` rules answer button presses. */
export const autoReplies = sqliteTable(
  "auto_replies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    matchType: text("match_type", {
      enum: ["command", "exact", "contains", "callback", "callback_prefix", "deeplink", "media", "shared"],
    }).notNull(),
    pattern: text("pattern").notNull(),
    replyText: text("reply_text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    /** JSON ReplyKeyboard (lib/botapi.ts): a reply keyboard / remove / force-reply sent instead of inline buttons. */
    replyKeyboard: text("reply_keyboard"),
    showAlert: integer("show_alert", { mode: "boolean" }).notNull().default(false),
    /** What a pressed-button rule does with its reply: a toast/alert, an edit of the pressed message, or a new message. */
    callbackAction: text("callback_action", { enum: ["toast", "edit", "reply"] }).notNull().default("toast"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    /** How many times the rule fired (bumped when its reply is sent, so a retried update isn't double-counted). */
    hits: integer("hits").notNull().default(0),
    lastHitAt: integer("last_hit_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("auto_replies_bot_idx").on(table.botId)]
);

/** Saved `t.me` deep links of a bot (lib/deep-links.ts). Arrivals are counted from bot_users.start_payload. */
export const botDeepLinks = sqliteTable(
  "bot_deep_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    label: text("label").notNull(),
    kind: text("kind", { enum: ["start", "startgroup", "startchannel", "startapp"] }).notNull(),
    payload: text("payload").notNull(),
    /** `startapp` links of a named Mini App: its short name (t.me/<bot>/<short>?startapp=…). */
    appShortName: text("app_short_name"),
    /** `startgroup` / `startchannel`: comma-separated admin rights requested (the `admin=` parameter). */
    admin: text("admin"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("bot_deep_links_bot_idx").on(table.botId)]
);

/** Reusable inline-keyboard layouts (lib/button-templates.ts). */
export const botButtonTemplates = sqliteTable(
  "bot_button_templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    name: text("name").notNull(),
    buttons: text("buttons").notNull(), // JSON StoredButton[][]
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("bot_button_templates_bot_idx").on(table.botId)]
);

/** HTML5 games created through BotFather (lib/botfather-apps.ts); `url` is what a pressed Play button opens. */
export const botGames = sqliteTable(
  "bot_games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    shortName: text("short_name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("bot_games_bot_short_unique").on(table.botId, table.shortName)]
);

/** Mini Apps created through BotFather /newapp (lib/botfather-apps.ts). */
export const botMiniApps = sqliteTable(
  "bot_mini_apps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    shortName: text("short_name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("bot_mini_apps_bot_short_unique").on(table.botId, table.shortName)]
);

/**
 * Canned results offered when someone types @bot in any chat (lib/inline-results.ts). A query is answered with the
 * enabled rows whose `prefix` it starts with ("" matches every query). `uses` counts chosen results and only moves
 * while inline feedback is on in BotFather.
 */
export const inlineResults = sqliteTable(
  "inline_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    prefix: text("prefix").notNull().default(""),
    title: text("title").notNull(),
    description: text("description"),
    messageText: text("message_text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    uses: integer("uses").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("inline_results_bot_idx").on(table.botId)]
);

/** Messages queued to be sent later by the job loop (lib/jobs.ts). `sending` is the claimed-in-flight state. */
export const scheduledMessages = sqliteTable(
  "scheduled_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    text: text("text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    sendAt: integer("send_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: ["pending", "sending", "sent", "failed", "cancelled"] }).notNull().default("pending"),
    error: text("error"),
    telegramMessageId: integer("telegram_message_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("scheduled_messages_status_send_at_idx").on(table.status, table.sendAt)]
);

/** One message sent to every (unblocked, private) contact of a bot. `cursor` is the last bot_users.id handled. */
export const broadcasts = sqliteTable(
  "broadcasts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    text: text("text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    status: text("status", { enum: ["queued", "running", "done", "cancelled", "failed"] }).notNull().default("queued"),
    total: integer("total").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
    cursor: integer("cursor").notNull().default(0),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("broadcasts_bot_idx").on(table.botId)]
);

/** Pending/handled requests to join a chat that has an approval-required invite link (chat_join_request updates). */
export const botJoinRequests = sqliteTable(
  "bot_join_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    bio: text("bio"),
    status: text("status", { enum: ["pending", "approved", "declined"] }).notNull().default("pending"),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("bot_join_requests_bot_chat_user_unique").on(table.botId, table.chatId, table.userId)]
);
