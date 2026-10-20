import { and, eq, sql } from "drizzle-orm";
import type { TelegramChatJoinRequest } from "./botapi";
import { db } from "./db";
import { botJoinRequests } from "./db/schema";

export type JoinRequestRow = typeof botJoinRequests.$inferSelect;

/** Records (or re-opens, if the user asks again) a join request from a chat_join_request update. */
export function recordJoinRequest(botId: number, request: TelegramChatJoinRequest): void {
  const values = {
    username: request.from.username ?? null,
    firstName: request.from.first_name,
    bio: request.bio ?? null,
    status: "pending" as const,
    requestedAt: new Date(request.date * 1000),
  };
  db.insert(botJoinRequests)
    .values({ botId, chatId: String(request.chat.id), userId: String(request.from.id), ...values })
    .onConflictDoUpdate({ target: [botJoinRequests.botId, botJoinRequests.chatId, botJoinRequests.userId], set: values })
    .run();
}

export function listPendingJoinRequests(botId: number, chatId: string): JoinRequestRow[] {
  return db
    .select()
    .from(botJoinRequests)
    .where(and(eq(botJoinRequests.botId, botId), eq(botJoinRequests.chatId, chatId), eq(botJoinRequests.status, "pending")))
    .orderBy(botJoinRequests.requestedAt)
    .all();
}

export function setJoinRequestStatus(botId: number, chatId: string, userId: string, status: "approved" | "declined"): void {
  db.update(botJoinRequests)
    .set({ status })
    .where(and(eq(botJoinRequests.botId, botId), eq(botJoinRequests.chatId, chatId), eq(botJoinRequests.userId, userId)))
    .run();
}

/** Pending request counts per chat for a bot (shown as badges on the Chats tab). */
export function pendingJoinRequestCounts(botId: number): Record<string, number> {
  const rows = db
    .select({ chatId: botJoinRequests.chatId, n: sql<number>`count(*)` })
    .from(botJoinRequests)
    .where(and(eq(botJoinRequests.botId, botId), eq(botJoinRequests.status, "pending")))
    .groupBy(botJoinRequests.chatId)
    .all();
  return Object.fromEntries(rows.map((r) => [r.chatId, r.n]));
}
