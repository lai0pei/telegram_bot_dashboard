/**
 * Runs pending Drizzle migrations against the Postgres database at DATABASE_URL.
 * Invoked both via `npm run db:migrate` and automatically at container
 * startup (see Dockerfile; scripts/migrate.cjs is the plain-JS copy of this file).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  // One connection: migrations run sequentially, and a pool would only keep the process alive.
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./lib/db/migrations" });
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
