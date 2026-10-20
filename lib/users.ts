import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import type { Api } from "teleproto/tl";

export type UserRow = typeof users.$inferSelect;

export async function getUserById(id: string): Promise<UserRow | undefined> {
  return (await db.select().from(users).where(eq(users.id, id)))[0];
}

/** Display name shown in the sidebar — not a login credential, since sign-in is by Telegram QR scan. */
function displayNameForTelegram(me: Api.User): string {
  return me.username ? `@${me.username}` : [me.firstName, me.lastName].filter(Boolean).join(" ") || me.id.toString();
}

/** Creates a new dashboard user for a Telegram account seen for the first time at sign-in. */
export async function createUserForTelegram(me: Api.User): Promise<UserRow> {
  const now = new Date();
  const row: UserRow = {
    id: crypto.randomUUID(),
    username: displayNameForTelegram(me),
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(row);
  return row;
}

/** Bumps sessionVersion, invalidating every other signed-in browser's session cookie. */
export async function signOutOtherSessions(userId: string): Promise<number> {
  const now = new Date();
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found.");
  const sessionVersion = user.sessionVersion + 1;
  await db.update(users).set({ sessionVersion, updatedAt: now }).where(eq(users.id, userId));
  return sessionVersion;
}
