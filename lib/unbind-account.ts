import { eq } from "drizzle-orm";
import { deleteBotRow, listBots } from "./bots";
import { deleteChatRow, listChats } from "./chats";
import { db } from "./db";
import { dailyStats } from "./db/schema";
import { logout } from "./mtproto";
import { singleFlight } from "./single-flight";

/**
 * Unbinds a Telegram account from the dashboard: ends its Telegram session
 * (best-effort), then removes its bots, chats, message history and daily
 * stats. Shared by the user's own "unbind" and the admin's "delete user", so
 * both clean up exactly the same things. Bots keep existing on Telegram; only
 * the dashboard's copy is removed.
 */
export async function unbindTelegramAccount(id: string): Promise<void> {
  await singleFlight(`unbind-account:${id}`, async () => {
    // auth.LogOut is a network call: run it first and keep it out of any database transaction.
    await logout(id).catch(() => {});

    for (const bot of (await listBots(id))) await deleteBotRow(bot.id);
    for (const chat of (await listChats(id))) await deleteChatRow(chat.id);
    await db.delete(dailyStats).where(eq(dailyStats.telegramAccountId, id));
  });
}
