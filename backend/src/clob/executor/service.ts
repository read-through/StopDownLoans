import type { PublicClient, WalletClient } from "viem";
import {
  createSettlementAttempt,
  markSettlementAttemptFailed,
  markSettlementAttemptSubmitted,
} from "../db/settlementAttempts.js";
import { markTradeRetrying, markTradeSubmitted } from "../db/trades.js";
import type { DbClient } from "../db/client.js";
import { formatRpcErrorMessage, isRpcRateLimitError } from "../rpcErrors.js";
import type { Hex, SettlementAttempt, SettlementErrorCode, Trade } from "../types.js";
import { submitMatchOrders } from "./exchange.js";
import {
  buildMatchOrdersArgsFromBundle,
  loadTradeExecutionBundle,
} from "./tradeBundle.js";

export type ExecuteMatchedTradeOnceInput = {
  client: DbClient;
  publicClient: PublicClient;
  walletClient: WalletClient;
  outcomeExchange: Hex;
  operator: Hex;
  tradeId: bigint;
};

export type ExecuteMatchedTradeOnceResult =
  | {
      status: "SUBMITTED";
      txHash: Hex;
      trade: Trade;
      attempt: SettlementAttempt;
    }
  | {
      status: "FAILED";
      trade: Trade;
      attempt: SettlementAttempt;
      error: unknown;
    };

export async function executeMatchedTradeOnce(
  input: ExecuteMatchedTradeOnceInput
): Promise<ExecuteMatchedTradeOnceResult> {
  const attempt = await createSettlementAttempt(input.client, {
    tradeId: input.tradeId,
    operator: input.operator,
  });
  const bundle = await loadTradeExecutionBundle(input.client, input.tradeId);
  const args = buildMatchOrdersArgsFromBundle(bundle);

  try {
    const txHash = await submitMatchOrders({
      publicClient: input.publicClient,
      walletClient: input.walletClient,
      outcomeExchange: input.outcomeExchange,
      operator: input.operator,
      args,
    });
    const submittedAttempt = await markSettlementAttemptSubmitted(
      input.client,
      attempt.settlementAttemptId,
      txHash
    );
    const submittedTrade = await markTradeSubmitted(input.client, input.tradeId, txHash);

    return {
      status: "SUBMITTED",
      txHash,
      trade: submittedTrade,
      attempt: submittedAttempt,
    };
  } catch (error) {
    const failedAttempt = await markSettlementAttemptFailed(
      input.client,
      attempt.settlementAttemptId,
      classifySettlementError(error),
      formatErrorMessage(error)
    );
    const retryingTrade = await markTradeRetrying(input.client, input.tradeId);

    return {
      status: "FAILED",
      trade: retryingTrade,
      attempt: failedAttempt,
      error,
    };
  }
}

function classifySettlementError(error: unknown): SettlementErrorCode {
  if (isRpcRateLimitError(error)) {
    return "INFRASTRUCTURE_ERROR";
  }

  return "UNKNOWN_REVERT";
}

function formatErrorMessage(error: unknown): string {
  return formatRpcErrorMessage(error);
}
