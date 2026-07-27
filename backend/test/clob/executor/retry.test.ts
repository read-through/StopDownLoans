import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateRemainingSettlementAttempts, executeMatchedTradeWithRetry } from "../../../src/clob/executor/retry.js";
import type { ExecuteMatchedTradeOnceInput, ExecuteMatchedTradeOnceResult } from "../../../src/clob/executor/service.js";

describe("executeMatchedTradeWithRetry", () => {
  it("calculates the remaining trade-level settlement attempt budget", () => {
    assert.equal(calculateRemainingSettlementAttempts({ maxAttempts: 3, priorAttempts: 0 }), 3);
    assert.equal(calculateRemainingSettlementAttempts({ maxAttempts: 3, priorAttempts: 2 }), 1);
    assert.equal(calculateRemainingSettlementAttempts({ maxAttempts: 3, priorAttempts: 3 }), 0);
    assert.equal(calculateRemainingSettlementAttempts({ maxAttempts: 3, priorAttempts: 4 }), 0);
  });

  it("returns immediately after a submitted attempt", async () => {
    const result = await executeMatchedTradeWithRetry({
      ...dummyInput(),
      executeOnce: async () => submittedResult(),
      sleep: async () => {
        throw new Error("sleep should not be called");
      },
    });

    assert.equal(result.status, "SUBMITTED");
    assert.equal(result.attemptsUsed, 1);
  });

  it("retries failed attempts with configured backoff", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await executeMatchedTradeWithRetry({
      ...dummyInput(),
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: [10, 20, 30],
      },
      executeOnce: async () => {
        calls += 1;
        return calls === 3 ? submittedResult() : failedResult();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    assert.equal(result.status, "SUBMITTED");
    assert.equal(result.attemptsUsed, 3);
    assert.deepEqual(sleeps, [10, 20]);
  });

  it("returns the final failed result after max attempts", async () => {
    const sleeps: number[] = [];
    const finalizedTradeIds: bigint[] = [];
    const result = await executeMatchedTradeWithRetry({
      ...dummyInput(),
      usdc: "0x3333333333333333333333333333333333333333",
      retryPolicy: {
        maxAttempts: 2,
        backoffMs: [10],
      },
      executeOnce: async () => failedResult(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      finalizeFailedTrade: async ({ tradeId }) => {
        finalizedTradeIds.push(tradeId);
        return {
          trade: {} as never,
          affectedOrders: [],
        };
      },
    });

    assert.equal(result.status, "FAILED");
    assert.equal(result.attemptsUsed, 2);
    assert.deepEqual(sleeps, [10]);
    assert.deepEqual(finalizedTradeIds, [1n]);
  });

  it("does not finalize failed trade when a later attempt is submitted", async () => {
    let calls = 0;
    const finalizedTradeIds: bigint[] = [];
    const result = await executeMatchedTradeWithRetry({
      ...dummyInput(),
      usdc: "0x3333333333333333333333333333333333333333",
      retryPolicy: {
        maxAttempts: 2,
        backoffMs: [10],
      },
      executeOnce: async () => {
        calls += 1;
        return calls === 1 ? failedResult() : submittedResult();
      },
      sleep: async () => {},
      finalizeFailedTrade: async ({ tradeId }) => {
        finalizedTradeIds.push(tradeId);
        return {
          trade: {} as never,
          affectedOrders: [],
        };
      },
    });

    assert.equal(result.status, "SUBMITTED");
    assert.deepEqual(finalizedTradeIds, []);
  });
});

function dummyInput(): ExecuteMatchedTradeOnceInput {
  return {
    client: {} as ExecuteMatchedTradeOnceInput["client"],
    publicClient: {} as ExecuteMatchedTradeOnceInput["publicClient"],
    walletClient: {} as ExecuteMatchedTradeOnceInput["walletClient"],
    outcomeExchange: "0x1111111111111111111111111111111111111111",
    operator: "0x2222222222222222222222222222222222222222",
    tradeId: 1n,
  };
}

function submittedResult(): ExecuteMatchedTradeOnceResult {
  return {
    status: "SUBMITTED",
    txHash: "0x01",
    trade: {} as Extract<ExecuteMatchedTradeOnceResult, { status: "SUBMITTED" }>["trade"],
    attempt: {} as Extract<ExecuteMatchedTradeOnceResult, { status: "SUBMITTED" }>["attempt"],
  };
}

function failedResult(): ExecuteMatchedTradeOnceResult {
  return {
    status: "FAILED",
    trade: {} as Extract<ExecuteMatchedTradeOnceResult, { status: "FAILED" }>["trade"],
    attempt: {} as Extract<ExecuteMatchedTradeOnceResult, { status: "FAILED" }>["attempt"],
    error: new Error("failed"),
  };
}
