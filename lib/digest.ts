import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { telegramAccounts } from "./db/schema";
import { userNotSuspended } from "./suspension";
import { getAttentionItems } from "./attention";
import { logError } from "./error-log";
import { getClient } from "./mtproto";
import { singleFlight } from "./single-flight";
import type { TelegramAccountRow } from "./telegram-accounts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Grace window so an hourly poller tick doesn't need to land on the exact hour. */
const DUE_WINDOW_MS = 30 * 60 * 1000;

function isDue(account: TelegramAccountRow, now: Date): boolean {
  if (account.digestFrequency === "off" || account.revokedAt || !account.ownerUserId) return false;
  if (now.getUTCHours() !== account.digestHour) return false;
  const minGap = account.digestFrequency === "daily" ? DAY_MS - DUE_WINDOW_MS : 7 * DAY_MS - DUE_WINDOW_MS;
  if (account.lastDigestAt && now.getTime() - account.lastDigestAt.getTime() < minGap) return false;
  return true;
}

/** Checked once per poller tick: sends a Saved Messages digest to any account whose schedule is due. */
export async function maybeSendDigests(): Promise<void> {
  const now = new Date();
  const notSuspended = userNotSuspended(telegramAccounts.ownerUserId);
  const due = await db.select().from(telegramAccounts).where(and(eq(telegramAccounts.digestFrequency, "daily"), notSuspended));
  const dueWeekly = await db.select().from(telegramAccounts).where(and(eq(telegramAccounts.digestFrequency, "weekly"), notSuspended));
  for (const account of [...due, ...dueWeekly]) {
    if (!isDue(account, now)) continue;
    await singleFlight(`digest:${account.id}`, () => sendDigest(account)).catch((err) =>
      logError("digest", `failed for account ${account.id}`, err, { accountId: account.id })
    );
  }
}

/** Sends the digest now regardless of schedule — used by the "send test" button. Still records lastDigestAt. */
export async function sendDigestNow(account: TelegramAccountRow): Promise<void> {
  await singleFlight(`digest:${account.id}`, () => sendDigest(account));
}

async function sendDigest(account: TelegramAccountRow): Promise<void> {
  const client = await getClient(account.id);
  if (!client) return; // session revoked or not connected; attention panel already flags this

  const label = account.username ? `@${account.username}` : account.firstName || "your account";
  const items = (await getAttentionItems(account.ownerUserId!)).filter((item) => item.accountId === account.id);
  const text = formatDigest(label, items);

  await client.sendMessage("me", { message: text });
  await db.update(telegramAccounts).set({ lastDigestAt: new Date() }).where(eq(telegramAccounts.id, account.id));
}

function formatDigest(label: string, items: Awaited<ReturnType<typeof getAttentionItems>>): string {
  if (items.length === 0) return `📋 Dashboard digest for ${label}\n\nAll good — nothing needs your attention.`;

  const lines = items.slice(0, 20).map((item) => `• ${item.title} — ${item.detail}`);
  const more = items.length > 20 ? `\n…and ${items.length - 20} more.` : "";
  return `📋 Dashboard digest for ${label}\n\n${lines.join("\n")}${more}`;
}
