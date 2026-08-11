import type { PublicClient } from "viem";
import type { BookFeedPublisher } from "./api/bookFeedPublisher.js";
import {
  getErc1155Balance,
  getErc20Allowance,
  getErc20Balance,
  isErc1155ApprovedForAll,
} from "./chain/contracts.js";
import { getPool } from "./db/client.js";
import {
  getReservationsPage,
  type ReservationCursor,
  type ReservationKey,
} from "./db/reservations.js";
import {
  reconcileReservationAvailability,
  type ReconcileReservationResult,
} from "./reservationReconciliation.js";
import type { Hex, Reservation } from "./types.js";

export type ReservationReconciliationBatchResult = {
  checked: number;
  cancelled: number;
  unresolvedDeficits: number;
  nextCursor: ReservationCursor | null;
};

type ChainReader = {
  getErc20Balance(token: Hex, account: Hex): Promise<bigint>;
  getErc20Allowance(token: Hex, owner: Hex, spender: Hex): Promise<bigint>;
  getErc1155Balance(token: Hex, account: Hex, tokenId: bigint): Promise<bigint>;
  isErc1155ApprovedForAll(token: Hex, account: Hex, operator: Hex): Promise<boolean>;
};

export async function runReservationReconciliationBatch(input: {
  publicClient: PublicClient;
  outcomeExchange: Hex;
  usdc: Hex;
  outcomeToken: Hex;
  limit: number;
  after: ReservationCursor | null;
  bookFeedPublisher?: BookFeedPublisher;
}): Promise<ReservationReconciliationBatchResult> {
  assertPositiveInteger(input.limit, "Reservation reconciliation limit");

  const reservations = await getReservationsPage(getPool(), {
    limit: input.limit,
    after: input.after,
    usdc: input.usdc,
    outcomeToken: input.outcomeToken,
  });
  const chain = createChainReader(input.publicClient);
  let cancelled = 0;
  let unresolvedDeficits = 0;

  for (const reservation of reservations) {
    const result = await reconcileReservationSnapshot({
      reservation,
      outcomeExchange: input.outcomeExchange,
      chain,
      reconcile: reconcileReservationAvailability,
    });
    cancelled += result.cancelledOrders.length;
    if (result.unresolvedDeficit > 0n) {
      unresolvedDeficits++;
    }

    for (const order of result.cancelledOrders) {
      await input.bookFeedPublisher?.publishBookUpdate({
        outcomeToken: order.outcomeToken,
        marketId: order.marketId,
        outcome: order.outcome,
      });
    }
  }

  return {
    checked: reservations.length,
    cancelled,
    unresolvedDeficits,
    nextCursor:
      reservations.length === input.limit
        ? toReservationCursor(reservations[reservations.length - 1])
        : null,
  };
}

export async function reconcileReservationSnapshot(input: {
  reservation: Reservation;
  outcomeExchange: Hex;
  chain: ChainReader;
  reconcile: (input: {
    key: ReservationKey;
    availableAmount: bigint;
  }) => Promise<ReconcileReservationResult>;
}): Promise<ReconcileReservationResult> {
  const availableAmount = await readAvailableAmount(
    input.reservation,
    input.outcomeExchange,
    input.chain
  );

  return input.reconcile({
    key: toReservationCursor(input.reservation),
    availableAmount,
  });
}

export function startReservationReconciliationLoop(options: {
  intervalMs: number;
  run: (after: ReservationCursor | null) => Promise<ReservationReconciliationBatchResult>;
  onError?: (error: unknown) => void;
}): () => void {
  assertPositiveInteger(options.intervalMs, "Reservation reconciliation interval");

  let running = false;
  let cursor: ReservationCursor | null = null;
  const runOnce = () => {
    if (running) {
      return;
    }

    running = true;
    options.run(cursor).then(
      (result) => {
        cursor = result.nextCursor;
        running = false;
      },
      (error) => {
        running = false;
        options.onError?.(error);
      }
    );
  };

  runOnce();
  const timer = setInterval(runOnce, options.intervalMs);
  return () => clearInterval(timer);
}

async function readAvailableAmount(
  reservation: Reservation,
  outcomeExchange: Hex,
  chain: ChainReader
): Promise<bigint> {
  if (reservation.assetType === "ERC20") {
    const balance = await chain.getErc20Balance(reservation.assetAddress, reservation.maker);
    const allowance = await chain.getErc20Allowance(
      reservation.assetAddress,
      reservation.maker,
      outcomeExchange
    );
    return balance < allowance ? balance : allowance;
  }

  const balance = await chain.getErc1155Balance(
    reservation.assetAddress,
    reservation.maker,
    reservation.tokenId
  );
  const approved = await chain.isErc1155ApprovedForAll(
    reservation.assetAddress,
    reservation.maker,
    outcomeExchange
  );
  return approved ? balance : 0n;
}

function createChainReader(publicClient: PublicClient): ChainReader {
  return {
    getErc20Balance: (token, account) => getErc20Balance(publicClient, token, account),
    getErc20Allowance: (token, owner, spender) =>
      getErc20Allowance(publicClient, token, owner, spender),
    getErc1155Balance: (token, account, tokenId) =>
      getErc1155Balance(publicClient, token, account, tokenId),
    isErc1155ApprovedForAll: (token, account, operator) =>
      isErc1155ApprovedForAll(publicClient, token, account, operator),
  };
}

function toReservationCursor(reservation: Reservation): ReservationCursor {
  return {
    maker: reservation.maker,
    assetType: reservation.assetType,
    assetAddress: reservation.assetAddress,
    tokenId: reservation.tokenId,
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be positive: ${value.toString()}`);
  }
}
