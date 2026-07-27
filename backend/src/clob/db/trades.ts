import type { Hex, Outcome, Trade, TradeFill, TradeStatus } from "../types.js";
import type { DbClient } from "./client.js";
import { bufferToHex, hexToBuffer } from "./hex.js";
import { mapTradeFillRow, mapTradeRow, type TradeFillRow, type TradeRow } from "./rows.js";

export type CreateTradeFillInput = {
  makerOrderHash: Hex;
  makerFillAmount: bigint;
  makerUsdcAmount: bigint;
  makerPriceNumerator: bigint;
  makerPriceDenominator: bigint;
};

export type CreateTradeWithFillsInput = {
  takerOrderHash: Hex;
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
  totalOutcomeAmount: bigint;
  totalUsdcAmount: bigint;
  fills: CreateTradeFillInput[];
};

export type CreatedTradeWithFills = {
  trade: Trade;
  fills: TradeFill[];
};

export type MarketVolume = {
  outcomeToken: Hex;
  marketId: Hex;
  confirmedUsdcVolume: bigint;
};

export async function getTradeById(client: DbClient, tradeId: bigint): Promise<Trade | null> {
  const result = await client.query<TradeRow>(
    `
      SELECT
        trade_id,
        taker_order_hash,
        outcome_token,
        market_id,
        outcome,
        total_outcome_amount,
        total_usdc_amount,
        status,
        tx_hash,
        submitted_at,
        mined_at,
        confirmed_at,
        created_at,
        updated_at
      FROM trades
      WHERE trade_id = $1
    `,
    [tradeId.toString()]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapTradeRow(result.rows[0]);
}

export async function getTradeByTxHash(client: DbClient, txHash: Hex): Promise<Trade | null> {
  const result = await client.query<TradeRow>(
    `
      SELECT
        trade_id,
        taker_order_hash,
        outcome_token,
        market_id,
        outcome,
        total_outcome_amount,
        total_usdc_amount,
        status,
        tx_hash,
        submitted_at,
        mined_at,
        confirmed_at,
        created_at,
        updated_at
      FROM trades
      WHERE tx_hash = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [hexToBuffer(txHash)]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapTradeRow(result.rows[0]);
}

export async function getTradeFillsByTradeId(
  client: DbClient,
  tradeId: bigint
): Promise<TradeFill[]> {
  const result = await client.query<TradeFillRow>(
    `
      SELECT
        trade_fill_id,
        trade_id,
        taker_order_hash,
        maker_order_hash,
        maker_fill_amount,
        maker_usdc_amount,
        maker_price_numerator,
        maker_price_denominator,
        created_at
      FROM trade_fills
      WHERE trade_id = $1
      ORDER BY trade_fill_id ASC
    `,
    [tradeId.toString()]
  );

  return result.rows.map(mapTradeFillRow);
}

export async function getTradesByMarket(
  client: DbClient,
  params: {
    outcomeToken: Hex;
    marketId: Hex;
    outcome: Outcome;
    limit: number;
    cursor?: {
      createdAt: Date;
      tradeId: bigint;
    };
  }
): Promise<Trade[]> {
  const result = await client.query<TradeRow>(
    `
      SELECT
        trade_id,
        taker_order_hash,
        outcome_token,
        market_id,
        outcome,
        total_outcome_amount,
        total_usdc_amount,
        status,
        tx_hash,
        submitted_at,
        mined_at,
        confirmed_at,
        created_at,
        updated_at
      FROM trades
      WHERE outcome_token = $1
        AND market_id = $2
        AND outcome = $3
        AND (
          $5::timestamptz IS NULL
          OR created_at < $5
          OR (created_at = $5 AND trade_id < $6::bigint)
        )
      ORDER BY created_at DESC, trade_id DESC
      LIMIT $4
    `,
    [
      hexToBuffer(params.outcomeToken),
      hexToBuffer(params.marketId),
      outcomeToDb(params.outcome),
      params.limit,
      params.cursor?.createdAt ?? null,
      params.cursor?.tradeId.toString() ?? null,
    ]
  );

  return result.rows.map(mapTradeRow);
}

export async function getConfirmedUsdcVolumeByMarkets(client: DbClient): Promise<MarketVolume[]> {
  const result = await client.query<{
    outcome_token: Buffer;
    market_id: Buffer;
    confirmed_usdc_volume: string;
  }>(
    `
      SELECT
        outcome_token,
        market_id,
        COALESCE(SUM(total_usdc_amount), 0) AS confirmed_usdc_volume
      FROM trades
      WHERE status = 'CONFIRMED'
      GROUP BY outcome_token, market_id
    `
  );

  return result.rows.map((row) => ({
    outcomeToken: bufferToHex(row.outcome_token),
    marketId: bufferToHex(row.market_id),
    confirmedUsdcVolume: BigInt(row.confirmed_usdc_volume),
  }));
}

export async function claimExecutableTradesForExecution(
  client: DbClient,
  params: {
    limit: number;
  }
): Promise<Trade[]> {
  const result = await client.query<TradeRow>(
    `
      WITH executable AS (
        SELECT trade_id
        FROM trades
        WHERE status IN ('MATCHED', 'RETRYING')
        ORDER BY created_at ASC, trade_id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE trades
      SET
        status = 'EXECUTING',
        updated_at = now()
      FROM executable
      WHERE trades.trade_id = executable.trade_id
      RETURNING
        trades.trade_id,
        trades.taker_order_hash,
        trades.outcome_token,
        trades.market_id,
        trades.outcome,
        trades.total_outcome_amount,
        trades.total_usdc_amount,
        trades.status,
        trades.tx_hash,
        trades.submitted_at,
        trades.mined_at,
        trades.confirmed_at,
        trades.created_at,
        trades.updated_at
    `,
    [params.limit]
  );

  return result.rows.map(mapTradeRow);
}

export async function resetStaleExecutingTrades(
  client: DbClient,
  params: {
    staleBefore: Date;
    limit: number;
  }
): Promise<Trade[]> {
  const result = await client.query<TradeRow>(
    `
      WITH stale AS (
        SELECT trade_id
        FROM trades
        WHERE status = 'EXECUTING'
          AND updated_at < $1
        ORDER BY updated_at ASC, trade_id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE trades
      SET
        status = 'RETRYING',
        updated_at = now()
      FROM stale
      WHERE trades.trade_id = stale.trade_id
      RETURNING
        trades.trade_id,
        trades.taker_order_hash,
        trades.outcome_token,
        trades.market_id,
        trades.outcome,
        trades.total_outcome_amount,
        trades.total_usdc_amount,
        trades.status,
        trades.tx_hash,
        trades.submitted_at,
        trades.mined_at,
        trades.confirmed_at,
        trades.created_at,
        trades.updated_at
    `,
    [params.staleBefore, params.limit]
  );

  return result.rows.map(mapTradeRow);
}

export async function createTradeWithFills(
  client: DbClient,
  input: CreateTradeWithFillsInput
): Promise<CreatedTradeWithFills> {
  if (input.fills.length === 0) {
    throw new Error("Trade must have at least one fill.");
  }

  const trade = await insertTrade(client, input);
  const fills: TradeFill[] = [];

  for (const fill of input.fills) {
    fills.push(await insertTradeFill(client, trade.tradeId, input.takerOrderHash, fill));
  }

  return { trade, fills };
}

export async function markTradeSubmitted(
  client: DbClient,
  tradeId: bigint,
  txHash: Hex
): Promise<Trade> {
  return updateTradeStatus(client, tradeId, "SUBMITTED", {
    txHash,
    submittedAt: new Date(),
  });
}

export async function markTradeMined(client: DbClient, tradeId: bigint): Promise<Trade> {
  return updateTradeStatus(client, tradeId, "MINED", {
    minedAt: new Date(),
  });
}

export async function markTradeConfirmed(client: DbClient, tradeId: bigint): Promise<Trade> {
  return updateTradeStatus(client, tradeId, "CONFIRMED", {
    confirmedAt: new Date(),
  });
}

export async function markTradeRetrying(client: DbClient, tradeId: bigint): Promise<Trade> {
  return updateTradeStatus(client, tradeId, "RETRYING");
}

export async function markTradeFailed(client: DbClient, tradeId: bigint): Promise<Trade> {
  return updateTradeStatus(client, tradeId, "FAILED");
}

async function insertTrade(client: DbClient, input: CreateTradeWithFillsInput): Promise<Trade> {
  const result = await client.query<TradeRow>(
    `
      INSERT INTO trades (
        taker_order_hash,
        outcome_token,
        market_id,
        outcome,
        total_outcome_amount,
        total_usdc_amount,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'MATCHED')
      RETURNING
        trade_id,
        taker_order_hash,
        outcome_token,
        market_id,
        outcome,
        total_outcome_amount,
        total_usdc_amount,
        status,
        tx_hash,
        submitted_at,
        mined_at,
        confirmed_at,
        created_at,
        updated_at
    `,
    [
      hexToBuffer(input.takerOrderHash),
      hexToBuffer(input.outcomeToken),
      hexToBuffer(input.marketId),
      outcomeToDb(input.outcome),
      input.totalOutcomeAmount.toString(),
      input.totalUsdcAmount.toString(),
    ]
  );

  return mapTradeRow(result.rows[0]);
}

async function insertTradeFill(
  client: DbClient,
  tradeId: bigint,
  takerOrderHash: Hex,
  fill: CreateTradeFillInput
): Promise<TradeFill> {
  const result = await client.query<TradeFillRow>(
    `
      INSERT INTO trade_fills (
        trade_id,
        taker_order_hash,
        maker_order_hash,
        maker_fill_amount,
        maker_usdc_amount,
        maker_price_numerator,
        maker_price_denominator
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        trade_fill_id,
        trade_id,
        taker_order_hash,
        maker_order_hash,
        maker_fill_amount,
        maker_usdc_amount,
        maker_price_numerator,
        maker_price_denominator,
        created_at
    `,
    [
      tradeId.toString(),
      hexToBuffer(takerOrderHash),
      hexToBuffer(fill.makerOrderHash),
      fill.makerFillAmount.toString(),
      fill.makerUsdcAmount.toString(),
      fill.makerPriceNumerator.toString(),
      fill.makerPriceDenominator.toString(),
    ]
  );

  return mapTradeFillRow(result.rows[0]);
}

async function updateTradeStatus(
  client: DbClient,
  tradeId: bigint,
  status: TradeStatus,
  patch: {
    txHash?: Hex;
    submittedAt?: Date;
    minedAt?: Date;
    confirmedAt?: Date;
  } = {}
): Promise<Trade> {
  const result = await client.query<TradeRow>(
    `
      UPDATE trades
      SET
        status = $2,
        tx_hash = COALESCE($3, tx_hash),
        submitted_at = COALESCE($4, submitted_at),
        mined_at = COALESCE($5, mined_at),
        confirmed_at = COALESCE($6, confirmed_at),
        updated_at = now()
      WHERE trade_id = $1
      RETURNING
        trade_id,
        taker_order_hash,
        outcome_token,
        market_id,
        outcome,
        total_outcome_amount,
        total_usdc_amount,
        status,
        tx_hash,
        submitted_at,
        mined_at,
        confirmed_at,
        created_at,
        updated_at
    `,
    [
      tradeId.toString(),
      status,
      patch.txHash === undefined ? null : hexToBuffer(patch.txHash),
      patch.submittedAt ?? null,
      patch.minedAt ?? null,
      patch.confirmedAt ?? null,
    ]
  );

  if (result.rowCount === 0) {
    throw new Error(`Trade not found: ${tradeId.toString()}`);
  }

  return mapTradeRow(result.rows[0]);
}

function outcomeToDb(outcome: Outcome): number {
  return outcome === "YES" ? 0 : 1;
}
