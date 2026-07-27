import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startExpiredOrderSweepLoop } from "../../src/clob/expiredOrders.js";

describe("startExpiredOrderSweepLoop", () => {
  it("does not run overlapping sweeps", async () => {
    let calls = 0;
    let releaseSweep: (() => void) | undefined;
    const stop = startExpiredOrderSweepLoop({
      intervalMs: 1,
      sweep: () =>
        new Promise<void>((resolve) => {
          calls += 1;
          releaseSweep = resolve;
        }),
    });

    await sleep(10);
    assert.equal(calls, 1);

    releaseSweep?.();
    await sleep(10);
    stop();

    assert.equal(calls > 1, true);
  });

  it("rejects invalid intervals", () => {
    assert.throws(() =>
      startExpiredOrderSweepLoop({
        intervalMs: 0,
        sweep: async () => {},
      })
    );
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
