import type { PublicClient, WalletClient } from "viem";
import { type BookFeedPublisher, serializeBookFeedKey } from "../api/bookFeedPublisher.js";
import { getPool, withTransaction } from "../db/client.js";
import { getSettlementAttemptCountByTrade } from "../db/settlementAttempts.js";
import { claimExecutableTradesForExecution, resetStaleExecutingTrades } from "../db/trades.js";
import type { Hex } from "../types.js";
import {
  calculateRemainingSettlementAttempts,
  defaultSettlementRetryPolicy,
  executeMatchedTradeWithRetry,
  type ExecuteMatchedTradeWithRetryResult,
} from "./retry.js";
import { finalizeFailedTrade } from "./failureCleanup.js";

export type RunExecutorBatchInput = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  outcomeExchange: Hex;
  usdc: Hex;
  operator: Hex;
  limit: number;
  executingTradeTimeoutMs?: number;
  now?: () => Date;
  bookFeedPublisher?: BookFeedPublisher;
};

export type RunExecutorBatchResult = {
  results: ExecuteMatchedTradeWithRetryResult[];
};

export async function runExecutorBatch(
  input: RunExecutorBatchInput
): Promise<RunExecutorBatchResult> {
  assertPositiveLimit(input.limit);
  await resetStaleExecutingTradesIfConfigured(input);

  const trades = await withTransaction((client) =>
    claimExecutableTradesForExecution(client, {
      limit: input.limit,
    })
  );
  const results: ExecuteMatchedTradeWithRetryResult[] = [];

  for (const trade of trades) {
    const priorAttempts = await withTransaction((client) =>
      getSettlementAttemptCountByTrade(client, trade.tradeId)
    );
    const remainingAttempts = calculateRemainingSettlementAttempts({
      maxAttempts: defaultSettlementRetryPolicy.maxAttempts,
      priorAttempts,
    });

    if (remainingAttempts <= 0) {
      const finalCleanup = await finalizeFailedTrade({
        publicClient: input.publicClient,
        tradeId: trade.tradeId,
        usdc: input.usdc,
      });
      await publishAffectedBooks(input.bookFeedPublisher, finalCleanup.affectedOrders);
      continue;
    }

    const result = await executeMatchedTradeWithRetry({
        client: getPool(),
        publicClient: input.publicClient,
        walletClient: input.walletClient,
        outcomeExchange: input.outcomeExchange,
        usdc: input.usdc,
        operator: input.operator,
        tradeId: trade.tradeId,
        retryPolicy: {
          ...defaultSettlementRetryPolicy,
          maxAttempts: remainingAttempts,
        },
      });
    results.push(result);

    if (result.finalCleanup !== undefined) {
      await publishAffectedBooks(input.bookFeedPublisher, result.finalCleanup.affectedOrders);
    }
  }

  return { results };
}

async function resetStaleExecutingTradesIfConfigured(
  input: RunExecutorBatchInput
): Promise<void> {
  if (input.executingTradeTimeoutMs === undefined) {
    return;
  }

  assertPositiveInteger(input.executingTradeTimeoutMs, "Executor executing trade timeout");
  const now = input.now ?? (() => new Date());
  const staleBefore = new Date(now().getTime() - input.executingTradeTimeoutMs);

  await withTransaction((client) =>
    resetStaleExecutingTrades(client, {
      staleBefore,
      limit: input.limit,
    })
  );
}

async function publishAffectedBooks(
  publisher: BookFeedPublisher | undefined,
  orders: Array<{
    outcomeToken: Hex;
    marketId: Hex;
    outcome: "YES" | "NO";
  }>
): Promise<void> {
  if (publisher === undefined) {
    return;
  }

  const seen = new Set<string>();
  for (const order of orders) {
    const key = {
      outcomeToken: order.outcomeToken,
      marketId: order.marketId,
      outcome: order.outcome,
    };
    const serialized = serializeBookFeedKey(key);
    if (seen.has(serialized)) {
      continue;
    }

    seen.add(serialized);
    await publisher.publishBookUpdate(key);
  }
}

export function startExecutorLoop(options: {
  intervalMs: number;
  run: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error(`Executor interval must be positive: ${options.intervalMs}`);
  }

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    options.run().then(
      () => {
        running = false;
      },
      (error) => {
        running = false;
        options.onError?.(error);
      }
    );
  }, options.intervalMs);

  return () => clearInterval(timer);
}

function assertPositiveLimit(limit: number): void {
  assertPositiveInteger(limit, "Executor batch limit");
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be positive: ${value}`);
  }
}
