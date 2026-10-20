import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isAdminUser } from "./admin";
import { errorResponse } from "./api-guard";
import { listBots } from "./bots";
import { listChats } from "./chats";
import { db } from "./db";
import { adminActions, customTemplates, telegramAccounts, users } from "./db/schema";
import { singleFlight } from "./single-flight";
import { listTelegramAccountsForUser } from "./telegram-accounts";
import { unbindTelegramAccount } from "./unbind-account";
import { getUserById, type UserRow } from "./users";

type AdminActionName = (typeof adminActions.$inferInsert)["action"];
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A refusal the admin should read (unknown user, wrong state, wrong confirmation). Mapped to its own status, never 401/409. */
export class AdminActionError extends Error {
  constructor(message: string, public status: 404 | 422 = 422) {
    super(message);
  }
}

export function adminActionErrorResponse(err: unknown): Response {
  if (err instanceof AdminActionError) return NextResponse.json({ error: err.message }, { status: err.status });
  return errorResponse(err);
}

/** The target must exist and be an ordinary user: the admin can't act on themselves or on a master admin (including another one). */
async function loadTarget(adminUserId: string, targetUserId: string): Promise<UserRow> {
  const target = await getUserById(targetUserId);
  if (!target) throw new AdminActionError("User not found.", 404);
  if (target.id === adminUserId) throw new AdminActionError("You can't do that to your own account.");
  if (await isAdminUser(target.id)) throw new AdminActionError("A master admin can't be changed from here.");
  return target;
}

/** Always called inside the same transaction as the change it records, so an action can't succeed without its audit row (or vice versa). */
async function audit(tx: Tx, adminUserId: string, action: AdminActionName, target: UserRow, detail: string | null) {
  await tx.insert(adminActions).values({
    adminUserId,
    action,
    targetUserId: target.id,
    targetName: target.username,
    detail,
    createdAt: new Date(),
  });
}

/** Invalidates every dashboard session of the user (they sign in again with a QR scan). Telegram sessions are untouched. */
export async function signOutUser(adminUserId: string, targetUserId: string): Promise<void> {
  const target = await loadTarget(adminUserId, targetUserId);
  await db.transaction(async (tx) => {
    // Incremented in SQL, not read-then-written, so concurrent bumps can't collapse into one.
    await tx
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    await audit(tx, adminUserId, "sign_out", target, null);
  });
}

/**
 * Suspending also bumps sessionVersion, so the user's open tabs get a 401 on their next request and go back to the
 * sign-in page (a QR scan is then refused). Their bots stop polling and sending (lib/suspension.ts) but nothing is
 * deleted, so unsuspending restores everything.
 */
export async function setUserSuspended(adminUserId: string, targetUserId: string, suspended: boolean): Promise<void> {
  const target = await loadTarget(adminUserId, targetUserId);
  if (suspended && target.suspendedAt) throw new AdminActionError("This user is already suspended.");
  if (!suspended && !target.suspendedAt) throw new AdminActionError("This user isn't suspended.");
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set(
        suspended
          ? { suspendedAt: new Date(), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }
          : { suspendedAt: null, updatedAt: new Date() }
      )
      .where(eq(users.id, target.id));
    await audit(tx, adminUserId, suspended ? "suspend" : "unsuspend", target, null);
  });
}

/**
 * Removes the user and everything the dashboard holds for them. Two safeguards: the user must already be suspended
 * (so it's never one click from a live account), and the admin must type the user's name. The bots themselves are not
 * touched on Telegram, only the dashboard's copy. Each linked account goes through unbindTelegramAccount (the same
 * path as a user unbinding their own account), then one transaction removes what's left and writes the audit row.
 */
export async function deleteUserAndData(adminUserId: string, targetUserId: string, confirmName: string): Promise<void> {
  const target = await loadTarget(adminUserId, targetUserId);
  if (!target.suspendedAt) throw new AdminActionError("Suspend this user before deleting them.");
  if (confirmName.trim() !== target.username) throw new AdminActionError("The name you typed doesn't match.");

  await singleFlight(`admin-delete:${target.id}`, async () => {
    const accounts = await listTelegramAccountsForUser(target.id);
    let botCount = 0;
    let chatCount = 0;
    for (const account of accounts) {
      botCount += (await listBots(account.id)).length;
      chatCount += (await listChats(account.id)).length;
    }

    for (const account of accounts) await unbindTelegramAccount(account.id);

    await db.transaction(async (tx) => {
      await tx.delete(customTemplates).where(eq(customTemplates.ownerUserId, target.id));
      // Normally already gone (logout removes the row); this catches one whose logout failed.
      await tx.delete(telegramAccounts).where(eq(telegramAccounts.ownerUserId, target.id));
      await tx.delete(users).where(eq(users.id, target.id));
      await audit(
        tx,
        adminUserId,
        "delete_user",
        target,
        `Removed ${accounts.length} Telegram account(s), ${botCount} bot(s), ${chatCount} channel(s)/group(s) from the dashboard.`
      );
    });
  });
}

export interface AdminActionDto {
  id: number;
  at: number;
  action: AdminActionName;
  adminName: string;
  targetName: string;
  detail: string | null;
}

/** Newest first. The audit trail is append-only: nothing in the dashboard edits or deletes these rows. */
export async function listAdminActions(limit = 50): Promise<AdminActionDto[]> {
  const rows = await db
    .select({
      id: adminActions.id,
      createdAt: adminActions.createdAt,
      action: adminActions.action,
      targetName: adminActions.targetName,
      detail: adminActions.detail,
      adminName: users.username,
    })
    .from(adminActions)
    .leftJoin(users, eq(users.id, adminActions.adminUserId))
    .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.getTime(),
    action: r.action,
    adminName: r.adminName ?? "Unknown admin",
    targetName: r.targetName,
    detail: r.detail,
  }));
}
