import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import { hashPassword, verifyPassword } from "./password";

export type UserRow = typeof users.$inferSelect;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function getUserById(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).all()[0];
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.username, normalizeUsername(username))).all()[0];
}

export class UsernameTakenError extends Error {}

export function createUser(username: string, password: string): UserRow {
  const normalized = normalizeUsername(username);
  if (getUserByUsername(normalized)) {
    throw new UsernameTakenError("That username is already taken.");
  }
  const now = new Date();
  const row: UserRow = {
    id: crypto.randomUUID(),
    username: normalized,
    passwordHash: hashPassword(password),
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(users).values(row).run();
  return row;
}

/** Verifies credentials, running a dummy hash on an unknown username so the timing doesn't reveal which. */
export function verifyUserCredentials(username: string, password: string): UserRow | null {
  const user = getUserByUsername(username);
  if (!verifyPassword(password, user?.passwordHash ?? null)) return null;
  return user ?? null;
}

/** Updates the password and bumps sessionVersion, invalidating every other device's session cookie. */
export function changePassword(userId: string, newPassword: string): number {
  const now = new Date();
  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");
  const sessionVersion = user.sessionVersion + 1;
  db.update(users)
    .set({ passwordHash: hashPassword(newPassword), sessionVersion, updatedAt: now })
    .where(eq(users.id, userId))
    .run();
  return sessionVersion;
}
