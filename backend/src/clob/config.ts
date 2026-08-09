import { getAddress } from "viem";
import type { Hex } from "./types.js";

export type ClobBackendConfig = {
  databaseUrl: string;
  arcRpcUrl: string;
  chainId: number;
  loanPositionToken: Hex;
  outcomeToken: Hex;
  outcomeExchange: Hex;
  usdc: Hex;
  corsAllowedOrigins: string[];
  expiredOrderSweepIntervalMs: number;
  expiredOrderSweepLimit: number;
  reconciliationIntervalMs: number;
  reconciliationConfirmationDepth: bigint;
  reconciliationStartBlock: bigint;
  reconciliationMaxBlocksPerRun: bigint;
  executorPrivateKey: Hex | null;
  executorIntervalMs: number;
  executorBatchLimit: number;
  executorExecutingTradeTimeoutMs: number;
  lendingKeeperIntervalMs: number;
  lendingKeeperScanLimit: number;
  loanSnapshotSyncIntervalMs: number;
  loanSnapshotSyncLimit: number;
  receiptSweepIntervalMs: number;
  receiptSweepLimit: number;
  receiptDroppedTimeoutMs: number;
  marketConfigEventSweepIntervalMs: number;
  marketConfigEventSweepLimit: number;
};

export function loadClobBackendConfig(env: NodeJS.ProcessEnv = process.env): ClobBackendConfig {
  return {
    databaseUrl: requireEnv(env, "DATABASE_URL"),
    arcRpcUrl: requireEnv(env, "ARC_RPC_URL"),
    chainId: parsePositiveInteger(requireEnv(env, "ARC_CHAIN_ID"), "ARC_CHAIN_ID"),
    loanPositionToken: parseAddress(
      requireEnv(env, "LOAN_POSITION_TOKEN_ADDRESS"),
      "LOAN_POSITION_TOKEN_ADDRESS"
    ),
    outcomeToken: parseAddress(requireEnv(env, "OUTCOME_TOKEN_ADDRESS"), "OUTCOME_TOKEN_ADDRESS"),
    outcomeExchange: parseAddress(requireEnv(env, "OUTCOME_EXCHANGE_ADDRESS"), "OUTCOME_EXCHANGE_ADDRESS"),
    usdc: parseAddress(requireEnv(env, "USDC_ADDRESS"), "USDC_ADDRESS"),
    corsAllowedOrigins: parseOrigins(
      env.CORS_ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173",
    ),
    expiredOrderSweepIntervalMs: parsePositiveInteger(
      env.EXPIRED_ORDER_SWEEP_INTERVAL_MS ?? "5000",
      "EXPIRED_ORDER_SWEEP_INTERVAL_MS"
    ),
    expiredOrderSweepLimit: parsePositiveInteger(
      env.EXPIRED_ORDER_SWEEP_LIMIT ?? "100",
      "EXPIRED_ORDER_SWEEP_LIMIT"
    ),
    reconciliationIntervalMs: parsePositiveInteger(
      env.RECONCILIATION_INTERVAL_MS ?? "3000",
      "RECONCILIATION_INTERVAL_MS"
    ),
    reconciliationConfirmationDepth: parseNonNegativeBigint(
      env.RECONCILIATION_CONFIRMATION_DEPTH ?? "1",
      "RECONCILIATION_CONFIRMATION_DEPTH"
    ),
    reconciliationStartBlock: parseNonNegativeBigint(
      env.RECONCILIATION_START_BLOCK ?? "0",
      "RECONCILIATION_START_BLOCK"
    ),
    reconciliationMaxBlocksPerRun: parsePositiveBigint(
      env.RECONCILIATION_MAX_BLOCKS_PER_RUN ?? "1000",
      "RECONCILIATION_MAX_BLOCKS_PER_RUN"
    ),
    executorPrivateKey: parseOptionalPrivateKey(env.EXECUTOR_PRIVATE_KEY),
    executorIntervalMs: parsePositiveInteger(env.EXECUTOR_INTERVAL_MS ?? "1000", "EXECUTOR_INTERVAL_MS"),
    executorBatchLimit: parsePositiveInteger(env.EXECUTOR_BATCH_LIMIT ?? "10", "EXECUTOR_BATCH_LIMIT"),
    executorExecutingTradeTimeoutMs: parsePositiveInteger(
      env.EXECUTOR_EXECUTING_TRADE_TIMEOUT_MS ?? "60000",
      "EXECUTOR_EXECUTING_TRADE_TIMEOUT_MS"
    ),
    lendingKeeperIntervalMs: parsePositiveInteger(
      env.LENDING_KEEPER_INTERVAL_MS ?? "3000",
      "LENDING_KEEPER_INTERVAL_MS"
    ),
    lendingKeeperScanLimit: parsePositiveInteger(
      env.LENDING_KEEPER_SCAN_LIMIT ?? "100",
      "LENDING_KEEPER_SCAN_LIMIT"
    ),
    loanSnapshotSyncIntervalMs: parsePositiveInteger(
      env.LOAN_SNAPSHOT_SYNC_INTERVAL_MS ?? "10000",
      "LOAN_SNAPSHOT_SYNC_INTERVAL_MS"
    ),
    loanSnapshotSyncLimit: parsePositiveInteger(
      env.LOAN_SNAPSHOT_SYNC_LIMIT ?? "100",
      "LOAN_SNAPSHOT_SYNC_LIMIT"
    ),
    receiptSweepIntervalMs: parsePositiveInteger(
      env.RECEIPT_SWEEP_INTERVAL_MS ?? "3000",
      "RECEIPT_SWEEP_INTERVAL_MS"
    ),
    receiptSweepLimit: parsePositiveInteger(
      env.RECEIPT_SWEEP_LIMIT ?? "100",
      "RECEIPT_SWEEP_LIMIT"
    ),
    receiptDroppedTimeoutMs: parsePositiveInteger(
      env.RECEIPT_DROPPED_TIMEOUT_MS ?? "60000",
      "RECEIPT_DROPPED_TIMEOUT_MS"
    ),
    marketConfigEventSweepIntervalMs: parsePositiveInteger(
      env.MARKET_CONFIG_EVENT_SWEEP_INTERVAL_MS ?? "3000",
      "MARKET_CONFIG_EVENT_SWEEP_INTERVAL_MS"
    ),
    marketConfigEventSweepLimit: parsePositiveInteger(
      env.MARKET_CONFIG_EVENT_SWEEP_LIMIT ?? "100",
      "MARKET_CONFIG_EVENT_SWEEP_LIMIT"
    ),
  };
}

function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "")
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        throw new Error("CORS_ALLOWED_ORIGINS must contain comma-separated absolute origins.");
      }
    });
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parsePositiveInteger(value: string, key: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${key} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${key} must be a safe integer.`);
  }

  return parsed;
}

function parseAddress(value: string, key: string): Hex {
  try {
    return getAddress(value) as Hex;
  } catch {
    throw new Error(`${key} must be a valid address.`);
  }
}

function parseOptionalPrivateKey(value: string | undefined): Hex | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("EXECUTOR_PRIVATE_KEY must be a 32-byte hex private key.");
  }

  return value as Hex;
}

function parseNonNegativeBigint(value: string, key: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${key} must be a non-negative integer.`);
  }

  return BigInt(value);
}

function parsePositiveBigint(value: string, key: string): bigint {
  const parsed = parseNonNegativeBigint(value, key);
  if (parsed <= 0n) {
    throw new Error(`${key} must be positive.`);
  }

  return parsed;
}
