import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startMarketConfigEventSweepLoop } from "../../src/clob/marketConfigEventLoop.js";

describe("startMarketConfigEventSweepLoop", () => {
  it("does not run overlapping sweeps", async () => {
    let runs = 0;
    let release!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stop = startMarketConfigEventSweepLoop({
      intervalMs: 5,
      sweep: async () => {
        runs += 1;
        await firstRun;
      },
    });

    await delay(25);
    assert.equal(runs, 1);
    release();
    stop();
  });

  it("rejects invalid intervals", () => {
    assert.throws(
      () =>
        startMarketConfigEventSweepLoop({
          intervalMs: 0,
          sweep: async () => {},
        }),
      /Market config event sweep interval/
    );
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
