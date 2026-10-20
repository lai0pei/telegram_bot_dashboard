import { activeBroadcastIds, runBroadcastStep } from "./broadcast";
import { refreshAllBotHealth } from "./health";
import { failInterruptedScheduled, sendDueScheduled } from "./scheduled";

/**
 * Background job loop, started once per process from instrumentation.ts next to the poller. Each tick sends due
 * scheduled messages, advances running broadcasts, and (every 10 minutes) refreshes bot health. Jobs use the stored
 * token directly and never re-fetch it from BotFather.
 */
const TICK_MS = 5000;
const BROADCAST_BUDGET_MS = 3000;
const HEALTH_INTERVAL_MS = 10 * 60 * 1000;
const HEALTH_FIRST_RUN_DELAY_MS = 30 * 1000;

declare global {
  var __tgDashJobsRunning: boolean | undefined;
}

export function startJobs() {
  if (globalThis.__tgDashJobsRunning) return;
  globalThis.__tgDashJobsRunning = true;
  run().catch((err) => console.error("[jobs] fatal error, stopped:", err));
}

async function run() {
  try {
    await failInterruptedScheduled();
  } catch (err) {
    console.error("[jobs] couldn't recover interrupted scheduled messages:", err);
  }
  let nextHealthAt = Date.now() + HEALTH_FIRST_RUN_DELAY_MS;

  while (globalThis.__tgDashJobsRunning) {
    await guarded("scheduled messages", () => sendDueScheduled());
    for (const id of (await safeIds())) await guarded(`broadcast ${id}`, () => runBroadcastStep(id, BROADCAST_BUDGET_MS));
    if (Date.now() >= nextHealthAt) {
      nextHealthAt = Date.now() + HEALTH_INTERVAL_MS;
      await guarded("health checks", () => refreshAllBotHealth());
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

async function safeIds(): Promise<number[]> {
  try {
    return await activeBroadcastIds();
  } catch (err) {
    console.error("[jobs] couldn't list broadcasts:", err);
    return [];
  }
}

/** One failing job must not stop the others or the loop. */
async function guarded(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[jobs] ${name} failed:`, err);
  }
}
