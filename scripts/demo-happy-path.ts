import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { loadDotEnv } from "../backend/scripts/load-env.js";

const localAppData = path.join(process.cwd(), ".hardhat-localappdata");
const defaultDatabaseUrl = "postgres://stopdown:stopdown@localhost:55432/stopdown";

const commands = [
  ["npm", ["run", "demo:local:repaid"]],
  ["npm", ["run", "demo:local:default"]],
  ["npm", ["run", "demo:local:clob-trade"]],
] as const;

await loadDotEnv();
process.env.DATABASE_URL = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

const databaseReady = await checkDatabaseReady(process.env.DATABASE_URL);
if (!databaseReady) {
  process.exit(1);
}

for (const [command, args] of commands) {
  const executable = process.platform === "win32" ? "cmd.exe" : command;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  const printedCommand = process.platform === "win32" ? `${command}.cmd ${args.join(" ")}` : `${command} ${args.join(" ")}`;

  console.log("");
  console.log(`> ${printedCommand}`);

  const result = spawnSync(executable, commandArgs, {
    env: {
      ...process.env,
      LOCALAPPDATA: localAppData,
    },
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log("StopDown local happy path completed.");

async function checkDatabaseReady(databaseUrl: string): Promise<boolean> {
  const client = new pg.Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch (error) {
    console.error("");
    console.error("PostgreSQL is required before running the full local happy path.");
    console.error(`Tried DATABASE_URL=${databaseUrl}`);
    console.error("");
    console.error("Start and migrate the local database first:");
    console.error("  npm.cmd run db:up");
    console.error("  npm.cmd run db:migrate");
    console.error("");
    console.error("If Docker Desktop is not running, start Docker Desktop and retry.");
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
