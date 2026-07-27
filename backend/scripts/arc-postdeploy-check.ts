import { getAddress } from "viem";
import { createArcPublicClient } from "../src/clob/chain/arc.js";
import { closePool, getPool } from "../src/clob/db/client.js";
import { loadClobBackendConfig } from "../src/clob/config.js";
import { loadDotEnv } from "./load-env.js";

const outcomeExchangeAbi = [
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const outcomeTokenAbi = [
  {
    type: "function",
    name: "loanPositionToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "collateralToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const loanPositionTokenAbi = [
  {
    type: "function",
    name: "nextLoanId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "outcomeToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

await loadDotEnv();

try {
  const config = loadClobBackendConfig();
  const publicClient = createArcPublicClient({
    rpcUrl: config.arcRpcUrl,
  });

  console.log("Checking backend deployment environment...");
  assertEqual(config.chainId, 5042002, "ARC_CHAIN_ID");
  console.log(`OK ARC_CHAIN_ID=${config.chainId.toString()}`);

  const rpcChainId = await publicClient.getChainId();
  assertEqual(rpcChainId, config.chainId, "RPC chain id");
  console.log(`OK RPC chain id=${rpcChainId.toString()}`);

  const nextLoanId = await publicClient.readContract({
    address: config.loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "nextLoanId",
  });
  console.log(`OK LoanPositionToken.nextLoanId=${nextLoanId.toString()}`);

  const loanUsdc = getAddress(String(await publicClient.readContract({
    address: config.loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "usdc",
  })));
  assertEqual(loanUsdc, getAddress(config.usdc), "LoanPositionToken.usdc");
  console.log(`OK LoanPositionToken.usdc=${loanUsdc}`);

  const exchangeUsdc = getAddress(String(await publicClient.readContract({
    address: config.outcomeExchange,
    abi: outcomeExchangeAbi,
    functionName: "usdc",
  })));
  assertEqual(exchangeUsdc, getAddress(config.usdc), "OutcomeExchange.usdc");
  console.log(`OK OutcomeExchange.usdc=${exchangeUsdc}`);

  await checkOutcomeTokenWiring(publicClient, config.loanPositionToken, getAddress(config.usdc));

  const dbTime = await getPool().query<{ now: Date }>("SELECT now()");
  console.log(`OK PostgreSQL connection=${dbTime.rows[0].now.toISOString()}`);

  console.log("");
  console.log("Post-deploy backend readiness OK");
  printMarketConfigHint();
} finally {
  await closePool();
}

async function checkOutcomeTokenWiring(
  publicClient: ReturnType<typeof createArcPublicClient>,
  loanPositionTokenAddress: `0x${string}`,
  usdcAddress: `0x${string}`
): Promise<void> {
  const outcomeToken = process.env.OUTCOME_TOKEN_ADDRESS;
  if (outcomeToken === undefined || outcomeToken.trim() === "") {
    console.log("");
    console.log("Set OUTCOME_TOKEN_ADDRESS to verify OutcomeToken wiring and print a market-config command template.");
    return;
  }

  const normalizedOutcomeToken = getAddress(outcomeToken);
  const configuredOutcomeToken = getAddress(String(await publicClient.readContract({
    address: loanPositionTokenAddress,
    abi: loanPositionTokenAbi,
    functionName: "outcomeToken",
  })));
  assertEqual(configuredOutcomeToken, normalizedOutcomeToken, "LoanPositionToken.outcomeToken");
  console.log(`OK LoanPositionToken.outcomeToken=${configuredOutcomeToken}`);

  const outcomeLoanPositionToken = getAddress(String(await publicClient.readContract({
    address: normalizedOutcomeToken,
    abi: outcomeTokenAbi,
    functionName: "loanPositionToken",
  })));
  assertEqual(outcomeLoanPositionToken, loanPositionTokenAddress, "OutcomeToken.loanPositionToken");
  console.log(`OK OutcomeToken.loanPositionToken=${outcomeLoanPositionToken}`);

  const outcomeCollateralToken = getAddress(String(await publicClient.readContract({
    address: normalizedOutcomeToken,
    abi: outcomeTokenAbi,
    functionName: "collateralToken",
  })));
  assertEqual(outcomeCollateralToken, usdcAddress, "OutcomeToken.collateralToken");
  console.log(`OK OutcomeToken.collateralToken=${outcomeCollateralToken}`);
}

function printMarketConfigHint(): void {
  const outcomeToken = process.env.OUTCOME_TOKEN_ADDRESS;
  if (outcomeToken === undefined || outcomeToken.trim() === "") {
    return;
  }

  const normalizedOutcomeToken = getAddress(outcomeToken);
  console.log("");
  console.log("After a loan creates a marketId, create backend CLOB market config:");
  console.log(
    [
      "npm.cmd run market-config:upsert --",
      `--outcome-token ${normalizedOutcomeToken}`,
      "--market-id 0x...",
      "--default-tick-units 1000",
      "--edge-tick-units 100",
      "--lower-edge-price-units 100000",
      "--upper-edge-price-units 900000",
    ].join(" ")
  );
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`);
  }
}
