import { getAddress } from "viem";
import type { PublicClient } from "viem";
import { getOutcomeTokenId } from "./chain/contracts.js";
import { withTransaction, type DbClient } from "./db/client.js";
import { cancelOrderAvailableRemainder, getOrderByHashForUpdate } from "./db/orders.js";
import { decreaseReservation } from "./db/reservations.js";
import { ClobError } from "./errors.js";
import { assertValidCancelOrderSignature, type OutcomeExchangeDomain } from "./orderSigning.js";
import { calculateAvailableRemainderReservationRelease } from "./reservationAccounting.js";
import { buildOrderReservationKey } from "./reservationKeys.js";
import { getAvailableForMatching, type CancelOrderInput, type ClobOrder, type Hex } from "./types.js";

export type CancelOrderServiceInput = {
  cancel: CancelOrderInput;
  signature: Hex;
  domain: OutcomeExchangeDomain;
  usdc: Hex;
  now: Date;
  publicClient: PublicClient;
};

export type CancelOrderServiceResult = {
  order: ClobOrder;
  cancelledAvailableOutcomeAmount: bigint;
  reservationReleaseAmount: bigint;
};

export async function cancelOrder(
  input: CancelOrderServiceInput
): Promise<CancelOrderServiceResult> {
  return withTransaction((client) => cancelOrderTx(client, input));
}

export async function cancelOrderTx(
  client: DbClient,
  input: CancelOrderServiceInput
): Promise<CancelOrderServiceResult> {
  assertCancelNotExpired(input.cancel, input.now);
  await assertValidCancelOrderSignature(input.cancel, input.signature, input.domain);

  const order = await getOrderByHashForUpdate(client, input.cancel.orderHash);
  if (order === null) {
    throw new ClobError("ORDER_NOT_FOUND", "Order not found.");
  }

  if (getAddress(order.maker) !== getAddress(input.cancel.maker)) {
    throw new ClobError("INVALID_SIGNATURE", "Cancel maker does not own order.");
  }

  if (order.status !== "LIVE" || order.remainingOutcomeAmount === 0n) {
    throw new ClobError("ORDER_NOT_CANCELLABLE", "Order is not cancellable.");
  }

  const cancelledAvailableOutcomeAmount = getAvailableForMatching(order);
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
    order: await cancelOrderAvailableRemainder(client, order.orderHash),
    cancelledAvailableOutcomeAmount,
    reservationReleaseAmount,
  };
}

function assertCancelNotExpired(cancel: CancelOrderInput, now: Date): void {
  if (cancel.expiration <= now) {
    throw new ClobError("ORDER_EXPIRED", "Cancel message expired.");
  }
}
