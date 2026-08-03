import pg from "pg";
import { loadDotEnv } from "./load-env.js";

const { Client } = pg;

await loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to reset reviewer database state.");
}

if (!process.argv.includes("--yes")) {
  throw new Error("Refusing to reset database state without --yes.");
}

const client = new Client({ connectionString: databaseUrl });

const appTables = [
  "settlement_attempts",
  "trade_fills",
  "trades",
  "reservations",
  "orders",
  "market_config_events",
  "market_configs",
  "processed_chain_events",
  "backend_cursors",
  "loan_snapshots",
];

await client.connect();

try {
  await client.query("BEGIN");
  await client.query(`TRUNCATE TABLE ${appTables.join(", ")} RESTART IDENTITY CASCADE`);
  await client.query("COMMIT");
  console.log(`Reviewer database state reset: ${appTables.join(", ")}`);
  console.log("Schema migrations were preserved.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
