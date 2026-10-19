/**
 * Runs pending Drizzle migrations against the SQLite file at DATABASE_PATH.
 * Invoked both via `npm run db:migrate` and automatically at container
 * startup (see Dockerfile/entrypoint).
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DATABASE_PATH || "./data/app.db";

mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./lib/db/migrations" });
console.log("Migrations applied.");
sqlite.close();
