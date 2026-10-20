import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "./db";
import { botMessages, botUsers, bots, dailyStats } from "./db/schema";

/** UTC "YYYY-MM-DD" for a given instant, used as the dedup key for a day's snapshot. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Writes today's per-bot counters (new bot users, incoming messages) into
 * daily_stats, so the overview can show a trend instead of a point-in-time
 * total. Idempotent: re-running for the same day overwrites that day's row
 * via the unique (account, day, metric, bot) index, so calling it again
 * after a restart doesn't double-count.
 */
export async function snapshotDailyStats(): Promise<void> {
  const now = new Date();
  const day = utcDay(now);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const allBots = await db.select().from(bots);
  for (const bot of allBots) {
    const newUsers =
      (await db
        .select()
        .from(botUsers)
        .where(and(eq(botUsers.botId, bot.id), gte(botUsers.createdAt, dayStart), lt(botUsers.createdAt, dayEnd)))).length;

    const messagesIn =
      (await db
        .select()
        .from(botMessages)
        .where(
          and(
            eq(botMessages.botId, bot.id),
            eq(botMessages.direction, "in"),
            gte(botMessages.createdAt, dayStart),
            lt(botMessages.createdAt, dayEnd)
          )
        )).length;

    await upsertDailyStat(bot.ownerUserId, day, "bot_users_new", bot.id, newUsers);
    await upsertDailyStat(bot.ownerUserId, day, "bot_messages_in", bot.id, messagesIn);
  }
}

async function upsertDailyStat(
  telegramAccountId: string,
  day: string,
  metric: "bot_users_new" | "bot_messages_in",
  botId: number,
  value: number
): Promise<void> {
  await db.insert(dailyStats)
    .values({ telegramAccountId, day, metric, botId, value })
    .onConflictDoUpdate({
      target: [dailyStats.telegramAccountId, dailyStats.day, dailyStats.metric, dailyStats.botId],
      set: { value },
    });
}

export interface TrendPoint {
  day: string;
  botUsersNew: number;
  botMessagesIn: number;
}

/** Last `days` days of account-wide totals (summed across the account's bots), oldest first, for a sparkline. */
export async function getTrend(telegramAccountId: string, days: number): Promise<TrendPoint[]> {
  const rows = await db.select().from(dailyStats).where(eq(dailyStats.telegramAccountId, telegramAccountId));

  const byDay = new Map<string, TrendPoint>();
  for (const row of rows) {
    const point = byDay.get(row.day) ?? { day: row.day, botUsersNew: 0, botMessagesIn: 0 };
    if (row.metric === "bot_users_new") point.botUsersNew += row.value;
    else point.botMessagesIn += row.value;
    byDay.set(row.day, point);
  }

  const today = new Date();
  const result: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = utcDay(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
    result.push(byDay.get(d) ?? { day: d, botUsersNew: 0, botMessagesIn: 0 });
  }
  return result;
}
