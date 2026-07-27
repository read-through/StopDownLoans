import { closePool, withTransaction } from "../src/clob/db/client.js";
import { upsertMarketConfig } from "../src/clob/db/marketConfigs.js";
import { parseMarketConfigArgs } from "./market-config-args.js";
import { printMarketConfig } from "./market-config-output.js";
import { loadDotEnv } from "./load-env.js";

await main();

async function main(): Promise<void> {
  await loadDotEnv();

  try {
    const args = parseMarketConfigArgs(process.argv.slice(2));
    const config = await withTransaction((client) => upsertMarketConfig(client, args));

    printMarketConfig(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown market config error.");
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
