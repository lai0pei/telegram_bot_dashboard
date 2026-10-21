import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { bots } from "./db/schema";
import { listTelegramAccountsForUser } from "./telegram-accounts";

/** The poller's long-poll timeout plus slack; past this, a monitored bot's lastPolledAt is "stale". */
const POLLER_STALE_MS = 10 * 60 * 1000;
/** How stale a healed-token cooldown window roughly is; a bot with no token at all is always surfaced. */
const UNANSWERED_LIMIT = 20;

export type AttentionItem = {
  kind: "session_revoked" | "bot_no_token" | "bot_webhook_error" | "bot_poller_stalled" | "unanswered";
  accountId: string;
  accountLabel: string;
  botId?: number;
  botUsername?: string;
  title: string;
  detail: string;
  href: string;
  since: number;
};

/**
 * Everything across all of the dashboard user's linked Telegram accounts
 * that plausibly needs the user's attention right now: revoked sessions,
 * bots with no usable token, webhook errors, a monitored bot whose poller
 * has gone quiet, and conversations waiting on a reply. Read-only, local DB
 * only (webhookLastError/webhookPendingCount are populated separately, by
 * whichever request last fetched that bot's getWebhookInfo).
 */
export async function getAttentionItems(dashboardUserId: string): Promise<AttentionItem[]> {
  const accounts = await listTelegramAccountsForUser(dashboardUserId);
  const items: AttentionItem[] = [];

  for (const account of accounts) {
    const label = account.username ? `@${account.username}` : account.firstName || account.phone || "Account";

    if (account.revokedAt) {
      items.push({
        kind: "session_revoked",
        accountId: account.id,
        accountLabel: label,
        title: `${label}: Telegram session ended`,
        detail: "Scan a QR code to link it again.",
        href: "/telegram-accounts",
        since: account.revokedAt.getTime(),
      });
      continue; // bots/chats under a revoked account aren't actionable until it's relinked
    }

    const accountBots = await db.select().from(bots).where(eq(bots.ownerUserId, account.id));

    for (const bot of accountBots) {
      const botHref = `/bots/${bot.id}`;

      if (!bot.encryptedToken) {
        items.push({
          kind: "bot_no_token",
          accountId: account.id,
          accountLabel: label,
          botId: bot.id,
          botUsername: bot.username,
          title: `@${bot.username}: no token stored`,
          detail: bot.source === "token" ? "Open the bot and paste its current token." : "Open the bot to fetch its token from BotFather.",
          href: botHref,
          since: bot.updatedAt.getTime(),
        });
      }

      if (bot.webhookLastError) {
        items.push({
          kind: "bot_webhook_error",
          accountId: account.id,
          accountLabel: label,
          botId: bot.id,
          botUsername: bot.username,
          title: `@${bot.username}: webhook error`,
          detail:
            bot.webhookLastError +
            (bot.webhookPendingCount ? ` (${bot.webhookPendingCount} update(s) pending)` : ""),
          href: `${botHref}?tab=webhook`,
          since: bot.updatedAt.getTime(),
        });
      }

      // A bot on standby (another dashboard runs it, lib/bot-claims.ts) doesn't poll on purpose; its page says so.
      if (bot.monitorEnabled && bot.encryptedToken && !bot.runElsewhere) {
        const stale = !bot.lastPolledAt || Date.now() - bot.lastPolledAt.getTime() > POLLER_STALE_MS;
        if (stale || bot.pollError) {
          items.push({
            kind: "bot_poller_stalled",
            accountId: account.id,
            accountLabel: label,
            botId: bot.id,
            botUsername: bot.username,
            title: `@${bot.username}: monitoring isn't updating`,
            detail: bot.pollError ?? "No successful poll in the last 10 minutes.",
            href: `${botHref}?tab=messages`,
            since: (bot.lastPolledAt ?? bot.updatedAt).getTime(),
          });
        }
      }
    }

    for (const row of await unansweredConversations(account.id, accountBots)) {
      items.push({ ...row, accountLabel: label });
    }
  }

  return items.sort((a, b) => a.since - b.since);
}

type BotLite = Pick<(typeof bots)["$inferSelect"], "id" | "username">;

/**
 * Bot/chat pairs whose newest message is incoming with no outgoing reply
 * after it — i.e. still waiting on the owner. One row per pair, oldest wait
 * first, capped at UNANSWERED_LIMIT across the account's bots.
 */
async function unansweredConversations(accountId: string, accountBots: BotLite[]): Promise<Omit<AttentionItem, "accountLabel">[]> {
  const botIds = accountBots.map((b) => b.id);
  if (botIds.length === 0) return [];
  const usernames = new Map(accountBots.map((b) => [b.id, b.username]));
  const botIdList = sql.join(botIds.map((id) => sql`${id}`), sql`, `);

  // Latest message per (botId, chatId), kept only when that latest message
  // is incoming — i.e. nothing was sent back after it.
  const rows = await db.execute<{
    botId: number;
    chatId: string;
    createdAt: number; // epoch ms: raw execute() returns timestamps as strings, so convert in SQL
    fromFirstName: string | null;
    fromUsername: string | null;
  }>(sql`
    SELECT bm.bot_id AS "botId", bm.chat_id AS "chatId", bm.direction, (floor(extract(epoch FROM bm.created_at) * 1000))::float8 AS "createdAt",
           bm.from_first_name AS "fromFirstName", bm.from_username AS "fromUsername"
    FROM bot_messages bm
    WHERE bm.id IN (
      SELECT MAX(id) FROM bot_messages WHERE bot_id IN (${botIdList}) GROUP BY bot_id, chat_id
    )
    AND bm.direction = 'in'
    ORDER BY bm.created_at ASC
    LIMIT ${UNANSWERED_LIMIT}`);

  return rows.map((row) => ({
    kind: "unanswered" as const,
    accountId,
    botId: row.botId,
    botUsername: usernames.get(row.botId),
    title: `@${usernames.get(row.botId)}: waiting for a reply`,
    detail: row.fromFirstName || (row.fromUsername ? `@${row.fromUsername}` : row.chatId),
    href: `/bots/${row.botId}?tab=messages`,
    since: row.createdAt,
  }));
}
