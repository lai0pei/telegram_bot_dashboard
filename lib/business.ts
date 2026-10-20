import { and, eq, inArray } from "drizzle-orm";
import type { BusinessBotRights, BusinessConnection } from "./botapi";
import { db } from "./db";
import { botBusinessConnections, botMessages } from "./db/schema";

export type BusinessConnectionRow = typeof botBusinessConnections.$inferSelect;

export function parseBusinessRights(row: Pick<BusinessConnectionRow, "rights">): BusinessBotRights {
  if (!row.rights) return {};
  try {
    return JSON.parse(row.rights) as BusinessBotRights;
  } catch {
    return {};
  }
}

export function toBusinessConnectionDto(row: BusinessConnectionRow) {
  return {
    connectionId: row.connectionId,
    userId: row.userId,
    userName: row.userName,
    userChatId: row.userChatId,
    rights: parseBusinessRights(row),
    isEnabled: row.isEnabled,
    connectedAt: row.connectedAt,
  };
}

export async function listBusinessConnections(botId: number): Promise<BusinessConnectionRow[]> {
  return await db.select().from(botBusinessConnections).where(eq(botBusinessConnections.botId, botId));
}

/** Scoped to the bot, so another bot's connection ID returns undefined. */
export async function getBusinessConnection(botId: number, connectionId: string): Promise<BusinessConnectionRow | undefined> {
  return (await db
    .select()
    .from(botBusinessConnections)
    .where(and(eq(botBusinessConnections.botId, botId), eq(botBusinessConnections.connectionId, connectionId))))[0];
}

/** A business_connection update: a new connection, or an existing one enabled/disabled/with changed rights. */
export async function upsertBusinessConnection(botId: number, c: BusinessConnection): Promise<void> {
  const now = new Date();
  const values = {
    userId: String(c.user.id),
    userName: [c.user.first_name, c.user.last_name].filter(Boolean).join(" ") || (c.user.username ? `@${c.user.username}` : String(c.user.id)),
    userChatId: String(c.user_chat_id),
    rights: c.rights ? JSON.stringify(c.rights) : null,
    isEnabled: c.is_enabled,
    connectedAt: new Date(c.date * 1000),
    updatedAt: now,
  };
  await db.insert(botBusinessConnections)
    .values({ botId, connectionId: c.id, ...values })
    .onConflictDoUpdate({ target: [botBusinessConnections.botId, botBusinessConnections.connectionId], set: values });
}

/** Keeps the rows as history but marks them deleted. Scoped by connection and chat: message IDs repeat across chats. */
export async function markBusinessMessagesDeleted(botId: number, connectionId: string, chatId: string, messageIds: number[]): Promise<void> {
  if (!messageIds.length) return;
  await db.update(botMessages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(botMessages.botId, botId),
        eq(botMessages.businessConnectionId, connectionId),
        eq(botMessages.chatId, chatId),
        inArray(botMessages.telegramMessageId, messageIds)
      )
    );
}
