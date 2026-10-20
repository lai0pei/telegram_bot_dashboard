import { BotApiError, botApi } from "./botapi";
import { getBotToken, listAllBotsWithToken, saveBotHealth, type BotRow } from "./bots";
import { getPollerFailures } from "./poller";

export interface HealthResult {
  status: "ok" | "warning" | "error";
  message: string | null;
}

const ERROR_WINDOW_S = 60 * 60;
const PENDING_WARNING = 100;
const POLLER_FAILURE_WARNING = 3;

/**
 * Looks at one bot with its stored token: is the token alive, is the webhook delivering, is the poller reaching
 * Telegram. Returns null when Telegram itself couldn't be reached, so a network blip doesn't flag every bot.
 * Never goes through BotFather: a dead token is reported, not silently re-fetched from a timer.
 */
export async function checkBotHealth(bot: BotRow): Promise<HealthResult | null> {
  const token = getBotToken(bot);
  if (!token) return { status: "error", message: "No token is stored for this bot." };

  try {
    const me = await botApi.getMe(token);
    if (String(me.id) !== bot.telegramId) return { status: "error", message: "The stored token belongs to a different bot." };

    const webhook = await botApi.getWebhookInfo(token);
    const warnings: string[] = [];
    if (webhook.url && webhook.last_error_date && Date.now() / 1000 - webhook.last_error_date < ERROR_WINDOW_S) {
      warnings.push(`Webhook delivery is failing: ${webhook.last_error_message ?? "unknown error"}.`);
    }
    if (webhook.pending_update_count > PENDING_WARNING) {
      warnings.push(`${webhook.pending_update_count} updates are waiting to be delivered.`);
    }
    if (webhook.url && bot.monitorEnabled) {
      warnings.push("Monitoring is on, but a webhook is set, so updates go to the webhook instead.");
    }
    const failures = getPollerFailures(bot.id);
    if (failures >= POLLER_FAILURE_WARNING) warnings.push(`Monitoring can't reach Telegram (${failures} failed attempts in a row).`);

    return warnings.length ? { status: "warning", message: warnings.join(" ") } : { status: "ok", message: null };
  } catch (err) {
    if (err instanceof BotApiError) {
      if (err.errorCode === 401) return { status: "error", message: "Telegram rejected the token. It may have been revoked." };
      return { status: "warning", message: err.description };
    }
    return null;
  }
}

/** Checks and saves one bot's health. Returns the result (null when Telegram was unreachable and nothing changed). */
export async function refreshBotHealth(bot: BotRow): Promise<HealthResult | null> {
  const result = await checkBotHealth(bot);
  if (result) saveBotHealth(bot.id, result.status, result.message);
  return result;
}

/** Checks every bot with a token, one at a time so 20 bots don't become 40 simultaneous requests. */
export async function refreshAllBotHealth(): Promise<void> {
  for (const bot of listAllBotsWithToken()) {
    try {
      await refreshBotHealth(bot);
    } catch (err) {
      console.error(`[health] bot ${bot.username} check failed:`, err);
    }
  }
}
