import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadClobBackendConfig } from "../../src/clob/config.js";

describe("loadClobBackendConfig", () => {
  it("loads required CLOB backend env values", () => {
    assert.deepEqual(
      loadClobBackendConfig({
        DATABASE_URL: "postgres://stopdown:stopdown@localhost:5432/stopdown",
        ARC_RPC_URL: "https://rpc.example",
        ARC_CHAIN_ID: "5042002",
        LOAN_POSITION_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000003",
        OUTCOME_EXCHANGE_ADDRESS: "0x0000000000000000000000000000000000000001",
        USDC_ADDRESS: "0x0000000000000000000000000000000000000002",
        EXPIRED_ORDER_SWEEP_INTERVAL_MS: "5000",
        EXPIRED_ORDER_SWEEP_LIMIT: "100",
        RECONCILIATION_INTERVAL_MS: "3000",
        RECONCILIATION_CONFIRMATION_DEPTH: "1",
        RECONCILIATION_START_BLOCK: "0",
        RECONCILIATION_MAX_BLOCKS_PER_RUN: "1000",
        EXECUTOR_PRIVATE_KEY: "",
        EXECUTOR_INTERVAL_MS: "1000",
        EXECUTOR_BATCH_LIMIT: "10",
        EXECUTOR_EXECUTING_TRADE_TIMEOUT_MS: "60000",
        LENDING_KEEPER_INTERVAL_MS: "3000",
        LENDING_KEEPER_SCAN_LIMIT: "100",
        RECEIPT_SWEEP_INTERVAL_MS: "3000",
        RECEIPT_SWEEP_LIMIT: "100",
        RECEIPT_DROPPED_TIMEOUT_MS: "60000",
        MARKET_CONFIG_EVENT_SWEEP_INTERVAL_MS: "3000",
        MARKET_CONFIG_EVENT_SWEEP_LIMIT: "100",
        LOAN_SNAPSHOT_SYNC_INTERVAL_MS: "3000",
        LOAN_SNAPSHOT_SYNC_LIMIT: "100",
      }),
      {
        databaseUrl: "postgres://stopdown:stopdown@localhost:5432/stopdown",
        arcRpcUrl: "https://rpc.example",
        chainId: 5042002,
        loanPositionToken: "0x0000000000000000000000000000000000000003",
        outcomeExchange: "0x0000000000000000000000000000000000000001",
        usdc: "0x0000000000000000000000000000000000000002",
        expiredOrderSweepIntervalMs: 5000,
        expiredOrderSweepLimit: 100,
        reconciliationIntervalMs: 3000,
        reconciliationConfirmationDepth: 1n,
        reconciliationStartBlock: 0n,
        reconciliationMaxBlocksPerRun: 1000n,
        executorPrivateKey: null,
        executorIntervalMs: 1000,
        executorBatchLimit: 10,
        executorExecutingTradeTimeoutMs: 60000,
        lendingKeeperIntervalMs: 3000,
        lendingKeeperScanLimit: 100,
        receiptSweepIntervalMs: 3000,
        receiptSweepLimit: 100,
        receiptDroppedTimeoutMs: 60000,
        marketConfigEventSweepIntervalMs: 3000,
        marketConfigEventSweepLimit: 100,
        loanSnapshotSyncIntervalMs: 3000,
        loanSnapshotSyncLimit: 100,
      }
    );
  });

  it("rejects missing required values", () => {
    assert.throws(() => loadClobBackendConfig({}), /DATABASE_URL/);
  });
});
