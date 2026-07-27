import type { Hex } from "../types.js";
import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";

export type ChainEventName = "OrderFilled" | "OrdersMatched";

export type ProcessedChainEventInput = {
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  eventName: ChainEventName;
};

export async function tryInsertProcessedChainEvent(
  client: DbClient,
  event: ProcessedChainEventInput
): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO processed_chain_events (
        tx_hash,
        log_index,
        block_number,
        event_name
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tx_hash, log_index) DO NOTHING
    `,
    [
      hexToBuffer(event.txHash),
      event.logIndex,
      event.blockNumber.toString(),
      event.eventName,
    ]
  );

  return result.rowCount === 1;
}

export async function getBackendCursor(
  client: DbClient,
  cursorName: string
): Promise<bigint | null> {
  const result = await client.query<{ block_number: string }>(
    `
      SELECT block_number
      FROM backend_cursors
      WHERE cursor_name = $1
    `,
    [cursorName]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return BigInt(result.rows[0].block_number);
}

export async function upsertBackendCursor(
  client: DbClient,
  cursorName: string,
  blockNumber: bigint
): Promise<bigint> {
  const result = await client.query<{ block_number: string }>(
    `
      INSERT INTO backend_cursors (
        cursor_name,
        block_number
      )
      VALUES ($1, $2)
      ON CONFLICT (cursor_name)
      DO UPDATE SET
        block_number = GREATEST(backend_cursors.block_number, EXCLUDED.block_number),
        updated_at = now()
      RETURNING block_number
    `,
    [cursorName, blockNumber.toString()]
  );

  return BigInt(result.rows[0].block_number);
}
