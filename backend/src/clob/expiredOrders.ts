import type { PublicClient } from "viem";
import { type BookFeedPublisher } from "./api/bookFeedPublisher.js";
import { getOutcomeTokenId } from "./chain/contracts.js";
import { withTransaction, type DbClient } from "./db/client.js";
import { expireOrderAvailableRemainder, getExpiredAvailableOrdersForUpdate } from "./db/orders.js";
import { decreaseReservation } from "./db/reservations.js";
import { calculateAvailableRemainderReservationRelease } from "./reservationAccounting.js";
import { buildOrderReservationKey } from "./reservationKeys.js";
import { getAvailableForMatching, type ClobOrder, type Hex } from "./types.js";

export type SweepExpiredOrdersInput = {
  now: Date;
  usdc: Hex;
  publicClient: PublicClient;
  limit: number;
  bookFeedPublisher?: BookFeedPublisher;
};

export type ExpiredOrderSweepItem = {
  order: ClobOrder;
  expiredAvailableOutcomeAmount: bigint;
  reservationReleaseAmount: bigint;
};

export type SweepExpiredOrdersResult = {
  expired: ExpiredOrderSweepItem[];
};

export async function sweepExpiredOrders(
  input: SweepExpiredOrdersInput
): Promise<SweepExpiredOrdersResult> {
  const result = await withTransaction((client) => sweepExpiredOrdersTx(client, input));

  for (const item of result.expired) {
    await input.bookFeedPublisher?.publishBookUpdate({
      outcomeToken: item.order.outcomeToken,
      marketId: item.order.marketId,
      outcome: item.order.outcome,
    });
  }

  return result;
}

export async function sweepExpiredOrdersTx(
  client: DbClient,
  input: SweepExpiredOrdersInput
): Promise<SweepExpiredOrdersResult> {
  assertPositiveLimit(input.limit);

  const orders = await getExpiredAvailableOrdersForUpdate(client, {
    now: input.now,
    limit: input.limit,
  });
  const expired: ExpiredOrderSweepItem[] = [];

  for (const order of orders) {
    expired.push(await expireOneOrder(client, order, input));
  }

  return { expired };
}

function assertPositiveLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(`Expired order sweep limit must be positive: ${limit}`);
  }
}

async function expireOneOrder(
  client: DbClient,
  order: ClobOrder,
  input: SweepExpiredOrdersInput
): Promise<ExpiredOrderSweepItem> {
  const expiredAvailableOutcomeAmount = getAvailableForMatching(order);
  const reservationReleaseAmount = calculateAvailableRemainderReservationRelease(order);

  if (reservationReleaseAmount > 0n) {
    const outcomeTokenId =
      order.side === "SELL"
        ? await getOutcomeTokenId(input.publicClient, order.outcomeToken, order.marketId, order.outcome)
        : 0n;

    await decreaseReservation(
      client,
      buildOrderReservationKey(order, {
        usdc: input.usdc,
        outcomeTokenId,
      }),
      reservationReleaseAmount
    );
  }

  return {
    order: await expireOrderAvailableRemainder(client, order.orderHash, input.now),
    expiredAvailableOutcomeAmount,
    reservationReleaseAmount,
  };
}

export function startExpiredOrderSweepLoop(options: {
  intervalMs: number;
  sweep: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error(`Expired order sweep interval must be positive: ${options.intervalMs}`);
  }

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    options.sweep().then(
      () => {
        running = false;
      },
      (error) => {
        running = false;
        options.onError?.(error);
      }
    );
  }, options.intervalMs);

  return () => clearInterval(timer);
}
