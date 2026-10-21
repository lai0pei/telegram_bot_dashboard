import { activeBroadcastIds, runBroadcastStep } from "./broadcast";
import { CLAIM_HEARTBEAT_MS, publishAllClaims } from "./bot-claims";
import { logError, maybePruneErrors } from "./error-log";
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
  run().catch((err) => logError("jobs", "fatal error, stopped", err));
}

async function run() {
  try {
    await failInterruptedScheduled();
  } catch (err) {
    console.error("[jobs] couldn't recover interrupted scheduled messages:", err);
  }
  let nextHealthAt = Date.now() + HEALTH_FIRST_RUN_DELAY_MS;
  // Soon after start, so a restarted dashboard re-states its claims (or finds it lost them) without waiting half an hour.
  let nextClaimsAt = Date.now() + HEALTH_FIRST_RUN_DELAY_MS;

  while (globalThis.__tgDashJobsRunning) {
    await guarded("scheduled messages", () => sendDueScheduled());
    for (const id of (await safeIds())) await guarded(`broadcast ${id}`, () => runBroadcastStep(id, BROADCAST_BUDGET_MS));
    if (Date.now() >= nextHealthAt) {
      nextHealthAt = Date.now() + HEALTH_INTERVAL_MS;
      await guarded("health checks", () => refreshAllBotHealth());
    }
    if (Date.now() >= nextClaimsAt) {
      nextClaimsAt = Date.now() + CLAIM_HEARTBEAT_MS;
      // Not awaited: it talks to Telegram, and scheduled messages and broadcasts must not wait for that.
      publishAllClaims().catch((err) => logError("jobs", "bot claims heartbeat failed", err));
    }
    // A no-op after the first call each UTC day.
    await guarded("error log cleanup", () => maybePruneErrors());
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
    // The cleanup job itself failing (e.g. the database is down) stays console-only: logError would try the same database.
    if (name === "error log cleanup") console.error(`[jobs] ${name} failed:`, err);
    else logError("jobs", `${name} failed`, err);
  }
}
