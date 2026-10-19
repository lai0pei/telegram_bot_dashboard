import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "./db";
import { botMessages, botUsers, bots, chats } from "./db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OverviewStats {
  bots: number;
  monitoredBots: number;
  channels: number;
  groups: number;
  botUsers: number;
  messagesToday: number;
  recentMessages: {
    id: number;
    botId: number;
    botUsername: string;
    fromName: string;
    text: string | null;
    createdAt: number;
  }[];
}

/**
 * Dashboard overview numbers for one Telegram account, read from the local
 * mirror only (no MTProto/Bot API calls), so the overview stays instant. Bot
 * and chat counts reflect the last sync — the Bots and Channels pages sync on
 * load.
 */
export function getOverviewStats(telegramAccountId: string): OverviewStats {
  const ownBots = db
    .select({ id: bots.id, username: bots.username, monitorEnabled: bots.monitorEnabled })
    .from(bots)
    .where(eq(bots.ownerUserId, telegramAccountId))
    .all();
  const botIds = ownBots.map((b) => b.id);

  const chatRows = db.select({ kind: chats.kind }).from(chats).where(eq(chats.ownerUserId, telegramAccountId)).all();

  let botUserCount = 0;
  let messagesToday = 0;
  let recentMessages: OverviewStats["recentMessages"] = [];
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

    const usernames = new Map(ownBots.map((b) => [b.id, b.username]));
    recentMessages = db
      .select()
      .from(botMessages)
      .where(and(inArray(botMessages.botId, botIds), eq(botMessages.direction, "in")))
      .orderBy(desc(botMessages.createdAt))
      .limit(8)
      .all()
      .map((m) => ({
        id: m.id,
        botId: m.botId,
        botUsername: usernames.get(m.botId) ?? "",
        fromName: m.fromFirstName || (m.fromUsername ? `@${m.fromUsername}` : m.chatId),
        text: m.text,
        createdAt: m.createdAt.getTime(),
      }));
  }

  return {
    bots: ownBots.length,
    monitoredBots: ownBots.filter((b) => b.monitorEnabled).length,
    channels: chatRows.filter((c) => c.kind === "channel").length,
    groups: chatRows.filter((c) => c.kind !== "channel").length,
    botUsers: botUserCount,
    messagesToday,
    recentMessages,
  };
}
