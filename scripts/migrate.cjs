/**
 * Plain-JS migration runner used by the Docker image's startup command
 * (no tsx/ts-node needed at runtime — the production image only ships
 * compiled output + this script).
 */
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const { mkdirSync } = require("node:fs");
const { dirname } = require("node:path");

const DB_PATH = process.env.DATABASE_PATH || "./data/app.db";

mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./lib/db/migrations" });
console.log("Migrations applied.");
sqlite.close();
