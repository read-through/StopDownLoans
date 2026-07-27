import { closePool, withTransaction } from "../src/clob/db/client.js";
import { updateMarketTickConfig } from "../src/clob/db/marketConfigs.js";
import { loadDotEnv } from "./load-env.js";
import { parseMarketTickConfigArgs } from "./market-config-args.js";
import { printMarketTickConfig } from "./market-config-output.js";

await main();

async function main(): Promise<void> {
  await loadDotEnv();

  try {
    const args = parseMarketTickConfigArgs(process.argv.slice(2));
    const config = await withTransaction((client) => updateMarketTickConfig(client, args));

    if (config === null) {
      throw new Error("Market config not found.");
    }

    printMarketTickConfig(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown market tick config error.");
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
