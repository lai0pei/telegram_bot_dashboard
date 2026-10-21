import { sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, timestamp, uniqueIndex, index, customType } from "drizzle-orm/pg-core";
import type { InlineButton } from "../botapi";

/** Raw bytes (a Node Buffer both ways with postgres-js). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * A dashboard account. Can be linked to multiple Telegram accounts (see
 * telegramAccounts). Sign-in is a Telegram QR scan, not a password — a
 * dashboard user is created automatically the first time an unrecognized
 * Telegram account signs in (lib/mtproto.ts finishLogin), so `username` is
 * just a display name (its Telegram @username or name), not unique or used
 * to authenticate.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  /** Last authenticated request (throttled to one write per few minutes, see touchLastActive in lib/users.ts). Shown to the master admin as "last seen". */
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  /** Set by the master admin: the user can't sign in or use the API, and their bots stop polling and sending (lib/suspension.ts). */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * What the master admin did to whom (lib/admin-actions.ts), written in the same
 * transaction as the action itself. `targetName` is a copy of the user's display
 * name because the row outlives a deleted user; there is deliberately no way to
 * edit or delete these rows from the dashboard.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    adminUserId: text("admin_user_id").notNull(),
    action: text("action", { enum: ["sign_out", "suspend", "unsuspend", "delete_user", "update_access"] }).notNull(),
    /** The user acted on; for `update_access` (no user involved) the admin's own ID, with `targetName` "Access settings". */
    targetUserId: text("target_user_id").notNull(),
    targetName: text("target_name").notNull(),
    /** Human-readable summary, e.g. what a delete removed. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("admin_actions_created_idx").on(table.createdAt)]
);

/**
 * Settings the master admin edits from the dashboard (lib/app-settings.ts). A
 * row here overrides the matching environment variable; deleting the row
 * ("Reset to .env") falls back to it. `value` is plain text or JSON per key.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Server and browser errors, one row per distinct problem (lib/error-log.ts).
 * Repeats of the same fingerprint bump `count` instead of adding rows, and
 * reopen the row if it was marked resolved. Everything stored has been
 * scrubbed of secrets first, because the admin exports this to an LLM.
 */
export const appErrors = pgTable(
  "app_errors",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    fingerprint: text("fingerprint").notNull(),
    /** Where it came from: api, request, poller, jobs, broadcast, auto-reply, health, digest, inline, limits, effects, client. */
    source: text("source").notNull(),
    /** What was being attempted, e.g. "bot foo getUpdates failed". */
    what: text("what").notNull(),
    errorName: text("error_name").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    /** JSON object of small, non-sensitive facts (bot id, route, ...). */
    context: text("context"),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("app_errors_fingerprint_unique").on(table.fingerprint),
    index("app_errors_last_seen_idx").on(table.lastSeenAt),
  ]
);

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
export const telegramAccounts = pgTable(
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
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** "off" (default) | "daily" | "weekly" — whether lib/digest.ts sends a Saved Messages summary for this account. */
    digestFrequency: text("digest_frequency", { enum: ["off", "daily", "weekly"] })
      .notNull()
      .default("off"),
    /** Hour of day (0-23, UTC) the digest should go out. */
    digestHour: integer("digest_hour").notNull().default(9),
    lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("telegram_accounts_telegram_id_unique").on(table.telegramId)]
);

