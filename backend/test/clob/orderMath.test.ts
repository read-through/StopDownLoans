import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClobError } from "../../src/clob/errors.js";
import {
  assertValidTick,
  buyPriceCrossesSellPrice,
  calculateBuyReservation,
  deriveUsdcAmount,
  getTickUnits,
} from "../../src/clob/orderMath.js";
import type { MarketConfig } from "../../src/clob/types.js";

const marketConfig: MarketConfig = {
  outcomeToken: "0x01",
  marketId: "0x02",
  clobEnabled: true,
  defaultTickUnits: 10_000n,
  edgeTickUnits: 1_000n,
  lowerEdgePriceUnits: 100_000n,
  upperEdgePriceUnits: 900_000n,
  minOrderOutcomeAmount: null,
  maxOrderOutcomeAmount: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("orderMath", () => {
  it("derives exact USDC amount from price units and outcome amount", () => {
    assert.equal(deriveUsdcAmount(650_000n, 100_000_000n), 65_000_000n);
  });

  it("rejects USDC amount derivation when rounding would be required", () => {
    assertClobError(
      () => deriveUsdcAmount(333_333n, 1n),
      "ROUNDING_NOT_ALLOWED"
    );
  });

  it("selects default tick inside the middle price range", () => {
    assert.equal(getTickUnits(650_000n, marketConfig), 10_000n);
  });

  it("selects edge tick near price bounds", () => {
    assert.equal(getTickUnits(100_000n, marketConfig), 1_000n);
    assert.equal(getTickUnits(900_000n, marketConfig), 1_000n);
  });

  it("accepts a price aligned to the active tick", () => {
    assert.doesNotThrow(() => assertValidTick(650_000n, marketConfig));
    assert.doesNotThrow(() => assertValidTick(99_000n, marketConfig));
  });

  it("rejects a price not aligned to the active tick", () => {
    assertClobError(
      () => assertValidTick(655_000n, marketConfig),
      "INVALID_PRICE_TICK"
    );
  });

  it("compares crossing prices without floating point arithmetic", () => {
    assert.equal(
      buyPriceCrossesSellPrice(65n, 100n, 64n, 100n),
      true
    );
    assert.equal(
      buyPriceCrossesSellPrice(63n, 100n, 64n, 100n),
      false
    );
  });

  it("calculates proportional BUY reservation from signed limit amount", () => {
    assert.equal(calculateBuyReservation(65_000_000n, 40_000_000n, 100_000_000n), 26_000_000n);
  });
});

function assertClobError(fn: () => unknown, code: ClobError["code"]): void {
  assert.throws(
    fn,
    (error) => error instanceof ClobError && error.code === code
  );
}
