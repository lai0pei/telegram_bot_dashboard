import { and, count, eq, gt, inArray } from "drizzle-orm";
import { db } from "./db";
import { botMessages, botUsers, bots, chats } from "./db/schema";
import { getTrend, type TrendPoint } from "./stats";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;

export interface OverviewStats {
  bots: number;
  monitoredBots: number;
  channels: number;
  groups: number;
  botUsers: number;
  messagesToday: number;
  /** Bots whose last health check found a problem (see lib/health.ts). */
  botsNeedingAttention: number;
  /** Daily new-user and incoming-message counts for the tile sparklines (lib/stats.ts). */
  trend: TrendPoint[];
}

/**
 * Dashboard overview numbers for one Telegram account, read from the local
 * mirror only (no MTProto/Bot API calls), so the overview stays instant. Bot
 * and chat counts reflect the last sync — the Bots and Channels pages sync on
 * load.
 */
export function getOverviewStats(telegramAccountId: string): OverviewStats {
  const ownBots = db
    .select({ id: bots.id, username: bots.username, monitorEnabled: bots.monitorEnabled, healthStatus: bots.healthStatus })
    .from(bots)
    .where(eq(bots.ownerUserId, telegramAccountId))
    .all();
  const botIds = ownBots.map((b) => b.id);

  const chatRows = db.select({ kind: chats.kind }).from(chats).where(eq(chats.ownerUserId, telegramAccountId)).all();

  let botUserCount = 0;
  let messagesToday = 0;
  if (botIds.length > 0) {
    botUserCount = db.select({ n: count() }).from(botUsers).where(inArray(botUsers.botId, botIds)).all()[0]?.n ?? 0;
    messagesToday =
      db
        .select({ n: count() })
        .from(botMessages)
        .where(
          and(
            inArray(botMessages.botId, botIds),
            eq(botMessages.direction, "in"),
            gt(botMessages.createdAt, new Date(Date.now() - DAY_MS))
          )
        )
        .all()[0]?.n ?? 0;
  }

  return {
    bots: ownBots.length,
    monitoredBots: ownBots.filter((b) => b.monitorEnabled).length,
    channels: chatRows.filter((c) => c.kind === "channel").length,
    groups: chatRows.filter((c) => c.kind !== "channel").length,
    botUsers: botUserCount,
    messagesToday,
    botsNeedingAttention: ownBots.filter((b) => b.healthStatus === "warning" || b.healthStatus === "error").length,
    trend: getTrend(telegramAccountId, TREND_DAYS),
  };
}