export const bots = pgTable(
  "bots",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerUserId: text("owner_user_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    username: text("username").notNull(),
    firstName: text("first_name").notNull(),
    /**
     * "owned": listed by Telegram as administered by the linked account (synced, token healed through BotFather).
     * "token": added by pasting someone else's bot token; the account has no BotFather relationship with it, so the
     * list sync never prunes it and a dead token is reported, never re-fetched.
     */
    source: text("source", { enum: ["owned", "token"] }).notNull().default("owned"),
    encryptedToken: text("encrypted_token"),
    tokenFetchedAt: timestamp("token_fetched_at", { withTimezone: true }),
    monitorEnabled: boolean("monitor_enabled").notNull().default(false),
    lastUpdateId: integer("last_update_id"),
    /** Result of the last background health check (lib/health.ts); null until the first check. */
    healthStatus: text("health_status", { enum: ["ok", "warning", "error"] }),
    healthMessage: text("health_message"),
    healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
    /** Set by the poller after each getUpdates cycle that includes this bot, success or failure. Used to detect a stalled poller. */
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    /** Error message from the most recent failed getUpdates call for this bot; cleared on the next success. */
    pollError: text("poll_error"),
    /** Name of another dashboard that holds this bot's claim (lib/bot-claims.ts); this one stays on standby. Null = runs here. */
    runElsewhere: text("run_elsewhere"),
    /** Cached from the bot's getWebhookInfo, refreshed opportunistically (webhook tab load, overview load). Null when there's no webhook or no error. */
    webhookLastError: text("webhook_last_error"),
    webhookPendingCount: integer("webhook_pending_count"),
    /** JSON of the setup facts learned so far (lib/setup-progress.ts), shown as "n/6" on the bot cards. Cache only: the bot page recomputes it. */
    setupProgress: text("setup_progress"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("bots_owner_telegram_id_unique").on(table.ownerUserId, table.telegramId),
    uniqueIndex("bots_owner_username_unique").on(table.ownerUserId, table.username),
    // One account per bot, across all accounts: two pollers on one token fight over getUpdates (409) and one
    // tenant's setWebhook would silently break the other's monitoring.
    uniqueIndex("bots_telegram_id_unique").on(table.telegramId),
  ]
);

/**
 * Local mirror of the channels/groups a user owns or admins, synced from
 * their dialogs. Mainly exists to keep each channel's access hash, which
 * every channel API call needs and the session string doesn't persist.
 */
export const chats = pgTable(
  "chats",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerUserId: text("owner_user_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    kind: text("kind", { enum: ["channel", "supergroup", "group"] }).notNull(),
    accessHash: text("access_hash"), // null for basic groups
    title: text("title").notNull(),
    username: text("username"),
    isCreator: boolean("is_creator").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("chats_owner_telegram_id_unique").on(table.ownerUserId, table.telegramId)]
);

export const botMessages = pgTable(
  "bot_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
    editedAt: timestamp("edited_at", { withTimezone: true }),
    pinned: boolean("pinned").notNull().default(false),
    /** Set for messages that came through a Telegram Business connection (a chat of the business owner, not of the bot). */
    businessConnectionId: text("business_connection_id"),
    /** Set when Telegram reported the message deleted in the business chat; the row is kept as history. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("bot_messages_bot_chat_created_idx").on(table.botId, table.chatId, table.createdAt)]
);

/**
 * Groups/supergroups/channels a bot is (or was) in. The Bot API can't list a bot's chats, so rows come from
 * my_chat_member updates, group messages the poller sees, and the manual "add" / "import" actions.
 * `rights` is the bot's own member record there (JSON of its can_* flags), used to disable actions it can't do.
 */
export const botChats = pgTable(
  "bot_chats",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    type: text("type", { enum: ["group", "supergroup", "channel"] }).notNull(),
    title: text("title").notNull(),
    username: text("username"),
    status: text("status", { enum: ["member", "administrator", "left", "kicked"] }).notNull(),
    rights: text("rights"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("bot_chats_bot_chat_unique").on(table.botId, table.chatId)]
);

/**
 * Telegram Business accounts that connected this bot (business_connection updates). The Bot API can't list them,
 * so rows come from updates only. `rights` is the JSON of BusinessBotRights.
 */
export const botBusinessConnections = pgTable(
  "bot_business_connections",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    connectionId: text("connection_id").notNull(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    userChatId: text("user_chat_id").notNull(),
    rights: text("rights"),
    isEnabled: boolean("is_enabled").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("bot_business_connections_bot_connection_unique").on(table.botId, table.connectionId)]
);

export const botUsers = pgTable("bot_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  botId: integer("bot_id").notNull(),
  chatId: text("chat_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  /** Set when Telegram says the user blocked the bot (or never started it); cleared when they write again. */
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  /** The deep-link payload of the first `/start <payload>` that brought this contact (attribution). */
  startPayload: text("start_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** An inline button as stored in JSON columns: a label, an optional colour and exactly one action (see InlineButton). */
export type StoredButton = InlineButton;

/** Rules the poller applies to incoming updates (see lib/auto-replies.ts). `callback` rules answer button presses. */
export const autoReplies = pgTable(
  "auto_replies",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    matchType: text("match_type", {
      enum: ["command", "exact", "contains", "callback", "callback_prefix", "deeplink", "media", "shared", "fallback"],
    }).notNull(),
    pattern: text("pattern").notNull(),
    replyText: text("reply_text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    /** JSON ReplyKeyboard (lib/botapi.ts): a reply keyboard / remove / force-reply sent instead of inline buttons. */
    replyKeyboard: text("reply_keyboard"),
    /** JSON RuleMediaRef (lib/rule-content.ts): a file attached to the main message; `reply_text` is then its caption. */
    media: text("media"),
    /** JSON FollowUp[] (lib/rule-content.ts): up to 4 messages sent after the main one. */
    followUps: text("follow_ups"),
    showAlert: boolean("show_alert").notNull().default(false),
    /** What a pressed-button rule does with its reply: a toast/alert, an edit of the pressed message, or a new message. */
    callbackAction: text("callback_action", { enum: ["toast", "edit", "reply"] }).notNull().default("toast"),
    enabled: boolean("enabled").notNull().default(true),
    position: integer("position").notNull().default(0),
    /** How many times the rule fired (bumped when its reply is sent, so a retried update isn't double-counted). */
    hits: integer("hits").notNull().default(0),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("auto_replies_bot_idx").on(table.botId),
    // A bot has at most one "Anything else" rule; enforced here so concurrent creates can't both pass the app-level check.
    uniqueIndex("auto_replies_one_fallback_unique")
      .on(table.botId)
      .where(sql`${table.matchType} = 'fallback'`),
  ]
);

/**
 * Files attached to auto-reply rules (lib/rule-media.ts), per bot because a Telegram `file_id` only works for the bot
 * that received the upload. The bytes stay here; `file_id` is filled after the first send so later sends upload nothing.
 */
export const ruleMedia = pgTable(
  "rule_media",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    kind: text("kind", { enum: ["photo", "video", "animation", "document", "audio", "voice", "sticker"] }).notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    fileId: text("file_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rule_media_bot_idx").on(table.botId)]
);

/** Saved `t.me` deep links of a bot (lib/deep-links.ts). Arrivals are counted from bot_users.start_payload. */
export const botDeepLinks = pgTable(
  "bot_deep_links",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    label: text("label").notNull(),
    kind: text("kind", { enum: ["start", "startgroup", "startchannel", "startapp"] }).notNull(),
    payload: text("payload").notNull(),
    /** `startapp` links of a named Mini App: its short name (t.me/<bot>/<short>?startapp=…). */
    appShortName: text("app_short_name"),
    /** `startgroup` / `startchannel`: comma-separated admin rights requested (the `admin=` parameter). */
    admin: text("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("bot_deep_links_bot_idx").on(table.botId)]
);

/** Reusable inline-keyboard layouts (lib/button-templates.ts). */
export const botButtonTemplates = pgTable(
  "bot_button_templates",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    name: text("name").notNull(),
    buttons: text("buttons").notNull(), // JSON StoredButton[][]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("bot_button_templates_bot_idx").on(table.botId)]
);

/** HTML5 games created through BotFather (lib/botfather-apps.ts); `url` is what a pressed Play button opens. */
export const botGames = pgTable(
  "bot_games",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    shortName: text("short_name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("bot_games_bot_short_unique").on(table.botId, table.shortName)]
);

/** Mini Apps created through BotFather /newapp (lib/botfather-apps.ts). */
export const botMiniApps = pgTable(
  "bot_mini_apps",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    shortName: text("short_name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("bot_mini_apps_bot_short_unique").on(table.botId, table.shortName)]
);

/**
 * Canned results offered when someone types @bot in any chat (lib/inline-results.ts). A query is answered with the
 * enabled rows whose `prefix` it starts with ("" matches every query). `uses` counts chosen results and only moves
 * while inline feedback is on in BotFather.
 */
export const inlineResults = pgTable(
  "inline_results",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    prefix: text("prefix").notNull().default(""),
    title: text("title").notNull(),
    description: text("description"),
    messageText: text("message_text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    uses: integer("uses").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("inline_results_bot_idx").on(table.botId)]
);

/** Messages queued to be sent later by the job loop (lib/jobs.ts). `sending` is the claimed-in-flight state. */
export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    text: text("text").notNull(),
    parseMode: text("parse_mode", { enum: ["HTML", "MarkdownV2"] }),
    buttons: text("buttons"), // JSON StoredButton[][]
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["pending", "sending", "sent", "failed", "cancelled"] }).notNull().default("pending"),
    error: text("error"),
    telegramMessageId: integer("telegram_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("scheduled_messages_status_send_at_idx").on(table.status, table.sendAt)]
);

/** One message sent to every (unblocked, private) contact of a bot. `cursor` is the last bot_users.id handled. */
export const broadcasts = pgTable(
  "broadcasts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("broadcasts_bot_idx").on(table.botId),
    // At most one queued/running broadcast per bot, enforced by the database rather than by a check-then-insert.
    uniqueIndex("broadcasts_one_active_unique")
      .on(table.botId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ]
);

/** Pending/handled requests to join a chat that has an approval-required invite link (chat_join_request updates). */
export const botJoinRequests = pgTable(
  "bot_join_requests",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    botId: integer("bot_id").notNull(),
    chatId: text("chat_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    bio: text("bio"),
    status: text("status", { enum: ["pending", "approved", "declined"] }).notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("bot_join_requests_bot_chat_user_unique").on(table.botId, table.chatId, table.userId)]
);

/**
 * One row per (account, day, metric, bot), written once a day by
 * lib/stats.ts so the overview can show a trend ("+12 this week") instead of
 * only a point-in-time total. `day` is a UTC "YYYY-MM-DD" string so it sorts
 * and dedupes as plain text. `botId` is null for account-wide metrics.
 */
export const dailyStats = pgTable(
  "daily_stats",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    telegramAccountId: text("telegram_account_id").notNull(),
    day: text("day").notNull(),
    metric: text("metric", { enum: ["bot_users_new", "bot_messages_in"] }).notNull(),
    botId: integer("bot_id"),
    value: integer("value").notNull(),
  },
  (table) => [
    uniqueIndex("daily_stats_unique").on(table.telegramAccountId, table.day, table.metric, table.botId),
  ]
);

/** Templates a dashboard user saved from one of their bots (lib/custom-templates.ts); `content` is JSON `{ profile?, commands, rules }`. */
export const customTemplates = pgTable(
  "custom_templates",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerUserId: text("owner_user_id").notNull(), // users.id (not a telegram_accounts.id: usable on every linked account)
    title: text("title").notNull(),
    emoji: text("emoji").notNull(),
    blurb: text("blurb").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("custom_templates_owner_idx").on(table.ownerUserId)]
);
