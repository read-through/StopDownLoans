import { tryInsertProcessedChainEvent } from "./db/chainEvents.js";
import { confirmOrderFill, getOrderByHashForUpdate } from "./db/orders.js";
import { decreaseReservation } from "./db/reservations.js";
import {
  getSettlementAttemptByTxHash,
  markSettlementAttemptMined,
} from "./db/settlementAttempts.js";
import { getTradeByTxHash, markTradeConfirmed } from "./db/trades.js";
import { calculateConfirmedFillReservationRelease } from "./reservationAccounting.js";
import { buildOrderReservationKey } from "./reservationKeys.js";
import type { DbClient } from "./db/client.js";
import type { ClobOrder, Hex, SettlementAttempt, Trade } from "./types.js";

export type OrderFilledEvent = {
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  orderHash: Hex;
  totalFilledAmount: bigint;
};

export type ApplyOrderFilledEventResult =
  | {
      applied: false;
      reason: "ALREADY_PROCESSED" | "NO_NEW_FILL";
    }
  | {
      applied: true;
      confirmedFillDelta: bigint;
      order: ClobOrder;
    };

export type OrdersMatchedEvent = {
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  takerOrderHash: Hex;
  totalOutcomeAmount: bigint;
  totalUsdcAmount: bigint;
};

export type ApplyOrdersMatchedEventResult =
  | {
      applied: false;
      reason: "ALREADY_PROCESSED";
    }
  | {
      applied: true;
      trade: Trade;
      attempt: SettlementAttempt | null;
    };

export type ApplyOrderFilledEventOptions = {
  usdc: Hex;
  getOutcomeTokenId: (params: {
    outcomeToken: Hex;
    marketId: Hex;
    outcome: ClobOrder["outcome"];
  }) => Promise<bigint>;
};

export async function applyOrderFilledEvent(
  client: DbClient,
  event: OrderFilledEvent,
  options: ApplyOrderFilledEventOptions
): Promise<ApplyOrderFilledEventResult> {
  const inserted = await tryInsertProcessedChainEvent(client, {
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    eventName: "OrderFilled",
  });

  if (!inserted) {
    return {
      applied: false,
      reason: "ALREADY_PROCESSED",
    };
  }

  const order = await getOrderByHashForUpdate(client, event.orderHash);
  if (order === null) {
    throw new Error(`Order not found for OrderFilled event: ${event.orderHash}`);
  }

  const confirmedFillDelta = calculateConfirmedFillDelta(order, event.totalFilledAmount);
  if (confirmedFillDelta === 0n) {
    return {
      applied: false,
      reason: "NO_NEW_FILL",
    };
  }

  const reservationRelease = calculateConfirmedFillReservationRelease(order, confirmedFillDelta);
  const outcomeTokenId =
    order.side === "SELL"
      ? await options.getOutcomeTokenId({
          outcomeToken: order.outcomeToken,
          marketId: order.marketId,
          outcome: order.outcome,
        })
      : 0n;

  await decreaseReservation(
    client,
    buildOrderReservationKey(order, {
      usdc: options.usdc,
      outcomeTokenId,
    }),
    reservationRelease
  );

  const updatedOrder = await confirmOrderFill(client, event.orderHash, confirmedFillDelta);

  return {
    applied: true,
    confirmedFillDelta,
    order: updatedOrder,
  };
}

export async function applyOrdersMatchedEvent(
  client: DbClient,
  event: OrdersMatchedEvent
): Promise<ApplyOrdersMatchedEventResult> {
  const inserted = await tryInsertProcessedChainEvent(client, {
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    eventName: "OrdersMatched",
  });

  if (!inserted) {
    return {
      applied: false,
      reason: "ALREADY_PROCESSED",
    };
  }

  const trade = await getTradeByTxHash(client, event.txHash);
  if (trade === null) {
    throw new Error(`Trade not found for OrdersMatched event tx: ${event.txHash}`);
  }

  assertOrdersMatchedEventMatchesTrade(event, trade);
  const attempt = await getSettlementAttemptByTxHash(client, event.txHash);
  const minedAttempt =
    attempt === null
      ? null
      : await markSettlementAttemptMined(client, attempt.settlementAttemptId);

  return {
    applied: true,
    trade: await markTradeConfirmed(client, trade.tradeId),
    attempt: minedAttempt,
  };
}

export function calculateConfirmedFillDelta(
  order: Pick<ClobOrder, "outcomeAmount" | "remainingOutcomeAmount">,
  totalFilledAmount: bigint
): bigint {
  const backendPreviouslyConfirmedFilled = order.outcomeAmount - order.remainingOutcomeAmount;

  if (totalFilledAmount <= backendPreviouslyConfirmedFilled) {
    return 0n;
  }

  return totalFilledAmount - backendPreviouslyConfirmedFilled;
}

export function assertOrdersMatchedEventMatchesTrade(
  event: Pick<OrdersMatchedEvent, "takerOrderHash" | "totalOutcomeAmount" | "totalUsdcAmount">,
  trade: Pick<Trade, "takerOrderHash" | "totalOutcomeAmount" | "totalUsdcAmount">
): void {
  if (event.takerOrderHash !== trade.takerOrderHash) {
    throw new Error("OrdersMatched taker order hash does not match trade.");
  }

  if (event.totalOutcomeAmount !== trade.totalOutcomeAmount) {
    throw new Error("OrdersMatched total outcome amount does not match trade.");
  }

  if (event.totalUsdcAmount !== trade.totalUsdcAmount) {
    throw new Error("OrdersMatched total USDC amount does not match trade.");
  }
}
