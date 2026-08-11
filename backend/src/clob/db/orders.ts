import type { ClobOrder, Hex, OrderStatus, Outcome, SubmitOrderInput } from "../types.js";
import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";
import { mapOrderRow, type OrderRow } from "./rows.js";
import type { ReservationKey } from "./reservations.js";

export type InsertOrderInput = SubmitOrderInput & {
  orderHash: Hex;
};

export async function getOrderByHash(client: DbClient, orderHash: Hex): Promise<ClobOrder | null> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE order_hash = $1
    `,
    [hexToBuffer(orderHash)]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapOrderRow(result.rows[0]);
}

export async function getOrderByHashForUpdate(
  client: DbClient,
  orderHash: Hex
): Promise<ClobOrder | null> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE order_hash = $1
      FOR UPDATE
    `,
    [hexToBuffer(orderHash)]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapOrderRow(result.rows[0]);
}

export async function getLiveOrdersForBook(
  client: DbClient,
  outcomeToken: Hex,
  marketId: Hex,
  outcome: Outcome
): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE outcome_token = $1
        AND market_id = $2
        AND outcome = $3
        AND status = 'LIVE'
        AND remaining_outcome_amount > pending_matched_outcome_amount
      ORDER BY accepted_sequence ASC
    `,
    [hexToBuffer(outcomeToken), hexToBuffer(marketId), outcomeToDb(outcome)]
  );

  return result.rows.map(mapOrderRow);
}

export async function getLiveOrdersForOutcome(client: DbClient, outcome: Outcome): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE outcome = $1
        AND status = 'LIVE'
        AND remaining_outcome_amount > pending_matched_outcome_amount
      ORDER BY accepted_sequence ASC
    `,
    [outcomeToDb(outcome)]
  );

  return result.rows.map(mapOrderRow);
}

export async function getOpenOrdersByMaker(client: DbClient, maker: Hex): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE maker = $1
        AND status = 'LIVE'
        AND remaining_outcome_amount > 0
      ORDER BY created_at DESC, accepted_sequence DESC
    `,
    [hexToBuffer(maker)]
  );

  return result.rows.map(mapOrderRow);
}

export async function getOrdersByMaker(
  client: DbClient,
  params: {
    maker: Hex;
    status?: OrderStatus;
    limit: number;
    cursor?: {
      createdAt: Date;
      acceptedSequence: bigint;
    };
  }
): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE maker = $1
        AND ($2::text IS NULL OR status = $2)
        AND (
          $4::timestamptz IS NULL
          OR created_at < $4
          OR (created_at = $4 AND accepted_sequence < $5::bigint)
        )
      ORDER BY created_at DESC, accepted_sequence DESC
      LIMIT $3
    `,
    [
      hexToBuffer(params.maker),
      params.status ?? null,
      params.limit,
      params.cursor?.createdAt ?? null,
      params.cursor?.acceptedSequence.toString() ?? null,
    ]
  );

  return result.rows.map(mapOrderRow);
}

export async function getMakerCandidatesForTaker(
  client: DbClient,
  taker: Pick<ClobOrder, "orderHash" | "outcomeToken" | "marketId" | "outcome" | "side">
): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE outcome_token = $1
        AND market_id = $2
        AND outcome = $3
        AND side = $4
        AND status = 'LIVE'
        AND order_hash != $5
        AND remaining_outcome_amount > pending_matched_outcome_amount
      ORDER BY accepted_sequence ASC
    `,
    [
      hexToBuffer(taker.outcomeToken),
      hexToBuffer(taker.marketId),
      outcomeToDb(taker.outcome),
      sideToDb(taker.side === "BUY" ? "SELL" : "BUY"),
      hexToBuffer(taker.orderHash),
    ]
  );

  return result.rows.map(mapOrderRow);
}

export async function getExpiredAvailableOrdersForUpdate(
  client: DbClient,
  params: {
    now: Date;
    limit: number;
  }
): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE status = 'LIVE'
        AND expiration < $1
        AND remaining_outcome_amount > pending_matched_outcome_amount
      ORDER BY expiration ASC, accepted_sequence ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `,
    [params.now, params.limit]
  );

  return result.rows.map(mapOrderRow);
}

export async function getLiveOrdersForReservationForUpdate(
  client: DbClient,
  key: ReservationKey
): Promise<ClobOrder[]> {
  const result = await client.query<OrderRow>(
    `
      SELECT
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
      FROM orders
      WHERE maker = $1
        AND status = 'LIVE'
        AND remaining_outcome_amount > pending_matched_outcome_amount
        AND side = $2
        AND ($3::bytea IS NULL OR outcome_token = $3)
      ORDER BY accepted_sequence DESC
      FOR UPDATE
    `,
    [
      hexToBuffer(key.maker),
      sideToDb(key.assetType === "ERC20" ? "BUY" : "SELL"),
      key.assetType === "ERC1155" ? hexToBuffer(key.assetAddress) : null,
    ]
  );

  return result.rows.map(mapOrderRow);
}

