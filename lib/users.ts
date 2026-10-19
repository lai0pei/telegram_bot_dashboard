import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import type { Api } from "teleproto/tl";

export type UserRow = typeof users.$inferSelect;

export function getUserById(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).all()[0];
}

/** Display name shown in the sidebar — not a login credential, since sign-in is by Telegram QR scan. */
function displayNameForTelegram(me: Api.User): string {
  return me.username ? `@${me.username}` : [me.firstName, me.lastName].filter(Boolean).join(" ") || me.id.toString();
}

/** Creates a new dashboard user for a Telegram account seen for the first time at sign-in. */
export function createUserForTelegram(me: Api.User): UserRow {
  const now = new Date();
  const row: UserRow = {
    id: crypto.randomUUID(),
    username: displayNameForTelegram(me),
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(users).values(row).run();
  return row;
}

/** Bumps sessionVersion, invalidating every other signed-in browser's session cookie. */
export function signOutOtherSessions(userId: string): number {
  const now = new Date();
  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");
  const sessionVersion = user.sessionVersion + 1;
  db.update(users).set({ sessionVersion, updatedAt: now }).where(eq(users.id, userId)).run();
  return sessionVersion;
}
