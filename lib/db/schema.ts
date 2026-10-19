import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    /** "off" (default) | "daily" | "weekly" — whether lib/digest.ts sends a Saved Messages summary for this account. */
    digestFrequency: text("digest_frequency", { enum: ["off", "daily", "weekly"] })
      .notNull()
      .default("off"),
    /** Hour of day (0-23, UTC) the digest should go out. */
    digestHour: integer("digest_hour").notNull().default(9),
    lastDigestAt: integer("last_digest_at", { mode: "timestamp_ms" }),
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
    /** Set by the poller after each getUpdates cycle that includes this bot, success or failure. Used to detect a stalled poller. */
    lastPolledAt: integer("last_polled_at", { mode: "timestamp_ms" }),
    /** Error message from the most recent failed getUpdates call for this bot; cleared on the next success. */
    pollError: text("poll_error"),
    /** Cached from the bot's getWebhookInfo, refreshed opportunistically (webhook tab load, overview load). Null when there's no webhook or no error. */
    webhookLastError: text("webhook_last_error"),
    webhookPendingCount: integer("webhook_pending_count"),
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

export const botMessages = sqliteTable("bot_messages", {
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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const botUsers = sqliteTable("bot_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  botId: integer("bot_id").notNull(),
  chatId: text("chat_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * One row per (account, day, metric, bot), written once a day by
 * lib/stats.ts so the overview can show a trend ("+12 this week") instead of
 * only a point-in-time total. `day` is a UTC "YYYY-MM-DD" string so it sorts
 * and dedupes as plain text. `botId` is null for account-wide metrics.
 */
export const dailyStats = sqliteTable(
  "daily_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
