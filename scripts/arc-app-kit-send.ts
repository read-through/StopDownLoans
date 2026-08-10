import { AppKit, Blockchain, type SendParams } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { getAddress } from "viem";
import { loadEnvFile } from "../backend/scripts/load-env.js";

await loadEnvFile("config/env/app-kit.env");

const execute = process.argv.slice(2).includes("--execute");
const privateKey = requirePrivateKey("APP_KIT_PRIVATE_KEY");
const recipient = getAddress(requireValue("APP_KIT_RECIPIENT_ADDRESS"));
const amount = requireUsdcAmount("APP_KIT_AMOUNT");

const adapter = createViemAdapterFromPrivateKey({ privateKey });
const kit = new AppKit({ disableAnalytics: true, disableErrorReporting: true });
const params: SendParams = {
  from: { adapter, chain: Blockchain.Arc_Testnet },
  to: recipient,
  amount,
  token: "USDC",
};

console.log(`ARC App Kit USDC transfer: ${amount} USDC -> ${recipient}`);

const estimate = await kit.estimateSend(params);
console.log(
  "Estimate:",
  JSON.stringify(estimate, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
);

if (!execute) {
  console.log("Estimate only. Re-run with --execute to broadcast the transfer.");
} else {
  const result = await kit.send(params);
  console.log(
    "Transfer submitted:",
    JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );
}

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requirePrivateKey(name: string): string {
  const value = requireValue(name);
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 32-byte hex private key.`);
  }
  return normalized;
}

function requireUsdcAmount(name: string): string {
  const value = requireValue(name);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive USDC amount with at most 6 decimal places.`);
  }
  return value;
}
