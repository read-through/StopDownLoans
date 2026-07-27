import type { Hex, SettlementAttempt, SettlementErrorCode } from "../types.js";
import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";
import { mapSettlementAttemptRow, type SettlementAttemptRow } from "./rows.js";

export type CreateSettlementAttemptInput = {
  tradeId: bigint;
  operator: Hex;
};

export async function createSettlementAttempt(
  client: DbClient,
  input: CreateSettlementAttemptInput
): Promise<SettlementAttempt> {
  const result = await client.query<SettlementAttemptRow>(
    `
      INSERT INTO settlement_attempts (
        trade_id,
        operator,
        status
      )
      VALUES ($1, $2, 'CREATED')
      RETURNING
        settlement_attempt_id,
        trade_id,
        operator,
        tx_hash,
        status,
        error_code,
        error_message,
        submitted_at,
        mined_at,
        created_at,
        updated_at
    `,
    [input.tradeId.toString(), hexToBuffer(input.operator)]
  );

  return mapSettlementAttemptRow(result.rows[0]);
}

export async function getSettlementAttemptsByTrade(
  client: DbClient,
  tradeId: bigint
): Promise<SettlementAttempt[]> {
  const result = await client.query<SettlementAttemptRow>(
    `
      SELECT
        settlement_attempt_id,
        trade_id,
        operator,
        tx_hash,
        status,
        error_code,
        error_message,
        submitted_at,
        mined_at,
        created_at,
        updated_at
      FROM settlement_attempts
      WHERE trade_id = $1
      ORDER BY created_at ASC, settlement_attempt_id ASC
    `,
    [tradeId.toString()]
  );

  return result.rows.map(mapSettlementAttemptRow);
}

export async function getSettlementAttemptCountByTrade(
  client: DbClient,
  tradeId: bigint
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM settlement_attempts
      WHERE trade_id = $1
    `,
    [tradeId.toString()]
  );

  return Number(result.rows[0].count);
}

export async function getSettlementAttemptByTxHash(
  client: DbClient,
  txHash: Hex
): Promise<SettlementAttempt | null> {
  const result = await client.query<SettlementAttemptRow>(
    `
      SELECT
        settlement_attempt_id,
        trade_id,
        operator,
        tx_hash,
        status,
        error_code,
        error_message,
        submitted_at,
        mined_at,
        created_at,
        updated_at
      FROM settlement_attempts
      WHERE tx_hash = $1
      ORDER BY created_at DESC, settlement_attempt_id DESC
      LIMIT 1
    `,
    [hexToBuffer(txHash)]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapSettlementAttemptRow(result.rows[0]);
}

export async function getSubmittedSettlementAttemptsForCheck(
  client: DbClient,
  params: {
    limit: number;
  }
): Promise<SettlementAttempt[]> {
  const result = await client.query<SettlementAttemptRow>(
    `
      SELECT
        settlement_attempt_id,
        trade_id,
        operator,
        tx_hash,
        status,
        error_code,
        error_message,
        submitted_at,
        mined_at,
        created_at,
        updated_at
      FROM settlement_attempts
      WHERE status = 'SUBMITTED'
        AND tx_hash IS NOT NULL
      ORDER BY submitted_at ASC, settlement_attempt_id ASC
      LIMIT $1
    `,
    [params.limit]
  );

  return result.rows.map(mapSettlementAttemptRow);
}

export async function markSettlementAttemptSubmitted(
  client: DbClient,
  settlementAttemptId: bigint,
  txHash: Hex
): Promise<SettlementAttempt> {
  return updateSettlementAttempt(client, settlementAttemptId, {
    status: "SUBMITTED",
    txHash,
    submittedAt: new Date(),
  });
}

export async function markSettlementAttemptMined(
  client: DbClient,
  settlementAttemptId: bigint
): Promise<SettlementAttempt> {
  return updateSettlementAttempt(client, settlementAttemptId, {
    status: "MINED",
    minedAt: new Date(),
  });
}

export async function markSettlementAttemptFailed(
  client: DbClient,
  settlementAttemptId: bigint,
  errorCode: SettlementErrorCode,
  errorMessage: string
): Promise<SettlementAttempt> {
  return updateSettlementAttempt(client, settlementAttemptId, {
    status: "FAILED",
    errorCode,
    errorMessage,
  });
}

export async function markSettlementAttemptReverted(
  client: DbClient,
  settlementAttemptId: bigint,
  errorCode: SettlementErrorCode,
  errorMessage: string
): Promise<SettlementAttempt> {
  return updateSettlementAttempt(client, settlementAttemptId, {
    status: "REVERTED",
    errorCode,
    errorMessage,
  });
}

export async function markSettlementAttemptDropped(
  client: DbClient,
  settlementAttemptId: bigint,
  errorCode: SettlementErrorCode,
  errorMessage: string
): Promise<SettlementAttempt> {
  return updateSettlementAttempt(client, settlementAttemptId, {
    status: "DROPPED",
    errorCode,
    errorMessage,
  });
}

async function updateSettlementAttempt(
  client: DbClient,
  settlementAttemptId: bigint,
  patch: {
    status: SettlementAttempt["status"];
    txHash?: Hex;
    submittedAt?: Date;
    minedAt?: Date;
    errorCode?: SettlementErrorCode;
    errorMessage?: string;
  }
): Promise<SettlementAttempt> {
  const result = await client.query<SettlementAttemptRow>(
    `
      UPDATE settlement_attempts
      SET
        status = $2,
        tx_hash = COALESCE($3, tx_hash),
        submitted_at = COALESCE($4, submitted_at),
        mined_at = COALESCE($5, mined_at),
        error_code = COALESCE($6, error_code),
        error_message = COALESCE($7, error_message),
        updated_at = now()
      WHERE settlement_attempt_id = $1
      RETURNING
        settlement_attempt_id,
        trade_id,
        operator,
        tx_hash,
        status,
        error_code,
        error_message,
        submitted_at,
        mined_at,
        created_at,
        updated_at
    `,
    [
      settlementAttemptId.toString(),
      patch.status,
      patch.txHash === undefined ? null : hexToBuffer(patch.txHash),
      patch.submittedAt ?? null,
      patch.minedAt ?? null,
      patch.errorCode ?? null,
      patch.errorMessage ?? null,
    ]
  );

  if (result.rowCount === 0) {
    throw new Error(`Settlement attempt not found: ${settlementAttemptId.toString()}`);
  }

  return mapSettlementAttemptRow(result.rows[0]);
}
