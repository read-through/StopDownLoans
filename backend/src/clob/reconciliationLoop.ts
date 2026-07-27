import { parseAbiItem, type PublicClient } from "viem";
import { type BookFeedKey, type BookFeedPublisher } from "./api/bookFeedPublisher.js";
import { getOutcomeTokenId } from "./chain/contracts.js";
import { withTransaction } from "./db/client.js";
import { getBackendCursor, upsertBackendCursor } from "./db/chainEvents.js";
import {
  applyOrderFilledEvent,
  applyOrdersMatchedEvent,
  type OrderFilledEvent,
  type OrdersMatchedEvent,
} from "./reconciliation.js";
import type { Hex, Trade } from "./types.js";

export const OUTCOME_EXCHANGE_EVENTS_CURSOR = "outcome_exchange_events";

const orderFilledEvent = parseAbiItem(
  "event OrderFilled(bytes32 indexed orderHash,address indexed maker,address indexed counterparty,uint256 outcomeFillAmount,uint256 usdcFillAmount,uint256 totalFilledAmount,uint256 remainingAmount)"
);

const ordersMatchedEvent = parseAbiItem(
  "event OrdersMatched(bytes32 indexed takerOrderHash,address indexed operator,uint256 totalOutcomeAmount,uint256 totalUsdcAmount)"
);

export type ReconcileOutcomeExchangeEventsInput = {
  publicClient: PublicClient;
  outcomeExchange: Hex;
  usdc: Hex;
  cursorName?: string;
  confirmationDepth: bigint;
  fromBlockIfNoCursor: bigint;
  maxBlocksPerRun: bigint;
  bookFeedPublisher?: BookFeedPublisher;
};

export type ReconcileOutcomeExchangeEventsResult = {
  fromBlock: bigint;
  toBlock: bigint | null;
  latestBlock: bigint;
  processedLogs: number;
};

export async function reconcileOutcomeExchangeEventsOnce(
  input: ReconcileOutcomeExchangeEventsInput
): Promise<ReconcileOutcomeExchangeEventsResult> {
  assertPositiveBigint(input.maxBlocksPerRun, "maxBlocksPerRun");

  const latestBlock = await input.publicClient.getBlockNumber();
  if (latestBlock < input.confirmationDepth) {
    return {
      fromBlock: input.fromBlockIfNoCursor,
      toBlock: null,
      latestBlock,
      processedLogs: 0,
    };
  }

  const safeHead = latestBlock - input.confirmationDepth;
  const cursorName = input.cursorName ?? OUTCOME_EXCHANGE_EVENTS_CURSOR;
  const fromBlock = await getNextFromBlock(cursorName, input.fromBlockIfNoCursor);
  if (fromBlock > safeHead) {
    return {
      fromBlock,
      toBlock: null,
      latestBlock,
      processedLogs: 0,
    };
  }

  const toBlock = minBigint(safeHead, fromBlock + input.maxBlocksPerRun - 1n);
  const logs = (await input.publicClient.getLogs({
    address: input.outcomeExchange,
    events: [orderFilledEvent, ordersMatchedEvent],
    fromBlock,
    toBlock,
  })) as OutcomeExchangeLog[];

  let processedLogs = 0;
  for (const log of logs) {
    const affectedFeedEvent: AffectedFeedEvent | null = await withTransaction(async (client) => {
      if (log.eventName === "OrderFilled") {
        const result = await applyOrderFilledEvent(client, toOrderFilledEvent(log), {
          usdc: input.usdc,
          getOutcomeTokenId: ({ outcomeToken, marketId, outcome }) =>
            getOutcomeTokenId(input.publicClient, outcomeToken, marketId, outcome),
        });
        processedLogs += 1;
        return result.applied
          ? {
            outcomeToken: result.order.outcomeToken,
            marketId: result.order.marketId,
            outcome: result.order.outcome,
          }
          : null;
      }

      if (log.eventName === "OrdersMatched") {
        const result = await applyOrdersMatchedEvent(client, toOrdersMatchedEvent(log));
        processedLogs += 1;
        return result.applied
          ? {
              trade: result.trade,
            }
          : null;
      }

      return null;
    });

    if (affectedFeedEvent !== null) {
      if (isTradeFeedEvent(affectedFeedEvent)) {
        await input.bookFeedPublisher?.publishTrade(affectedFeedEvent.trade);
      } else {
        await input.bookFeedPublisher?.publishBookUpdate(affectedFeedEvent);
      }
    }
  }

  await withTransaction((client) =>
    upsertBackendCursor(client, cursorName, toBlock)
  );

  return {
    fromBlock,
    toBlock,
    latestBlock,
    processedLogs,
  };
}

export function startOutcomeExchangeReconciliationLoop(options: {
  intervalMs: number;
  reconcile: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error(`Reconciliation interval must be positive: ${options.intervalMs}`);
  }

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    options.reconcile().then(
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

type AffectedFeedEvent = BookFeedKey | { trade: Trade };

function isTradeFeedEvent(event: AffectedFeedEvent): event is { trade: Trade } {
  return "trade" in event;
}

async function getNextFromBlock(cursorName: string, fromBlockIfNoCursor: bigint): Promise<bigint> {
  return withTransaction(async (client) => {
    const cursor = await getBackendCursor(client, cursorName);
    return cursor === null ? fromBlockIfNoCursor : cursor + 1n;
  });
}

function toOrderFilledEvent(log: OutcomeExchangeLog): OrderFilledEvent {
  if (log.eventName !== "OrderFilled") {
    throw new Error("Expected OrderFilled log.");
  }

  return {
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    orderHash: log.args.orderHash,
    totalFilledAmount: log.args.totalFilledAmount,
  };
}

function toOrdersMatchedEvent(log: OutcomeExchangeLog): OrdersMatchedEvent {
  if (log.eventName !== "OrdersMatched") {
    throw new Error("Expected OrdersMatched log.");
  }

  return {
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    takerOrderHash: log.args.takerOrderHash,
    totalOutcomeAmount: log.args.totalOutcomeAmount,
    totalUsdcAmount: log.args.totalUsdcAmount,
  };
}

type OutcomeExchangeLog = OrderFilledLog | OrdersMatchedLog;

type BaseOutcomeExchangeLog = {
  transactionHash: Hex;
  logIndex: number;
  blockNumber: bigint;
};

type OrderFilledLog = BaseOutcomeExchangeLog & {
  eventName: "OrderFilled";
  args: {
    orderHash: Hex;
    totalFilledAmount: bigint;
  };
};

type OrdersMatchedLog = BaseOutcomeExchangeLog & {
  eventName: "OrdersMatched";
  args: {
    takerOrderHash: Hex;
    totalOutcomeAmount: bigint;
    totalUsdcAmount: bigint;
  };
};

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function assertPositiveBigint(value: bigint, fieldName: string): void {
  if (value <= 0n) {
    throw new Error(`${fieldName} must be positive.`);
  }
}
