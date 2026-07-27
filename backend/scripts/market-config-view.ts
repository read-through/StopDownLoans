import { closePool, getPool } from "../src/clob/db/client.js";
import { getMarketConfig } from "../src/clob/db/marketConfigs.js";
import { loadDotEnv } from "./load-env.js";
import { parseMarketConfigIdentityArgs } from "./market-config-args.js";
import { printMarketConfig } from "./market-config-output.js";

await main();

async function main(): Promise<void> {
  await loadDotEnv();

  try {
    const args = parseMarketConfigIdentityArgs(process.argv.slice(2));
    const config = await getMarketConfig(getPool(), args.outcomeToken, args.marketId);

    if (config === null) {
      throw new Error("Market config not found.");
    }

    printMarketConfig(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown market config get error.");
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
