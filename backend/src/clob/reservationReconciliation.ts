import { withTransaction, type DbClient } from "./db/client.js";
import {
  cancelOrderAvailableRemainder,
  getLiveOrdersForReservationForUpdate,
} from "./db/orders.js";
import {
  decreaseReservation,
  getReservationForUpdate,
  lockReservationKey,
  type ReservationKey,
} from "./db/reservations.js";
import { deriveOutcomeTokenId } from "./reservationKeys.js";
import {
  planReservationReconciliation,
  type ReservationReconciliationPlan,
} from "./reservationReconciliationPlan.js";
import type { ClobOrder } from "./types.js";

export type ReconcileReservationInput = {
  key: ReservationKey;
  availableAmount: bigint;
};

export type ReconcileReservationResult = ReservationReconciliationPlan & {
  cancelledOrders: ClobOrder[];
};

export async function reconcileReservationAvailability(
  input: ReconcileReservationInput
): Promise<ReconcileReservationResult> {
  return withTransaction((client) => reconcileReservationAvailabilityTx(client, input));
}

export async function reconcileReservationAvailabilityTx(
  client: DbClient,
  input: ReconcileReservationInput
): Promise<ReconcileReservationResult> {
  if (input.availableAmount < 0n) {
    throw new Error(`availableAmount must be non-negative: ${input.availableAmount.toString()}`);
  }

  await lockReservationKey(client, input.key);
  const reservation = await getReservationForUpdate(client, input.key);
  if (reservation === null) {
    return {
      cancellations: [],
      cancelledOrders: [],
      projectedReservedAmount: 0n,
      unresolvedDeficit: 0n,
    };
  }

  const lockedOrders = await getLiveOrdersForReservationForUpdate(client, input.key);
  const orders = lockedOrders.filter((order) => belongsToReservation(order, input.key));
  const plan = planReservationReconciliation({
    reservedAmount: reservation.reservedAmount,
    availableAmount: input.availableAmount,
    orders,
  });
  const cancelledOrders: ClobOrder[] = [];

  for (const cancellation of plan.cancellations) {
    cancelledOrders.push(
      await cancelOrderAvailableRemainder(client, cancellation.orderHash)
    );
    await decreaseReservation(client, input.key, cancellation.reservationReleaseAmount);
  }

  return { ...plan, cancelledOrders };
}

function belongsToReservation(order: ClobOrder, key: ReservationKey): boolean {
  if (key.assetType === "ERC20") {
    return order.side === "BUY";
  }

  return (
    order.side === "SELL" &&
    order.outcomeToken.toLowerCase() === key.assetAddress.toLowerCase() &&
    deriveOutcomeTokenId(order.marketId, order.outcome) === key.tokenId
  );
}
