import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_PATH || "./data/app.db";

declare global {
  var __tgDashDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __tgDashSqlite: Database.Database | undefined;
}

function createDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalThis.__tgDashSqlite = sqlite;
  return drizzle(sqlite, { schema });
}

export const db = globalThis.__tgDashDb ?? (globalThis.__tgDashDb = createDb());
export const sqlite = globalThis.__tgDashSqlite!;
