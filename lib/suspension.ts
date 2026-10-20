import { eq, isNotNull, notInArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "./db";
import { bots, telegramAccounts, users } from "./db/schema";

/**
 * Where a suspended dashboard user's work stops. Background code must skip it
 * when it *selects* work, not when it later looks the bot up: scheduled
 * messages and broadcasts treat "bot not found" as a failure and would mark
 * the row failed, whereas a row that is simply never selected waits and runs
 * again after the user is unsuspended. (Request handlers are stopped earlier,
 * by withSession/withAuth.)
 *
 * bots.ownerUserId is a telegram_accounts.id, so the owner is two hops away:
 * bot -> telegram account -> user.
 */
function suspendedBotIds() {
  return db
    .select({ id: bots.id })
    .from(bots)
    .innerJoin(telegramAccounts, eq(telegramAccounts.id, bots.ownerUserId))
    .innerJoin(users, eq(users.id, telegramAccounts.ownerUserId))
    .where(isNotNull(users.suspendedAt));
}

/** Condition: this bot ID column does not belong to a suspended user. */
export function botNotSuspended(botIdColumn: PgColumn): SQL {
  return notInArray(botIdColumn, suspendedBotIds());
}

/** Condition: this users.id column does not point at a suspended user. */
export function userNotSuspended(userIdColumn: PgColumn): SQL {
  return notInArray(userIdColumn, db.select({ id: users.id }).from(users).where(isNotNull(users.suspendedAt)));
}
