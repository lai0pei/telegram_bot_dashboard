import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

/** One row per logged-in Telegram user, keyed by their Telegram user ID. */
export const session = sqliteTable("session", {
  userId: text("user_id").primaryKey(),
  encryptedSessionString: text("encrypted_session_string").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("bots_owner_telegram_id_unique").on(table.ownerUserId, table.telegramId),
    uniqueIndex("bots_owner_username_unique").on(table.ownerUserId, table.username),
  ]
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
