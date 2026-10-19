import { botApi } from "./botapi";
import { getBotToken, listAllMonitoredBots, setLastUpdateId, setPollHealth } from "./bots";
import { db } from "./db";
import { botMessages, botUsers } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { snapshotDailyStats, utcDay } from "./stats";
import { maybeSendDigests } from "./digest";

/**
 * Background long-poll loop for every bot with monitoring enabled. Started
 * once per process from instrumentation.ts. Each bot is polled with its own
 * offset (lastUpdateId) so restarts don't re-fetch old updates. Also drives
 * the once-a-day stats snapshot and digest check, since this is the only
 * long-running loop in the process.
 */
const POLL_TIMEOUT_SECONDS = 15;
let running = false;

declare global {
  var __tgDashLastSnapshotDay: string | undefined;
}

export function startPoller() {
  if (running) return;
  running = true;
  loop().catch((err) => console.error("[poller] fatal error, stopped:", err));
}

async function loop() {
  while (running) {
    maybeSnapshotDailyStats();
    maybeSendDigests().catch((err) => console.error("[poller] digest check failed:", err));

    const monitored = listAllMonitoredBots().filter((b) => b.encryptedToken);
    if (monitored.length === 0) {
      await sleep(3000);
      continue;
    }
    // Poll bots sequentially with a short timeout each, round-robin style,
    // so one bot's long-poll doesn't starve the others for too long.
    for (const bot of monitored) {
      if (!bot.monitorEnabled) continue;
      const token = getBotToken(bot);
      if (!token) continue;
      try {
        const updates = await botApi.getUpdates(token, (bot.lastUpdateId ?? 0) + 1, POLL_TIMEOUT_SECONDS);
        for (const update of updates) {
          if (update.message) recordIncomingMessage(bot.id, update.message);
          setLastUpdateId(bot.id, update.update_id);
        }
        setPollHealth(bot.id, null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[poller] bot ${bot.username} getUpdates failed:`, err);
        setPollHealth(bot.id, message);
        await sleep(5000);
      }
    }
  }
}

/** Runs the stats snapshot at most once per UTC day per process (each poller cycle, this is a cheap no-op check). */
function maybeSnapshotDailyStats() {
  const today = utcDay(new Date());
  if (globalThis.__tgDashLastSnapshotDay === today) return;
  globalThis.__tgDashLastSnapshotDay = today;
  try {
    snapshotDailyStats();
  } catch (err) {
    console.error("[poller] daily stats snapshot failed:", err);
  }
}

function recordIncomingMessage(
  botId: number,
  message: NonNullable<Awaited<ReturnType<typeof botApi.getUpdates>>[number]["message"]>
) {
  const now = new Date();
  db.insert(botMessages)
    .values({
      botId,
      chatId: String(message.chat.id),
      fromUserId: message.from ? String(message.from.id) : null,
      fromUsername: message.from?.username ?? null,
      fromFirstName: message.from?.first_name ?? null,
      direction: "in",
      text: message.text ?? null,
      raw: JSON.stringify(message),
      telegramMessageId: message.message_id,
      createdAt: now,
    })
    .run();

  if (message.from) {
    const existing = db
      .select()
      .from(botUsers)
      .where(and(eq(botUsers.botId, botId), eq(botUsers.chatId, String(message.chat.id))))
      .all()[0];
    if (existing) {
      db.update(botUsers)
        .set({ lastSeenAt: now, username: message.from.username ?? null, firstName: message.from.first_name })
        .where(eq(botUsers.id, existing.id))
        .run();
    } else {
      db.insert(botUsers)
        .values({
          botId,
          chatId: String(message.chat.id),
          username: message.from.username ?? null,
          firstName: message.from.first_name,
          lastSeenAt: now,
          createdAt: now,
        })
        .run();
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
