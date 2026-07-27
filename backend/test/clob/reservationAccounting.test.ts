import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAvailableRemainderReservationRelease,
  calculateConfirmedFillReservationRelease,
  calculateFailedPendingReservationRelease,
} from "../../src/clob/reservationAccounting.js";

describe("reservationAccounting", () => {
  it("releases proportional USDC reservation for confirmed BUY fills", () => {
    assert.equal(
      calculateConfirmedFillReservationRelease(
        {
          side: "BUY",
          usdcAmount: 65_000_000n,
          outcomeAmount: 100_000_000n,
          remainingOutcomeAmount: 100_000_000n,
        },
        40_000_000n
      ),
      26_000_000n
    );
  });

  it("releases outcome token reservation for confirmed SELL fills", () => {
    assert.equal(
      calculateConfirmedFillReservationRelease(
        {
          side: "SELL",
          usdcAmount: 65_000_000n,
          outcomeAmount: 100_000_000n,
          remainingOutcomeAmount: 100_000_000n,
        },
        40_000_000n
      ),
      40_000_000n
    );
  });

  it("uses cumulative rounding for confirmed BUY fills", () => {
    assert.equal(
      calculateConfirmedFillReservationRelease(
        {
          side: "BUY",
          usdcAmount: 1n,
          outcomeAmount: 3n,
          remainingOutcomeAmount: 2n,
        },
        2n
      ),
      1n
    );
  });

  it("releases only available non-pending remainder", () => {
    assert.equal(
      calculateAvailableRemainderReservationRelease({
        side: "BUY",
        usdcAmount: 65_000_000n,
        outcomeAmount: 100_000_000n,
        remainingOutcomeAmount: 60_000_000n,
        pendingMatchedOutcomeAmount: 20_000_000n,
      }),
      26_000_000n
    );
  });

  it("releases BUY cancellation dust that is no longer needed by confirmed or pending fills", () => {
    assert.equal(
      calculateAvailableRemainderReservationRelease({
        side: "BUY",
        usdcAmount: 1n,
        outcomeAmount: 3n,
        remainingOutcomeAmount: 2n,
        pendingMatchedOutcomeAmount: 0n,
      }),
      1n
    );
  });

  it("returns zero when the whole remainder is pending", () => {
    assert.equal(
      calculateAvailableRemainderReservationRelease({
        side: "SELL",
        usdcAmount: 65_000_000n,
        outcomeAmount: 100_000_000n,
        remainingOutcomeAmount: 20_000_000n,
        pendingMatchedOutcomeAmount: 20_000_000n,
      }),
      0n
    );
  });

  it("releases failed pending BUY reservation with cumulative rounding", () => {
    assert.equal(
      calculateFailedPendingReservationRelease(
        {
          side: "BUY",
          usdcAmount: 1n,
          outcomeAmount: 3n,
          remainingOutcomeAmount: 2n,
        },
        2n
      ),
      1n
    );
  });

  it("releases failed pending SELL reservation one-for-one", () => {
    assert.equal(
      calculateFailedPendingReservationRelease(
        {
          side: "SELL",
          usdcAmount: 65_000_000n,
          outcomeAmount: 100_000_000n,
          remainingOutcomeAmount: 60_000_000n,
        },
        40_000_000n
      ),
      40_000_000n
    );
  });
});
