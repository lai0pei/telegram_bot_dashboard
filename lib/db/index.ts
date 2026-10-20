import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __tgDashDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __tgDashPg: ReturnType<typeof postgres> | undefined;
}

function createDb() {
  // postgres-js connects lazily, so a missing URL must not throw at import: `next build` imports every route
  // module without the runtime env. Without DATABASE_URL the first query fails with a connection error instead.
  const url = process.env.DATABASE_URL || "postgres://tgdash:tgdash@localhost:5432/tgdash";
  // The pool lives on globalThis so dev hot-reload doesn't open a new one per module re-evaluation.
  const client = postgres(url, { max: 10 });
  globalThis.__tgDashPg = client;
  return drizzle(client, { schema });
}

export const db = globalThis.__tgDashDb ?? (globalThis.__tgDashDb = createDb());
