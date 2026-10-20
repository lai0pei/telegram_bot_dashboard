/**
 * Plain-JS migration runner used by the Docker image's startup command
 * (no tsx/ts-node needed at runtime — the production image only ships
 * compiled output + this script). Keep in sync with lib/db/migrate.ts.
 */
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { migrate } = require("drizzle-orm/postgres-js/migrator");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
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
