import { BotApiError } from "./botapi";

const MAX_RETRY_WAIT_S = 10;

/** One Bot API call, retried once if Telegram asks for a short wait (429 with a small `retry_after`). */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BotApiError && err.errorCode === 429 && (err.retryAfter ?? 1) <= MAX_RETRY_WAIT_S) {
      await new Promise((resolve) => setTimeout(resolve, (err.retryAfter ?? 1) * 1000));
      return fn();
    }
    throw err;
  }
}
