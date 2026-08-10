import { loadDotEnv } from "./backend/scripts/load-env.js";
import { createHardhatConfig } from "./hardhat.base-config.js";

await loadDotEnv();

export default createHardhatConfig();
