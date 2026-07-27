import { readdir, readFile } from "node:fs/promises";
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
  throw new Error("DATABASE_URL is required to run migrations.");
}

const client = new Client({ connectionString: databaseUrl });

async function ensureMigrationsTable(): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedVersions(): Promise<Set<string>> {
  const result = await client.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );

  return new Set(result.rows.map((row) => row.version));
}

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(migrationsDir);

  return files.filter((file) => file.endsWith(".sql")).sort();
}

async function applyMigration(file: string): Promise<void> {
  const version = file;
  const sql = await readFile(path.join(migrationsDir, file), "utf8");

  await client.query("BEGIN");

  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`Applied ${version}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  await client.connect();

  try {
    await ensureMigrationsTable();

    const appliedVersions = await getAppliedVersions();
    const migrationFiles = await getMigrationFiles();

    for (const file of migrationFiles) {
      if (appliedVersions.has(file)) {
        console.log(`Skipped ${file}`);
        continue;
      }

      await applyMigration(file);
    }
  } finally {
    await client.end();
  }
}

await main();
