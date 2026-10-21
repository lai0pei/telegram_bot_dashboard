import { desc, eq } from "drizzle-orm";
import { listBotChats } from "./bot-chats";
import { db } from "./db";
import { botUsers } from "./db/schema";

/** A place a bot can send to: a person who wrote to it, or a group/channel it is currently in. */
export interface Destination {
  chatId: string;
  name: string;
  kind: "user" | "group" | "channel";
  /** The person blocked the bot (or the chat was lost): shown, but not selectable. */
  blocked?: boolean;
}

/** The picker lists at most this many contacts, most recently seen first. */
export const MAX_LISTED_CONTACTS = 500;

/**
 * Everything the "send to" pickers offer. A negative-ID `bot_users` row is a group title stored as a contact; it is
 * skipped here because the real group comes from `bot_chats`.
 */
export async function listDestinations(botId: number): Promise<Destination[]> {
  const rows = await db.select().from(botUsers).where(eq(botUsers.botId, botId)).orderBy(desc(botUsers.lastSeenAt));
  const people = new Map<string, Destination>();
  for (const u of rows) {
    if (u.chatId.startsWith("-") || people.has(u.chatId)) continue;
    people.set(u.chatId, {
      chatId: u.chatId,
      name: u.firstName || (u.username ? `@${u.username}` : u.chatId),
      kind: "user",
      blocked: u.blockedAt !== null,
    });
    if (people.size >= MAX_LISTED_CONTACTS) break;
  }
  const chats = (await listBotChats(botId))
    .filter((c) => c.status === "member" || c.status === "administrator")
    .map((c): Destination => ({ chatId: c.chatId, name: c.title, kind: c.type === "channel" ? "channel" : "group" }));
  return [...people.values(), ...chats];
}
