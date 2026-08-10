import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export function createHardhatConfig() {
  return defineConfig({
    plugins: [hardhatToolboxViem],
    paths: {
      sources: ["contracts", "mocks/contracts"],
    },
    solidity: {
      version: "0.8.28",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
    networks: {
      arcTestnet: {
        type: "http",
        chainType: "l1",
        url: configVariable("ARC_RPC_URL"),
        accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      },
    },
  });
}
