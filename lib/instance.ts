import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { appSettings } from "./db/schema";

/**
 * Who this dashboard is, for telling it apart from another dashboard signed in with the same Telegram account
 * (lib/bot-claims.ts). The ID is made once and kept in `app_settings`; the name is what the other dashboard shows.
 */
const ID_KEY = "instance_id";

declare global {
  var __tgDashInstanceId: Promise<string> | undefined;
}

export function getInstanceId(): Promise<string> {
  return (globalThis.__tgDashInstanceId ??= loadInstanceId().catch((err) => {
    globalThis.__tgDashInstanceId = undefined; // don't cache a failure (e.g. the database was still starting)
    throw err;
  }));
}

async function loadInstanceId(): Promise<string> {
  const existing = (await db.select().from(appSettings).where(eq(appSettings.key, ID_KEY)))[0];
  if (existing) return existing.value;
  // Two processes starting at once both insert; the loser's value is dropped and the winner's re-read.
  await db.insert(appSettings).values({ key: ID_KEY, value: randomUUID(), updatedAt: new Date() }).onConflictDoNothing();
  return (await db.select().from(appSettings).where(eq(appSettings.key, ID_KEY)))[0]!.value;
}

/** `INSTANCE_NAME`, else the host name. Limited to plain characters because it is written into a Telegram message. */
export function getInstanceName(): string {
  const raw = process.env.INSTANCE_NAME?.trim() || hostname();
  return raw.replace(/[^A-Za-z0-9 .\-]/g, "").slice(0, 40) || "dashboard";
}
