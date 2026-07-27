import { closePool, withTransaction } from "../src/clob/db/client.js";
import { closeMarketConfig } from "../src/clob/db/marketConfigs.js";
import { loadDotEnv } from "./load-env.js";
import { parseMarketConfigIdentityArgs } from "./market-config-args.js";
import { printMarketConfigStatus } from "./market-config-output.js";

await main();

async function main(): Promise<void> {
  await loadDotEnv();

  try {
    const args = parseMarketConfigIdentityArgs(process.argv.slice(2));
    const config = await withTransaction((client) =>
      closeMarketConfig(client, args.outcomeToken, args.marketId)
    );

    if (config === null) {
      throw new Error("Market config not found.");
    }

    printMarketConfigStatus(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown market config close error.");
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
