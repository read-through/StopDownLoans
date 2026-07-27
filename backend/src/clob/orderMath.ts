import { ClobError } from "./errors.js";
import { PRICE_SCALE, type MarketConfig } from "./types.js";

export function deriveUsdcAmount(priceUnits: bigint, outcomeAmount: bigint): bigint {
  assertPositive("priceUnits", priceUnits);
  assertPositive("outcomeAmount", outcomeAmount);

  const product = priceUnits * outcomeAmount;

  if (product % PRICE_SCALE !== 0n) {
    throw new ClobError(
      "ROUNDING_NOT_ALLOWED",
      "priceUnits * outcomeAmount must be exactly divisible by PRICE_SCALE."
    );
  }

  return product / PRICE_SCALE;
}

export function getTickUnits(priceUnits: bigint, config: MarketConfig): bigint {
  if (
    priceUnits <= config.lowerEdgePriceUnits ||
    priceUnits >= config.upperEdgePriceUnits
  ) {
    return config.edgeTickUnits;
  }

  return config.defaultTickUnits;
}

export function assertValidTick(priceUnits: bigint, config: MarketConfig): void {
  assertPositive("priceUnits", priceUnits);

  const tickUnits = getTickUnits(priceUnits, config);

  if (priceUnits % tickUnits !== 0n) {
    throw new ClobError(
      "INVALID_PRICE_TICK",
      `priceUnits must be divisible by tickUnits ${tickUnits.toString()}.`
    );
  }
}

export function buyPriceCrossesSellPrice(
  buyUsdcAmount: bigint,
  buyOutcomeAmount: bigint,
  sellUsdcAmount: bigint,
  sellOutcomeAmount: bigint
): boolean {
  assertPositive("buyUsdcAmount", buyUsdcAmount);
  assertPositive("buyOutcomeAmount", buyOutcomeAmount);
  assertPositive("sellUsdcAmount", sellUsdcAmount);
  assertPositive("sellOutcomeAmount", sellOutcomeAmount);

  return buyUsdcAmount * sellOutcomeAmount >= sellUsdcAmount * buyOutcomeAmount;
}

export function calculateBuyReservation(
  usdcAmount: bigint,
  remainingOutcomeAmount: bigint,
  outcomeAmount: bigint
): bigint {
  assertPositive("usdcAmount", usdcAmount);
  assertPositive("outcomeAmount", outcomeAmount);

  if (remainingOutcomeAmount < 0n || remainingOutcomeAmount > outcomeAmount) {
    throw new ClobError("INVALID_ORDER", "remainingOutcomeAmount must be within order bounds.");
  }

  return (usdcAmount * remainingOutcomeAmount) / outcomeAmount;
}

function assertPositive(name: string, value: bigint): void {
  if (value <= 0n) {
    throw new ClobError("INVALID_ORDER", `${name} must be positive.`);
  }
}
