import { calculateBuyReservation } from "./orderMath.js";
import type { ClobOrder } from "./types.js";

export function calculateConfirmedFillReservationRelease(
  order: Pick<ClobOrder, "side" | "usdcAmount" | "outcomeAmount" | "remainingOutcomeAmount">,
  fillAmount: bigint
): bigint {
  if (fillAmount <= 0n) {
    throw new Error(`Fill amount must be positive: ${fillAmount.toString()}`);
  }

  if (order.side === "SELL") {
    return fillAmount;
  }

  const previouslyFilled = order.outcomeAmount - order.remainingOutcomeAmount;
  const newlyFilled = previouslyFilled + fillAmount;
  const previousReservedRelease = calculateBuyReservation(order.usdcAmount, previouslyFilled, order.outcomeAmount);
  const newReservedRelease = calculateBuyReservation(order.usdcAmount, newlyFilled, order.outcomeAmount);

  return newReservedRelease - previousReservedRelease;
}

export function calculateAvailableRemainderReservationRelease(
  order: Pick<
    ClobOrder,
    "side" | "usdcAmount" | "outcomeAmount" | "remainingOutcomeAmount" | "pendingMatchedOutcomeAmount"
  >
): bigint {
  const availableOutcomeAmount = order.remainingOutcomeAmount - order.pendingMatchedOutcomeAmount;

  if (availableOutcomeAmount <= 0n) {
    return 0n;
  }

  if (order.side === "SELL") {
    return availableOutcomeAmount;
  }

  const previouslyFilled = order.outcomeAmount - order.remainingOutcomeAmount;
  const confirmedAndPending = previouslyFilled + order.pendingMatchedOutcomeAmount;

  return order.usdcAmount - calculateBuyReservation(order.usdcAmount, confirmedAndPending, order.outcomeAmount);
}

export function calculateFailedPendingReservationRelease(
  order: Pick<ClobOrder, "side" | "usdcAmount" | "outcomeAmount" | "remainingOutcomeAmount">,
  pendingReleaseAmount: bigint
): bigint {
  if (pendingReleaseAmount <= 0n) {
    throw new Error(`Pending release amount must be positive: ${pendingReleaseAmount.toString()}`);
  }

  if (order.side === "SELL") {
    return pendingReleaseAmount;
  }

  const previouslyFilled = order.outcomeAmount - order.remainingOutcomeAmount;
  const reserveAfterConfirmed = calculateBuyReservation(order.usdcAmount, previouslyFilled, order.outcomeAmount);
  const reserveAfterConfirmedAndPending = calculateBuyReservation(
    order.usdcAmount,
    previouslyFilled + pendingReleaseAmount,
    order.outcomeAmount
  );

  return reserveAfterConfirmedAndPending - reserveAfterConfirmed;
}
