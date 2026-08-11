import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planReservationReconciliation } from "../../src/clob/reservationReconciliationPlan.js";
import type { ClobOrder, Hex } from "../../src/clob/types.js";

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

describe("planReservationReconciliation", () => {
  it("fully cancels newest available remainders until the reservation is covered", () => {
    const plan = planReservationReconciliation({
      reservedAmount: 100n,
      availableAmount: 65n,
      orders: [sellOrder(1, 40n), sellOrder(2, 30n), sellOrder(3, 30n)],
    });

    assert.deepEqual(
      plan.cancellations.map((cancellation) => cancellation.orderHash),
      [orderHash(3), orderHash(2)]
    );
    assert.equal(plan.projectedReservedAmount, 40n);
    assert.equal(plan.unresolvedDeficit, 0n);
  });

  it("does not release a pending fill when cancelling newer orders", () => {
    const plan = planReservationReconciliation({
      reservedAmount: 100n,
      availableAmount: 65n,
      orders: [sellOrder(1, 40n), sellOrder(2, 30n), sellOrder(3, 30n, 30n)],
    });

    assert.deepEqual(
      plan.cancellations.map((cancellation) => cancellation.orderHash),
      [orderHash(2), orderHash(1)]
    );
    assert.equal(plan.projectedReservedAmount, 30n);
    assert.equal(plan.unresolvedDeficit, 0n);
  });

  it("reports a deficit that consists only of pending fills", () => {
    const plan = planReservationReconciliation({
      reservedAmount: 30n,
      availableAmount: 10n,
      orders: [sellOrder(1, 30n, 30n)],
    });

    assert.deepEqual(plan.cancellations, []);
    assert.equal(plan.projectedReservedAmount, 30n);
    assert.equal(plan.unresolvedDeficit, 20n);
  });

  it("does nothing while the reservation remains covered", () => {
    const plan = planReservationReconciliation({
      reservedAmount: 60n,
      availableAmount: 60n,
      orders: [sellOrder(1, 30n), sellOrder(2, 30n)],
    });

    assert.deepEqual(plan.cancellations, []);
    assert.equal(plan.projectedReservedAmount, 60n);
    assert.equal(plan.unresolvedDeficit, 0n);
  });
});

function sellOrder(sequence: number, remaining: bigint, pending = 0n): ReconciliationOrder {
  return {
    orderHash: orderHash(sequence),
    side: "SELL",
    usdcAmount: remaining,
    outcomeAmount: remaining,
    remainingOutcomeAmount: remaining,
    pendingMatchedOutcomeAmount: pending,
    status: "LIVE",
    acceptedSequence: BigInt(sequence),
  };
}

function orderHash(sequence: number): Hex {
  return `0x${sequence.toString(16).padStart(64, "0")}`;
}
