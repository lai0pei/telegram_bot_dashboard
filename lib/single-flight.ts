/**
 * Collapses concurrent calls with the same key into one: while a call for
 * `key` is in flight, later callers get the same promise instead of starting
 * another run. Used for BotFather flows, where a repeated click would
 * otherwise queue a second /mybots conversation (or revoke a token twice).
 */
declare global {
  var __tgDashInFlight: Map<string, Promise<unknown>> | undefined;
}

function inFlight(): Map<string, Promise<unknown>> {
  return (globalThis.__tgDashInFlight ??= new Map());
}

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight().get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => inFlight().delete(key));
  inFlight().set(key, promise);
  return promise;
}
