/**
 * Drizzle wraps the driver's error in a DrizzleQueryError (the original is on `.cause`), so every classification
 * has to look through the chain. Keep db-free: the poller and the routes both import this.
 */

type PgLikeError = { code?: unknown; name?: unknown; cause?: unknown; errno?: unknown };

function chain(err: unknown): PgLikeError[] {
  const out: PgLikeError[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    out.push(cur as PgLikeError);
    cur = (cur as PgLikeError).cause;
  }
  return out;
}

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return chain(err).some((e) => e.code === "23505");
}

/**
 * True when the database itself failed (a PostgresError, a lost connection, a missing table), as opposed to a bug
 * in the code handling an update. The poller leaves its offset untouched for these so nothing is dropped.
 */
export function isDatabaseError(err: unknown): boolean {
  return chain(err).some((e) => {
    if (e.name === "PostgresError") return true;
    const code = e.code;
    if (typeof code !== "string") return false;
    // postgres-js connection errors (CONNECTION_CLOSED / _ENDED / _DESTROYED, CONNECT_TIMEOUT) and Node socket errors.
    return code.startsWith("CONNECT") || code.startsWith("ECONN") || ["EPIPE", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code);
  });
}
