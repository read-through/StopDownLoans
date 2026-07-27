import type { PublicClient } from "viem";
import { withTransaction } from "./db/client.js";
import {
  getSettlementAttemptCountByTrade,
  getSubmittedSettlementAttemptsForCheck,
  markSettlementAttemptDropped,
  markSettlementAttemptReverted,
} from "./db/settlementAttempts.js";
import { markTradeRetrying } from "./db/trades.js";
import type { Hex, SettlementAttempt } from "./types.js";
import { finalizeFailedTradeTx } from "./executor/failureCleanup.js";
import { defaultSettlementRetryPolicy } from "./executor/retry.js";

export type SweepSubmittedReceiptsInput = {
  publicClient: PublicClient;
  usdc: Hex;
  now: Date;
  droppedTimeoutMs: number;
  limit: number;
  maxSettlementAttempts?: number;
};

export type SweepSubmittedReceiptsResult = {
  checked: number;
  reverted: SettlementAttempt[];
  dropped: SettlementAttempt[];
};

export async function sweepSubmittedReceipts(
  input: SweepSubmittedReceiptsInput
): Promise<SweepSubmittedReceiptsResult> {
  assertPositiveInteger(input.limit, "Receipt sweep limit");
  assertPositiveInteger(input.droppedTimeoutMs, "Receipt dropped timeout");
  const maxSettlementAttempts =
    input.maxSettlementAttempts ?? defaultSettlementRetryPolicy.maxAttempts;
  assertPositiveInteger(maxSettlementAttempts, "Receipt sweep max settlement attempts");

  const attempts = await withTransaction((client) =>
    getSubmittedSettlementAttemptsForCheck(client, {
      limit: input.limit,
    })
  );
  const result: SweepSubmittedReceiptsResult = {
    checked: attempts.length,
    reverted: [],
    dropped: [],
  };

  for (const attempt of attempts) {
    if (attempt.txHash === null || attempt.submittedAt === null) {
      continue;
    }

    const receipt = await getReceiptOrNull(input.publicClient, attempt.txHash);
    if (receipt === null) {
      if (input.now.getTime() - attempt.submittedAt.getTime() >= input.droppedTimeoutMs) {
        result.dropped.push(await markAttemptDropped(attempt, input, maxSettlementAttempts));
      }
      continue;
    }

    if (receipt.status === "reverted") {
      result.reverted.push(await markAttemptReverted(attempt, input, maxSettlementAttempts));
    }
  }

  return result;
}

export function startSubmittedReceiptSweepLoop(options: {
  intervalMs: number;
  sweep: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  assertPositiveInteger(options.intervalMs, "Submitted receipt sweep interval");

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    options.sweep().then(
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

async function markAttemptReverted(
  attempt: SettlementAttempt,
  input: SweepSubmittedReceiptsInput,
  maxSettlementAttempts: number
): Promise<SettlementAttempt> {
  return withTransaction(async (client) => {
    const updatedAttempt = await markSettlementAttemptReverted(
      client,
      attempt.settlementAttemptId,
      "UNKNOWN_REVERT",
      "Submitted settlement transaction reverted."
    );
    await markTradeRetrying(client, attempt.tradeId);
    if ((await getSettlementAttemptCountByTrade(client, attempt.tradeId)) >= maxSettlementAttempts) {
      await finalizeFailedTradeTx(client, {
        publicClient: input.publicClient,
        tradeId: attempt.tradeId,
        usdc: input.usdc,
      });
    }
    return updatedAttempt;
  });
}

async function markAttemptDropped(
  attempt: SettlementAttempt,
  input: SweepSubmittedReceiptsInput,
  maxSettlementAttempts: number
): Promise<SettlementAttempt> {
  return withTransaction(async (client) => {
    const updatedAttempt = await markSettlementAttemptDropped(
      client,
      attempt.settlementAttemptId,
      "INFRASTRUCTURE_ERROR",
      "Submitted settlement transaction receipt was not found before timeout."
    );
    await markTradeRetrying(client, attempt.tradeId);
    if ((await getSettlementAttemptCountByTrade(client, attempt.tradeId)) >= maxSettlementAttempts) {
      await finalizeFailedTradeTx(client, {
        publicClient: input.publicClient,
        tradeId: attempt.tradeId,
        usdc: input.usdc,
      });
    }
    return updatedAttempt;
  });
}

async function getReceiptOrNull(
  publicClient: PublicClient,
  txHash: NonNullable<SettlementAttempt["txHash"]>
) {
  try {
    return await publicClient.getTransactionReceipt({
      hash: txHash,
    });
  } catch {
    return null;
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be positive: ${value}`);
  }
}