export async function insertOrder(client: DbClient, input: InsertOrderInput): Promise<ClobOrder> {
  const result = await client.query<OrderRow>(
    `
      INSERT INTO orders (
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        0,
        'LIVE'
      )
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [
      hexToBuffer(input.orderHash),
      hexToBuffer(input.order.maker),
      hexToBuffer(input.order.outcomeToken),
      hexToBuffer(input.order.marketId),
      outcomeToDb(input.order.outcome),
      sideToDb(input.order.side),
      input.order.outcomeAmount.toString(),
      input.order.usdcAmount.toString(),
      input.order.expiration,
      input.order.nonce.toString(),
      hexToBuffer(input.signature),
      input.timeInForce,
      input.order.outcomeAmount.toString(),
    ]
  );

  return mapOrderRow(result.rows[0]);
}

export async function increaseOrderPending(
  client: DbClient,
  orderHash: Hex,
  amount: bigint
): Promise<ClobOrder> {
  assertPositiveAmount(amount);

  const result = await client.query<OrderRow>(
    `
      UPDATE orders
      SET
        pending_matched_outcome_amount = pending_matched_outcome_amount + $2,
        updated_at = now()
      WHERE order_hash = $1
        AND status = 'LIVE'
        AND pending_matched_outcome_amount + $2 <= remaining_outcome_amount
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [hexToBuffer(orderHash), amount.toString()]
  );

  if (result.rowCount === 0) {
    throw new Error(`Cannot increase pending amount for order: ${orderHash}`);
  }

  return mapOrderRow(result.rows[0]);
}

export async function releaseOrderPending(
  client: DbClient,
  orderHash: Hex,
  amount: bigint
): Promise<ClobOrder> {
  assertPositiveAmount(amount);

  const result = await client.query<OrderRow>(
    `
      UPDATE orders
      SET
        pending_matched_outcome_amount = pending_matched_outcome_amount - $2,
        updated_at = now()
      WHERE order_hash = $1
        AND status IN ('LIVE', 'CANCELLED', 'EXPIRED', 'FAILED')
        AND pending_matched_outcome_amount >= $2
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [hexToBuffer(orderHash), amount.toString()]
  );

  if (result.rowCount === 0) {
    throw new Error(`Cannot release pending amount for order: ${orderHash}`);
  }

  return mapOrderRow(result.rows[0]);
}

export async function confirmOrderFill(
  client: DbClient,
  orderHash: Hex,
  fillAmount: bigint
): Promise<ClobOrder> {
  assertPositiveAmount(fillAmount);

  const result = await client.query<OrderRow>(
    `
      UPDATE orders
      SET
        remaining_outcome_amount = remaining_outcome_amount - $2,
        pending_matched_outcome_amount = GREATEST(pending_matched_outcome_amount - $2, 0),
        status = CASE
          WHEN remaining_outcome_amount - $2 = 0 THEN 'FILLED'
          ELSE status
        END,
        updated_at = now()
      WHERE order_hash = $1
        AND status IN ('LIVE', 'CANCELLED', 'EXPIRED', 'FAILED')
        AND remaining_outcome_amount >= $2
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [hexToBuffer(orderHash), fillAmount.toString()]
  );

  if (result.rowCount === 0) {
    throw new Error(`Cannot confirm fill for order: ${orderHash}`);
  }

  return mapOrderRow(result.rows[0]);
}

export async function cancelOrderAvailableRemainder(
  client: DbClient,
  orderHash: Hex
): Promise<ClobOrder> {
  const result = await client.query<OrderRow>(
    `
      UPDATE orders
      SET
        status = 'CANCELLED',
        updated_at = now()
      WHERE order_hash = $1
        AND status = 'LIVE'
        AND remaining_outcome_amount > 0
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [hexToBuffer(orderHash)]
  );

  if (result.rowCount === 0) {
    throw new Error(`Cannot cancel order: ${orderHash}`);
  }

  return mapOrderRow(result.rows[0]);
}

export async function expireOrderAvailableRemainder(
  client: DbClient,
  orderHash: Hex,
  now: Date
): Promise<ClobOrder> {
  const result = await client.query<OrderRow>(
    `
      UPDATE orders
      SET
        status = 'EXPIRED',
        updated_at = now()
      WHERE order_hash = $1
        AND status = 'LIVE'
        AND expiration < $2
        AND remaining_outcome_amount > 0
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [hexToBuffer(orderHash), now]
  );

  if (result.rowCount === 0) {
    throw new Error(`Cannot expire order: ${orderHash}`);
  }

  return mapOrderRow(result.rows[0]);
}

export async function markOrderFailed(client: DbClient, orderHash: Hex): Promise<ClobOrder> {
  const result = await client.query<OrderRow>(
    `
      UPDATE orders
      SET
        status = 'FAILED',
        updated_at = now()
      WHERE order_hash = $1
        AND status IN ('LIVE', 'CANCELLED', 'EXPIRED')
      RETURNING
        order_hash,
        maker,
        outcome_token,
        market_id,
        outcome,
        side,
        outcome_amount,
        usdc_amount,
        expiration,
        nonce,
        signature,
        time_in_force,
        remaining_outcome_amount,
        pending_matched_outcome_amount,
        status,
        accepted_sequence,
        created_at,
        updated_at
    `,
    [hexToBuffer(orderHash)]
  );

  if (result.rowCount === 0) {
    throw new Error(`Cannot mark order failed: ${orderHash}`);
  }

  return mapOrderRow(result.rows[0]);
}

function outcomeToDb(outcome: Outcome): number {
  return outcome === "YES" ? 0 : 1;
}

function sideToDb(side: SubmitOrderInput["order"]["side"]): number {
  return side === "BUY" ? 0 : 1;
}

function assertPositiveAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error(`Order amount must be positive: ${amount.toString()}`);
  }
}
