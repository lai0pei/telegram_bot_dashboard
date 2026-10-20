import { eq } from "drizzle-orm";
import { db } from "./db";
import { bots } from "./db/schema";
import { parseSetupCache, type SetupFlags } from "./setup-progress";

/**
 * Remembers what we learned about how far a bot is set up (`bots.setup_progress`), so the bot list can show "4/6" without
 * asking Telegram about every bot. Like `webhook_last_error`, it is refreshed opportunistically: whichever request
 * already knows a fact records it. Best-effort on purpose: a failed write must never fail the request that triggered it.
 */
export async function recordSetup(botId: number, patch: Partial<SetupFlags>): Promise<void> {
  try {
    const row = (await db.select({ cache: bots.setupProgress }).from(bots).where(eq(bots.id, botId)))[0];
    if (!row) return;
    const current = parseSetupCache(row.cache);
    const next = { ...current, ...patch };
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    await db.update(bots).set({ setupProgress: JSON.stringify(next) }).where(eq(bots.id, botId));
  } catch (err) {
    console.error("[setup-cache] could not record setup progress:", err);
  }
}
