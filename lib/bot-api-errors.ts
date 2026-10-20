import { NextResponse } from "next/server";
import { BotApiError } from "./botapi";

/**
 * Readable message + HTTP status for a failed Bot API call. Never 401 (apiFetch treats it as a dead dashboard
 * session) and never 409 (reserved for NO_ACTIVE_ACCOUNT / SESSION_REVOKED).
 */
export function botApiFailure(err: BotApiError): { error: string; status: number } {
  const d = err.description.toLowerCase();
  if (err.errorCode === 429) {
    const wait = err.retryAfter ? ` Try again in ${err.retryAfter}s.` : "";
    return { error: `Telegram is rate limiting this bot.${wait}`, status: 429 };
  }
  if (err.errorCode === 403) {
    return { error: "This user blocked the bot or never started it, so Telegram won't deliver the message.", status: 422 };
  }
  if (err.errorCode === 400 && d.includes("chat not found")) {
    return { error: "Chat not found. The user must message the bot first.", status: 422 };
  }
  if (err.errorCode === 401) {
    return { error: "Telegram rejected the bot's token. Try again in a couple of minutes.", status: 502 };
  }
  return { error: err.description, status: 400 };
}

/** A JSON error response for a BotApiError, or null for any other error (let the caller's errorResponse handle it). */
export function botApiErrorResponse(err: unknown): Response | null {
  if (!(err instanceof BotApiError)) return null;
  const { error, status } = botApiFailure(err);
  return NextResponse.json({ error }, { status });
}
