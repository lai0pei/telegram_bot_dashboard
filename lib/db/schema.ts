import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Singleton row (id always 1) holding the encrypted MTProto session string. */
export const session = sqliteTable("session", {
  id: integer("id").primaryKey(),
  encryptedSessionString: text("encrypted_session_string").notNull(),
  userId: text("user_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const bots = sqliteTable("bots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username").notNull().unique(),
  firstName: text("first_name").notNull(),
  encryptedToken: text("encrypted_token"),
  tokenFetchedAt: integer("token_fetched_at", { mode: "timestamp_ms" }),
  monitorEnabled: integer("monitor_enabled", { mode: "boolean" }).notNull().default(false),
  lastUpdateId: integer("last_update_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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
