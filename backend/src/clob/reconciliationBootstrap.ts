import type { PublicClient } from "viem";
import { getBackendCursor, upsertBackendCursor } from "./db/chainEvents.js";
import type { DbClient } from "./db/client.js";
import { OUTCOME_EXCHANGE_EVENTS_CURSOR } from "./reconciliationLoop.js";

const BOOTSTRAP_LOCK_NAME = "stopdown_reconciliation_bootstrap";

export type ReconciliationBootstrapResult =
  | { status: "existing"; blockNumber: bigint }
  | { status: "initialized"; blockNumber: bigint };

export async function bootstrapReconciliationCursor(input: {
  dbClient: DbClient;
  publicClient: Pick<PublicClient, "getBlockNumber">;
  confirmationDepth: bigint;
  cursorName?: string;
}): Promise<ReconciliationBootstrapResult> {
  const cursorName = input.cursorName ?? OUTCOME_EXCHANGE_EVENTS_CURSOR;

  await input.dbClient.query("SELECT pg_advisory_xact_lock(hashtext($1))", [BOOTSTRAP_LOCK_NAME]);

  const existingCursor = await getBackendCursor(input.dbClient, cursorName);
  if (existingCursor !== null) {
    return { status: "existing", blockNumber: existingCursor };
  }

  if (await hasTradingState(input.dbClient)) {
    throw new Error(
      `Reconciliation cursor ${cursorName} is missing for a non-empty trading database.`
    );
  }

  const latestBlock = await input.publicClient.getBlockNumber();
  const safeHead =
    latestBlock >= input.confirmationDepth ? latestBlock - input.confirmationDepth : 0n;
  const blockNumber = await upsertBackendCursor(input.dbClient, cursorName, safeHead);

  return { status: "initialized", blockNumber };
}

async function hasTradingState(dbClient: DbClient): Promise<boolean> {
  const result = await dbClient.query<{ has_trading_state: boolean }>(`
    SELECT (
      EXISTS (SELECT 1 FROM orders)
      OR EXISTS (SELECT 1 FROM trades)
      OR EXISTS (SELECT 1 FROM settlement_attempts)
      OR EXISTS (SELECT 1 FROM processed_chain_events)
      OR EXISTS (SELECT 1 FROM reservations WHERE reserved_amount > 0)
    ) AS has_trading_state
  `);

  return result.rows[0]?.has_trading_state ?? false;
}
