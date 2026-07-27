import type { ExecuteMatchedTradeOnceInput, ExecuteMatchedTradeOnceResult } from "./service.js";
import { executeMatchedTradeOnce } from "./service.js";
import { finalizeFailedTrade, type FinalizeFailedTradeResult } from "./failureCleanup.js";

export type SettlementRetryPolicy = {
  maxAttempts: number;
  backoffMs: readonly number[];
};

export const defaultSettlementRetryPolicy: SettlementRetryPolicy = {
  maxAttempts: 3,
  backoffMs: [5_000, 15_000, 30_000],
};

export type ExecuteMatchedTradeWithRetryInput = ExecuteMatchedTradeOnceInput & {
  retryPolicy?: SettlementRetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  executeOnce?: (input: ExecuteMatchedTradeOnceInput) => Promise<ExecuteMatchedTradeOnceResult>;
  usdc?: ExecuteMatchedTradeOnceInput["outcomeExchange"];
  finalizeFailedTrade?: (input: {
    publicClient: ExecuteMatchedTradeOnceInput["publicClient"];
    tradeId: bigint;
    usdc: ExecuteMatchedTradeOnceInput["outcomeExchange"];
  }) => Promise<FinalizeFailedTradeResult>;
};

export type ExecuteMatchedTradeWithRetryResult = ExecuteMatchedTradeOnceResult & {
  attemptsUsed: number;
  finalCleanup?: FinalizeFailedTradeResult;
};

export async function executeMatchedTradeWithRetry(
  input: ExecuteMatchedTradeWithRetryInput
): Promise<ExecuteMatchedTradeWithRetryResult> {
  const retryPolicy = input.retryPolicy ?? defaultSettlementRetryPolicy;
  const sleep = input.sleep ?? defaultSleep;
  const executeOnce = input.executeOnce ?? executeMatchedTradeOnce;
  const finalize = input.finalizeFailedTrade ?? finalizeFailedTrade;
  let lastResult: ExecuteMatchedTradeOnceResult | undefined;

  for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
    const result = await executeOnce(input);

    if (result.status === "SUBMITTED") {
      return {
        ...result,
        attemptsUsed: attempt,
      };
    }

    lastResult = result;

    if (attempt < retryPolicy.maxAttempts) {
      await sleep(getBackoffMs(retryPolicy, attempt));
    }
  }

  if (lastResult === undefined) {
    throw new Error("Retry policy must allow at least one attempt.");
  }

  const finalCleanup =
    input.usdc === undefined
      ? undefined
      : await finalize({
      publicClient: input.publicClient,
      tradeId: input.tradeId,
      usdc: input.usdc,
    });

  return {
    ...lastResult,
    attemptsUsed: retryPolicy.maxAttempts,
    finalCleanup,
  };
}

export function calculateRemainingSettlementAttempts(params: {
  maxAttempts: number;
  priorAttempts: number;
}): number {
  if (!Number.isSafeInteger(params.maxAttempts) || params.maxAttempts <= 0) {
    throw new Error(`maxAttempts must be positive: ${params.maxAttempts}`);
  }

  if (!Number.isSafeInteger(params.priorAttempts) || params.priorAttempts < 0) {
    throw new Error(`priorAttempts must be non-negative: ${params.priorAttempts}`);
  }

  return Math.max(0, params.maxAttempts - params.priorAttempts);
}

function getBackoffMs(policy: SettlementRetryPolicy, failedAttempt: number): number {
  return policy.backoffMs[Math.min(failedAttempt - 1, policy.backoffMs.length - 1)] ?? 0;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
