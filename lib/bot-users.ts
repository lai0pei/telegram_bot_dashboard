import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { botUsers } from "./db/schema";

/**
 * Creates or refreshes the contact row for a chat the bot talks to. `firstName` doubles as the display name
 * (a person's first name, or a group/channel title). Fields passed as undefined are left as they were.
 * `startPayload` is stored only when the contact is created. `touch: false` keeps an existing row's lastSeenAt (for refreshes that aren't the user writing to the bot).
 */
export async function upsertBotUser(
  botId: number,
  chatId: string,
  info: { username?: string | null; firstName?: string | null; seenAt?: Date; touch?: boolean; startPayload?: string | null }
): Promise<void> {
  const now = info.seenAt ?? new Date();
  const existing = (await db
    .select()
    .from(botUsers)
    .where(and(eq(botUsers.botId, botId), eq(botUsers.chatId, chatId))))[0];

  if (existing) {
    await db.update(botUsers)
      .set({
        // The user writing to the bot (touch) also proves they haven't blocked it.
        ...(info.touch !== false && { lastSeenAt: now, blockedAt: null }),
        ...(info.username !== undefined && { username: info.username }),
        ...(info.firstName !== undefined && { firstName: info.firstName }),
      })
      .where(eq(botUsers.id, existing.id));
    return;
  }
  await db.insert(botUsers)
    .values({
      botId,
      chatId,
      username: info.username ?? null,
      firstName: info.firstName ?? null,
      // Attribution is first-touch: only the contact's first arrival records the link they came through.
      startPayload: info.startPayload ?? null,
      lastSeenAt: now,
      createdAt: now,
    });
}

/** Marks (or unmarks) a contact as having blocked the bot. Does nothing for an unknown chat. */
export async function setBotUserBlocked(botId: number, chatId: string, blocked: boolean): Promise<void> {
  await db.update(botUsers)
    .set({ blockedAt: blocked ? new Date() : null })
    .where(and(eq(botUsers.botId, botId), eq(botUsers.chatId, chatId)));
}
