import { eq } from "drizzle-orm";
import { db, sqlite } from "./db";
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
export function getAttentionItems(dashboardUserId: string): AttentionItem[] {
  const accounts = listTelegramAccountsForUser(dashboardUserId);
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

    const accountBots = db.select().from(bots).where(eq(bots.ownerUserId, account.id)).all();

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
          detail: "Open the bot to fetch its token from BotFather.",
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

      if (bot.monitorEnabled && bot.encryptedToken) {
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

    for (const row of unansweredConversations(account.id, accountBots)) {
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
function unansweredConversations(accountId: string, accountBots: BotLite[]): Omit<AttentionItem, "accountLabel">[] {
  const botIds = accountBots.map((b) => b.id);
  if (botIds.length === 0) return [];
  const usernames = new Map(accountBots.map((b) => [b.id, b.username]));
  const placeholders = botIds.map(() => "?").join(",");

  // Latest message per (botId, chatId), kept only when that latest message
  // is incoming — i.e. nothing was sent back after it.
  const rows = sqlite
    .prepare(
      `SELECT bm.bot_id as botId, bm.chat_id as chatId, bm.direction, bm.created_at as createdAt,
              bm.from_first_name as fromFirstName, bm.from_username as fromUsername
       FROM bot_messages bm
       WHERE bm.id IN (
         SELECT MAX(id) FROM bot_messages WHERE bot_id IN (${placeholders}) GROUP BY bot_id, chat_id
       )
       AND bm.direction = 'in'
       ORDER BY bm.created_at ASC
       LIMIT ?`
    )
    .all(...botIds, UNANSWERED_LIMIT) as {
    botId: number;
    chatId: string;
    createdAt: number;
    fromFirstName: string | null;
    fromUsername: string | null;
  }[];

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
