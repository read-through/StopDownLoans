import { calculateAvailableRemainderReservationRelease } from "./reservationAccounting.js";
import type { ClobOrder, Hex } from "./types.js";

type ReconciliationOrder = Pick<
  ClobOrder,
  | "orderHash"
  | "side"
  | "usdcAmount"
  | "outcomeAmount"
  | "remainingOutcomeAmount"
  | "pendingMatchedOutcomeAmount"
  | "status"
  | "acceptedSequence"
>;

export type ReservationCancellation = {
  orderHash: Hex;
  reservationReleaseAmount: bigint;
};

export type ReservationReconciliationPlan = {
  cancellations: ReservationCancellation[];
  projectedReservedAmount: bigint;
  unresolvedDeficit: bigint;
};

export function planReservationReconciliation(params: {
  reservedAmount: bigint;
  availableAmount: bigint;
  orders: readonly ReconciliationOrder[];
}): ReservationReconciliationPlan {
  assertNonNegative("reservedAmount", params.reservedAmount);
  assertNonNegative("availableAmount", params.availableAmount);

  let projectedReservedAmount = params.reservedAmount;
  const cancellations: ReservationCancellation[] = [];
  const candidates = params.orders
    .filter((order) => order.status === "LIVE")
    .map((order) => ({
      order,
      reservationReleaseAmount: calculateAvailableRemainderReservationRelease(order),
    }))
    .filter((candidate) => candidate.reservationReleaseAmount > 0n)
    .sort((left, right) => compareNewestFirst(left.order, right.order));

  for (const candidate of candidates) {
    if (projectedReservedAmount <= params.availableAmount) {
      break;
    }
    if (candidate.reservationReleaseAmount > projectedReservedAmount) {
      throw new Error("Order reservation release exceeds the tracked reservation.");
    }

    cancellations.push({
      orderHash: candidate.order.orderHash,
      reservationReleaseAmount: candidate.reservationReleaseAmount,
    });
    projectedReservedAmount -= candidate.reservationReleaseAmount;
  }

  return {
    cancellations,
    projectedReservedAmount,
    unresolvedDeficit:
      projectedReservedAmount > params.availableAmount
        ? projectedReservedAmount - params.availableAmount
        : 0n,
  };
}

function compareNewestFirst(left: ReconciliationOrder, right: ReconciliationOrder): number {
  if (left.acceptedSequence === right.acceptedSequence) {
    return left.orderHash.localeCompare(right.orderHash);
  }
  return left.acceptedSequence > right.acceptedSequence ? -1 : 1;
}

function assertNonNegative(name: string, value: bigint): void {
  if (value < 0n) {
    throw new Error(`${name} must be non-negative: ${value.toString()}`);
  }
}
