import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startSubmittedReceiptSweepLoop } from "../../src/clob/receiptSweep.js";

describe("startSubmittedReceiptSweepLoop", () => {
  it("does not run overlapping sweeps", async () => {
    let calls = 0;
    let resolveSweep: (() => void) | undefined;

    const stop = startSubmittedReceiptSweepLoop({
      intervalMs: 1,
      sweep: () =>
        new Promise<void>((resolve) => {
          calls += 1;
          resolveSweep = resolve;
        }),
    });

    await sleep(10);
    assert.equal(calls, 1);
    resolveSweep?.();
    await sleep(10);
    stop();

    assert.equal(calls >= 2, true);
  });

  it("rejects invalid intervals", () => {
    assert.throws(() =>
      startSubmittedReceiptSweepLoop({
        intervalMs: 0,
        sweep: async () => {},
      })
    );
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
