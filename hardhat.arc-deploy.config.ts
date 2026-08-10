import { loadEnvFile } from "./backend/scripts/load-env.js";
import { createHardhatConfig } from "./hardhat.base-config.js";

await loadEnvFile("config/env/arc-deploy.env");

export default createHardhatConfig();
