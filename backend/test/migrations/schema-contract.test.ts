import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentFile = fileURLToPath(import.meta.url);
const migrationsDir = path.resolve(path.dirname(currentFile), "../../migrations");

const expectedTableColumns: Record<string, string[]> = {
  orders: [
    "order_hash",
    "maker",
    "outcome_token",
    "market_id",
    "outcome",
    "side",
    "outcome_amount",
    "usdc_amount",
    "expiration",
    "nonce",
    "signature",
    "time_in_force",
    "remaining_outcome_amount",
    "pending_matched_outcome_amount",
    "status",
    "accepted_sequence",
    "created_at",
    "updated_at",
  ],
  reservations: [
    "maker",
    "asset_type",
    "asset_address",
    "token_id",
    "reserved_amount",
    "updated_at",
  ],
  trades: [
    "trade_id",
    "taker_order_hash",
    "outcome_token",
    "market_id",
    "outcome",
    "total_outcome_amount",
    "total_usdc_amount",
    "status",
    "tx_hash",
    "submitted_at",
    "mined_at",
    "confirmed_at",
    "created_at",
    "updated_at",
  ],
  trade_fills: [
    "trade_fill_id",
    "trade_id",
    "taker_order_hash",
    "maker_order_hash",
    "maker_fill_amount",
    "maker_usdc_amount",
    "maker_price_numerator",
    "maker_price_denominator",
    "created_at",
  ],
  settlement_attempts: [
    "settlement_attempt_id",
    "trade_id",
    "operator",
    "tx_hash",
    "status",
    "error_code",
    "error_message",
    "submitted_at",
    "mined_at",
    "created_at",
    "updated_at",
  ],
  market_configs: [
    "outcome_token",
    "market_id",
    "clob_enabled",
    "default_tick_units",
    "edge_tick_units",
    "lower_edge_price_units",
    "upper_edge_price_units",
    "min_order_outcome_amount",
    "max_order_outcome_amount",
    "created_at",
    "updated_at",
  ],
  processed_chain_events: [
    "tx_hash",
    "log_index",
    "block_number",
    "event_name",
    "processed_at",
  ],
  backend_cursors: ["cursor_name", "block_number", "updated_at"],
  market_config_events: [
    "market_config_event_id",
    "outcome_token",
    "market_id",
    "event_type",
    "default_tick_units",
    "edge_tick_units",
    "lower_edge_price_units",
    "upper_edge_price_units",
    "created_at",
    "processed_at",
  ],
  loan_snapshots: [
    "loan_id",
    "borrower",
    "principal",
    "repayment_amount",
    "loan_withdraw_freeze_deadline",
    "activation_deadline",
    "repayment_deadline",
    "funded_amount",
    "credited_amount",
    "repayment_satisfied_at",
    "fee_claimed_amount",
    "state",
    "interest_bps",
    "fee_bps",
    "fee_recipient",
    "collateral_bps",
    "borrower_collateral_amount",
    "borrower_collateral_deposited_amount",
    "market_id",
    "synced_at",
    "updated_at",
  ],
};

const expectedIndexes = [
  "orders_book_live_idx",
  "orders_maker_status_idx",
  "orders_expiration_idx",
  "processed_chain_events_block_idx",
  "market_configs_pagination_idx",
  "trades_status_idx",
  "trades_market_idx",
  "trades_tx_hash_idx",
  "trade_fills_trade_idx",
  "trade_fills_taker_idx",
  "trade_fills_maker_idx",
  "settlement_attempts_trade_idx",
  "settlement_attempts_status_idx",
  "settlement_attempts_tx_hash_idx",
  "market_config_events_unprocessed_idx",
  "loan_snapshots_market_idx",
  "loan_snapshots_state_idx",
];

describe("CLOB migration schema contract", () => {
  it("contains the columns expected by repositories and row mappers", async () => {
    const sql = await readAllMigrationSql();
    const tables = parseCreateTableColumns(sql);

    for (const [tableName, expectedColumns] of Object.entries(expectedTableColumns)) {
      assert.ok(tables.has(tableName), `Missing table ${tableName}`);
      assert.deepEqual(tables.get(tableName), expectedColumns, `Column mismatch for ${tableName}`);
    }
  });

  it("contains the indexes expected by query and worker paths", async () => {
    const sql = await readAllMigrationSql();
    const indexes = parseIndexNames(sql);

    for (const expectedIndex of expectedIndexes) {
      assert.ok(indexes.has(expectedIndex), `Missing index ${expectedIndex}`);
    }
  });
});

async function readAllMigrationSql(): Promise<string> {
  const files = ["001_init_clob.sql", "002_loan_snapshots.sql"];
  const contents = await Promise.all(files.map((file) => readFile(path.join(migrationsDir, file), "utf8")));
  return contents.join("\n");
}

function parseCreateTableColumns(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const tablePattern = /CREATE TABLE ([a-z_]+) \(([\s\S]*?)\n\);/g;

  for (const match of sql.matchAll(tablePattern)) {
    const tableName = match[1];
    const columns = match[2]
      .split("\n")
      .map((line) => line.trim())
      .slice(0, firstConstraintIndex(match[2]))
      .filter((line) => line !== "")
      .map((line) => line.split(/\s+/)[0].replace(/,$/, ""));

    tables.set(tableName, columns);
  }

  return tables;
}

function firstConstraintIndex(tableBody: string): number {
  const lines = tableBody.split("\n").map((line) => line.trim());
  const index = lines.findIndex((line) => line.startsWith("CONSTRAINT") || line.startsWith("PRIMARY KEY"));

  return index === -1 ? lines.length : index;
}

function parseIndexNames(sql: string): Set<string> {
  const indexes = new Set<string>();
  const indexPattern = /CREATE INDEX ([a-z_]+)/g;

  for (const match of sql.matchAll(indexPattern)) {
    indexes.add(match[1]);
  }

  return indexes;
}
