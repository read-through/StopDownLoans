import { buyPriceCrossesSellPrice } from "./orderMath.js";
import { getAvailableForMatching, type ClobOrder, type Hex } from "./types.js";

export type MakerFill = {
  makerOrderHash: Hex;
  makerFillAmount: bigint;
  makerUsdcAmount: bigint;
  makerPriceNumerator: bigint;
  makerPriceDenominator: bigint;
};

export type MatchResult = {
  takerOrderHash: Hex;
  filledOutcomeAmount: bigint;
  totalUsdcAmount: bigint;
  remainingTakerOutcomeAmount: bigint;
  fills: MakerFill[];
};

export function matchTakerOrder(
  taker: ClobOrder,
  makerCandidates: ClobOrder[]
): MatchResult {
  const sortedMakers = makerCandidates
    .filter((maker) => canMatchCandidate(taker, maker))
    .sort((left, right) => compareMakersForTaker(taker, left, right));

  let remainingTaker = getAvailableForMatching(taker);
  let totalUsdcAmount = 0n;
  const fills: MakerFill[] = [];

  for (const maker of sortedMakers) {
    if (remainingTaker === 0n) {
      break;
    }

    const makerAvailable = getAvailableForMatching(maker);
    const makerFillAmount = minBigint(remainingTaker, makerAvailable);
    const makerUsdcAmount = calculateIncrementalUsdcFill(maker, makerFillAmount);

    if (makerUsdcAmount === 0n) {
      continue;
    }

    fills.push({
      makerOrderHash: maker.orderHash,
      makerFillAmount,
      makerUsdcAmount,
      makerPriceNumerator: maker.usdcAmount,
      makerPriceDenominator: maker.outcomeAmount,
    });

    remainingTaker -= makerFillAmount;
    totalUsdcAmount += makerUsdcAmount;
  }

  return {
    takerOrderHash: taker.orderHash,
    filledOutcomeAmount: getAvailableForMatching(taker) - remainingTaker,
    totalUsdcAmount,
    remainingTakerOutcomeAmount: remainingTaker,
    fills,
  };
}

function canMatchCandidate(taker: ClobOrder, maker: ClobOrder): boolean {
  if (maker.status !== "LIVE") {
    return false;
  }

  if (getAvailableForMatching(maker) <= 0n) {
    return false;
  }

  if (
    taker.outcomeToken !== maker.outcomeToken ||
    taker.marketId !== maker.marketId ||
    taker.outcome !== maker.outcome ||
    taker.side === maker.side
  ) {
    return false;
  }

  return taker.side === "BUY"
    ? buyPriceCrossesSellPrice(
        taker.usdcAmount,
        taker.outcomeAmount,
        maker.usdcAmount,
        maker.outcomeAmount
      )
    : buyPriceCrossesSellPrice(
        maker.usdcAmount,
        maker.outcomeAmount,
        taker.usdcAmount,
        taker.outcomeAmount
      );
}

function compareMakersForTaker(taker: ClobOrder, left: ClobOrder, right: ClobOrder): number {
  const priceComparison = compareMakerPrices(taker, left, right);

  if (priceComparison !== 0) {
    return priceComparison;
  }

  if (left.acceptedSequence < right.acceptedSequence) {
    return -1;
  }

  if (left.acceptedSequence > right.acceptedSequence) {
    return 1;
  }

  return 0;
}

function compareMakerPrices(taker: ClobOrder, left: ClobOrder, right: ClobOrder): number {
  const leftScaled = left.usdcAmount * right.outcomeAmount;
  const rightScaled = right.usdcAmount * left.outcomeAmount;

  if (leftScaled === rightScaled) {
    return 0;
  }

  if (taker.side === "BUY") {
    return leftScaled < rightScaled ? -1 : 1;
  }

  return leftScaled > rightScaled ? -1 : 1;
}

function calculateIncrementalUsdcFill(order: ClobOrder, fillAmount: bigint): bigint {
  const previousFilled = order.outcomeAmount - order.remainingOutcomeAmount;
  const newFilled = previousFilled + fillAmount;

  return cumulativeUsdcFill(order, newFilled) - cumulativeUsdcFill(order, previousFilled);
}

function cumulativeUsdcFill(order: ClobOrder, filledAmount: bigint): bigint {
  return (order.usdcAmount * filledAmount) / order.outcomeAmount;
}

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
