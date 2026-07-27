import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDotEnv } from "./load-env.js";

const { Client } = pg;

const currentFile = fileURLToPath(import.meta.url);
const backendDir = path.resolve(path.dirname(currentFile), "..");
const migrationsDir = path.join(backendDir, "migrations");

await loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to check the database.");
}

const client = new Client({
  connectionString: databaseUrl,
});

const expectedTables = [
  "schema_migrations",
  "orders",
  "reservations",
  "trades",
  "trade_fills",
  "settlement_attempts",
  "market_configs",
  "market_config_events",
  "processed_chain_events",
  "backend_cursors",
  "loan_snapshots",
];

try {
  await client.connect();
  const now = await client.query<{ now: Date }>("SELECT now()");
  const migrations = await client.query<{ version: string }>(
    `
      SELECT version
      FROM schema_migrations
      ORDER BY version ASC
    `
  );
  const migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const appliedVersions = new Set(migrations.rows.map((row) => row.version));
  const missingMigrations = migrationFiles.filter((file) => !appliedVersions.has(file));
  const tableResult = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name ASC
    `,
    [expectedTables]
  );
  const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = expectedTables.filter((table) => !existingTables.has(table));

  console.log(`Database connection OK at ${now.rows[0].now.toISOString()}`);
  console.log(`Applied migrations: ${migrations.rows.map((row) => row.version).join(", ") || "none"}`);

  if (missingMigrations.length > 0) {
    throw new Error(`Missing migrations: ${missingMigrations.join(", ")}`);
  }

  if (missingTables.length > 0) {
    throw new Error(`Missing expected tables: ${missingTables.join(", ")}`);
  }

  console.log(`Expected tables OK: ${expectedTables.join(", ")}`);
} finally {
  await client.end();
}
