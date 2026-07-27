import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertOrdersMatchedEventMatchesTrade,
  calculateConfirmedFillDelta,
} from "../../src/clob/reconciliation.js";

describe("calculateConfirmedFillDelta", () => {
  it("returns the full event total when no fill was confirmed before", () => {
    assert.equal(
      calculateConfirmedFillDelta(
        {
          outcomeAmount: 100n,
          remainingOutcomeAmount: 100n,
        },
        40n
      ),
      40n
    );
  });

  it("returns only the new cumulative delta", () => {
    assert.equal(
      calculateConfirmedFillDelta(
        {
          outcomeAmount: 100n,
          remainingOutcomeAmount: 60n,
        },
        75n
      ),
      35n
    );
  });

  it("returns zero for already applied or stale totals", () => {
    assert.equal(
      calculateConfirmedFillDelta(
        {
          outcomeAmount: 100n,
          remainingOutcomeAmount: 60n,
        },
        40n
      ),
      0n
    );
  });
});

describe("assertOrdersMatchedEventMatchesTrade", () => {
  it("accepts matching event totals", () => {
    assert.doesNotThrow(() =>
      assertOrdersMatchedEventMatchesTrade(
        {
          takerOrderHash: "0x01",
          totalOutcomeAmount: 100n,
          totalUsdcAmount: 65n,
        },
        {
          takerOrderHash: "0x01",
          totalOutcomeAmount: 100n,
          totalUsdcAmount: 65n,
        }
      )
    );
  });

  it("rejects mismatched event totals", () => {
    assert.throws(() =>
      assertOrdersMatchedEventMatchesTrade(
        {
          takerOrderHash: "0x01",
          totalOutcomeAmount: 100n,
          totalUsdcAmount: 66n,
        },
        {
          takerOrderHash: "0x01",
          totalOutcomeAmount: 100n,
          totalUsdcAmount: 65n,
        }
      )
    );
  });
});
