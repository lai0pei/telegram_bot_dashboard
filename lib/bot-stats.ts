import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { botChats, botMessages, botUsers } from "./db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_DAYS = 14;

export interface BotStats {
  users: { total: number; newLast7d: number; activeLast7d: number };
  messages: { incoming: number; outgoing: number; activeChatsLast7d: number };
  chats: { members: number; administrator: number };
  /** Oldest first, one entry per UTC day, zero-filled. */
  perDay: { date: string; incoming: number; outgoing: number }[];
}

/** Aggregates over the local mirror only (bot_users, bot_messages, bot_chats). Callers must scope `botId` to the owner. */
export async function getBotStats(botId: number, now = Date.now()): Promise<BotStats> {
  const weekAgo = new Date(now - 7 * DAY_MS);

  // bot_users has no unique index, so count distinct chats rather than rows.
  const users = (await db
    .select({
      total: sql<number>`count(distinct ${botUsers.chatId})::int`,
      newLast7d: sql<number>`count(distinct case when ${botUsers.createdAt} >= ${weekAgo.toISOString()}::timestamptz then ${botUsers.chatId} end)::int`,
      activeLast7d: sql<number>`count(distinct case when ${botUsers.lastSeenAt} >= ${weekAgo.toISOString()}::timestamptz then ${botUsers.chatId} end)::int`,
    })
    .from(botUsers)
    .where(eq(botUsers.botId, botId)))[0];

  const totals = (await db
    .select({
      incoming: sql<number>`coalesce(sum(case when ${botMessages.direction} = 'in' then 1 else 0 end), 0)::int`,
      outgoing: sql<number>`coalesce(sum(case when ${botMessages.direction} = 'out' then 1 else 0 end), 0)::int`,
    })
    .from(botMessages)
    .where(eq(botMessages.botId, botId)))[0];

  const activeChats = (await db
    .select({ n: sql<number>`count(distinct ${botMessages.chatId})::int` })
    .from(botMessages)
    .where(and(eq(botMessages.botId, botId), gte(botMessages.createdAt, weekAgo))))[0];

  const chatCounts = await db
    .select({ status: botChats.status, n: sql<number>`count(*)::int` })
    .from(botChats)
    .where(eq(botChats.botId, botId))
    .groupBy(botChats.status);

  // Day buckets are UTC so the chart doesn't shift with the server's timezone.
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const start = today - (CHART_DAYS - 1) * DAY_MS;
  const rows = await db
    .select({
      date: sql<string>`to_char(${botMessages.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      direction: botMessages.direction,
      n: sql<number>`count(*)::int`,
    })
    .from(botMessages)
    .where(and(eq(botMessages.botId, botId), gte(botMessages.createdAt, new Date(start))))
    .groupBy(sql`1`, botMessages.direction);

  const perDay = Array.from({ length: CHART_DAYS }, (_, i) => ({
    date: new Date(start + i * DAY_MS).toISOString().slice(0, 10),
    incoming: 0,
    outgoing: 0,
  }));
  for (const row of rows) {
    const day = perDay.find((d) => d.date === row.date);
    if (day) day[row.direction === "in" ? "incoming" : "outgoing"] = row.n;
  }

  const countFor = (status: string) => chatCounts.find((c) => c.status === status)?.n ?? 0;
  return {
    users: users,
    messages: { incoming: totals.incoming, outgoing: totals.outgoing, activeChatsLast7d: activeChats.n },
    chats: { members: countFor("member"), administrator: countFor("administrator") },
    perDay,
  };
}
