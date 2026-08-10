import { loadEnvFile } from "./backend/scripts/load-env.js";
import { createHardhatConfig } from "./hardhat.base-config.js";

await loadEnvFile("config/env/arc-demo.env");

export default createHardhatConfig();
