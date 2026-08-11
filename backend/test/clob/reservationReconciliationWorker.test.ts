import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reconcileReservationSnapshot,
  startReservationReconciliationLoop,
  type ReservationReconciliationBatchResult,
} from "../../src/clob/reservationReconciliationWorker.js";
import type { ReservationKey } from "../../src/clob/db/reservations.js";
import type { Hex, Reservation } from "../../src/clob/types.js";

const exchange = "0x0000000000000000000000000000000000000009" as Hex;

describe("reconcileReservationSnapshot", () => {
  it("uses the lower ERC-20 balance or allowance", async () => {
    let received: { key: ReservationKey; availableAmount: bigint } | undefined;
    const reservation = makeReservation("ERC20");

    await reconcileReservationSnapshot({
      reservation,
      outcomeExchange: exchange,
      chain: makeChain({ erc20Balance: 80n, erc20Allowance: 60n }),
      reconcile: async (input) => {
        received = input;
        return emptyResult(input.availableAmount);
      },
    });

    assert.deepEqual(received, {
      key: toKey(reservation),
      availableAmount: 60n,
    });
  });

  it("treats a revoked ERC-1155 operator approval as zero availability", async () => {
    let availableAmount: bigint | undefined;

    await reconcileReservationSnapshot({
      reservation: makeReservation("ERC1155"),
      outcomeExchange: exchange,
      chain: makeChain({ erc1155Balance: 100n, erc1155Approved: false }),
      reconcile: async (input) => {
        availableAmount = input.availableAmount;
        return emptyResult(input.availableAmount);
      },
    });

    assert.equal(availableAmount, 0n);
  });

  it("does not reconcile when an RPC balance read fails", async () => {
    let reconciled = false;

    await assert.rejects(
      reconcileReservationSnapshot({
        reservation: makeReservation("ERC20"),
        outcomeExchange: exchange,
        chain: {
          ...makeChain({}),
          getErc20Balance: async () => {
            throw new Error("request limit reached");
          },
        },
        reconcile: async (input) => {
          reconciled = true;
          return emptyResult(input.availableAmount);
        },
      }),
      /request limit reached/
    );

    assert.equal(reconciled, false);
  });
});

describe("startReservationReconciliationLoop", () => {
  it("does not overlap batches and advances the keyset cursor", async () => {
    const cursor = toKey(makeReservation("ERC20"));
    const received: Array<ReservationKey | null> = [];
    let finishFirst: ((result: ReservationReconciliationBatchResult) => void) | undefined;
    const stop = startReservationReconciliationLoop({
      intervalMs: 1,
      run: (after) => {
        received.push(after);
        if (received.length === 1) {
          return new Promise((resolve) => {
            finishFirst = resolve;
          });
        }
        return Promise.resolve(batchResult(null));
      },
    });

    await sleep(10);
    assert.deepEqual(received, [null]);
    finishFirst?.(batchResult(cursor));
    await sleep(10);
    stop();

    assert.deepEqual(received[1], cursor);
  });
});

function makeReservation(assetType: Reservation["assetType"]): Reservation {
  return {
    maker: "0x0000000000000000000000000000000000000001",
    assetType,
    assetAddress: "0x0000000000000000000000000000000000000002",
    tokenId: assetType === "ERC20" ? 0n : 7n,
    reservedAmount: 100n,
    updatedAt: new Date("2026-08-11T00:00:00.000Z"),
  };
}

function makeChain(values: {
  erc20Balance?: bigint;
  erc20Allowance?: bigint;
  erc1155Balance?: bigint;
  erc1155Approved?: boolean;
}) {
  return {
    getErc20Balance: async () => values.erc20Balance ?? 100n,
    getErc20Allowance: async () => values.erc20Allowance ?? 100n,
    getErc1155Balance: async () => values.erc1155Balance ?? 100n,
    isErc1155ApprovedForAll: async () => values.erc1155Approved ?? true,
  };
}

function emptyResult(availableAmount: bigint) {
  return {
    cancellations: [],
    cancelledOrders: [],
    projectedReservedAmount: availableAmount,
    unresolvedDeficit: 0n,
  };
}

function batchResult(nextCursor: ReservationKey | null): ReservationReconciliationBatchResult {
  return {
    checked: 1,
    cancelled: 0,
    unresolvedDeficits: 0,
    nextCursor,
  };
}

function toKey(reservation: Reservation): ReservationKey {
  return {
    maker: reservation.maker,
    assetType: reservation.assetType,
    assetAddress: reservation.assetAddress,
    tokenId: reservation.tokenId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
