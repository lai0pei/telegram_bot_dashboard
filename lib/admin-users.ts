import { isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { bots, chats, telegramAccounts, users } from "./db/schema";
import { masterAdminTelegramIds } from "./admin";

/** One linked Telegram account as the admin sees it: an identity, never a credential (no phone, no session string). */
export interface AdminAccountRow {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  revoked: boolean;
}

export interface AdminUserRow {
  id: string;
  name: string;
  createdAt: number;
  /** Epoch ms of the last authenticated request, or null for a user who has never been seen since this column existed. */
  lastActiveAt: number | null;
  isAdmin: boolean;
  accounts: AdminAccountRow[];
  bots: number;
  monitoredBots: number;
  chats: number;
}

export interface AdminUsersOverview {
  totals: {
    users: number;
    accounts: number;
    bots: number;
    monitoredBots: number;
    chats: number;
    activeLast24h: number;
    activeLast7d: number;
  };
  users: AdminUserRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everyone using this dashboard, from the local database only. bots.ownerUserId
 * and chats.ownerUserId hold a *telegram_accounts.id* (not a users.id), so
 * counts are grouped per account and rolled up to the owning user in memory;
 * a user with no linked account still appears, with zeros.
 */
export async function getAdminUsersOverview(): Promise<AdminUsersOverview> {
  const [userRows, accountRows, botCounts, chatCounts] = await Promise.all([
    db.select().from(users),
    db
      .select({
        id: telegramAccounts.id,
        ownerUserId: telegramAccounts.ownerUserId,
        telegramId: telegramAccounts.telegramId,
        username: telegramAccounts.username,
        firstName: telegramAccounts.firstName,
        revokedAt: telegramAccounts.revokedAt,
      })
      .from(telegramAccounts)
      .where(isNotNull(telegramAccounts.ownerUserId)),
    db
      .select({
        accountId: bots.ownerUserId,
        total: sql<number>`count(*)::int`,
        monitored: sql<number>`(count(*) filter (where ${bots.monitorEnabled}))::int`,
      })
      .from(bots)
      .groupBy(bots.ownerUserId),
    db
      .select({ accountId: chats.ownerUserId, total: sql<number>`count(*)::int` })
      .from(chats)
      .groupBy(chats.ownerUserId),
  ]);

  const botsByAccount = new Map(botCounts.map((r) => [r.accountId, r]));
  const chatsByAccount = new Map(chatCounts.map((r) => [r.accountId, r.total]));
  const admins = masterAdminTelegramIds();

  const accountsByUser = new Map<string, typeof accountRows>();
  for (const a of accountRows) {
    const list = accountsByUser.get(a.ownerUserId!) ?? [];
    list.push(a);
    accountsByUser.set(a.ownerUserId!, list);
  }

  const rows: AdminUserRow[] = userRows.map((u) => {
    const accounts = accountsByUser.get(u.id) ?? [];
    return {
      id: u.id,
      name: u.username,
      createdAt: u.createdAt.getTime(),
      lastActiveAt: u.lastActiveAt?.getTime() ?? null,
      isAdmin: accounts.some((a) => admins.has(a.telegramId)),
      accounts: accounts.map((a) => ({
        telegramId: a.telegramId,
        username: a.username,
        firstName: a.firstName,
        revoked: !!a.revokedAt,
      })),
      bots: accounts.reduce((n, a) => n + (botsByAccount.get(a.id)?.total ?? 0), 0),
      monitoredBots: accounts.reduce((n, a) => n + (botsByAccount.get(a.id)?.monitored ?? 0), 0),
      chats: accounts.reduce((n, a) => n + (chatsByAccount.get(a.id) ?? 0), 0),
    };
  });

  // Most recently active first; users never seen sort last, newest sign-up first among them.
  rows.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0) || b.createdAt - a.createdAt);

  const now = Date.now();
  const activeWithin = (ms: number) => rows.filter((r) => r.lastActiveAt !== null && now - r.lastActiveAt <= ms).length;
  return {
    totals: {
      users: rows.length,
      accounts: accountRows.length,
      bots: rows.reduce((n, r) => n + r.bots, 0),
      monitoredBots: rows.reduce((n, r) => n + r.monitoredBots, 0),
      chats: rows.reduce((n, r) => n + r.chats, 0),
      activeLast24h: activeWithin(DAY_MS),
      activeLast7d: activeWithin(7 * DAY_MS),
    },
    users: rows,
  };
}
