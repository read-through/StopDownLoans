import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOrderPriceUnits, InMemoryOrderBook, type BookKey } from "../../src/clob/book.js";
import type { ClobOrder, Hex, OrderSide } from "../../src/clob/types.js";

const key: BookKey = {
  outcomeToken: "0x1111111111111111111111111111111111111111",
  marketId: "0x2222222222222222222222222222222222222222222222222222222222222222",
  outcome: "YES",
};

describe("InMemoryOrderBook", () => {
  it("builds sorted L2 bid and ask levels", () => {
    const book = InMemoryOrderBook.fromOrders(key, [
      order({ orderHash: "0x01", side: "BUY", priceUnits: 640_000n, acceptedSequence: 1n }),
      order({ orderHash: "0x02", side: "BUY", priceUnits: 660_000n, acceptedSequence: 2n }),
      order({ orderHash: "0x03", side: "SELL", priceUnits: 700_000n, acceptedSequence: 3n }),
      order({ orderHash: "0x04", side: "SELL", priceUnits: 680_000n, acceptedSequence: 4n }),
    ]);

    const snapshot = book.snapshot();

    assert.deepEqual(
      snapshot.bids.map((level) => level.priceUnits),
      [660_000n, 640_000n]
    );
    assert.deepEqual(
      snapshot.asks.map((level) => level.priceUnits),
      [680_000n, 700_000n]
    );
  });

  it("aggregates available amounts at the same price level", () => {
    const book = InMemoryOrderBook.fromOrders(key, [
      order({ orderHash: "0x01", side: "BUY", priceUnits: 650_000n, acceptedSequence: 1n }),
      order({ orderHash: "0x02", side: "BUY", priceUnits: 650_000n, acceptedSequence: 2n }),
    ]);

    assert.deepEqual(book.snapshot().bids, [
      {
        priceUnits: 650_000n,
        totalRemainingOutcomeAmount: 200_000_000n,
      },
    ]);
  });

  it("ignores non-live and fully pending orders", () => {
    const book = InMemoryOrderBook.fromOrders(key, [
      order({ orderHash: "0x01", side: "BUY", status: "CANCELLED" }),
      order({
        orderHash: "0x02",
        side: "BUY",
        pendingMatchedOutcomeAmount: 100_000_000n,
      }),
    ]);

    assert.deepEqual(book.snapshot().bids, []);
  });

  it("removes an order from its price level", () => {
    const book = InMemoryOrderBook.fromOrders(key, [
      order({ orderHash: "0x01", side: "BUY", priceUnits: 650_000n }),
      order({ orderHash: "0x02", side: "BUY", priceUnits: 650_000n }),
    ]);

    book.removeOrder("0x01");

    assert.deepEqual(book.snapshot().bids, [
      {
        priceUnits: 650_000n,
        totalRemainingOutcomeAmount: 100_000_000n,
      },
    ]);
  });

  it("derives price units from signed amounts", () => {
    assert.equal(
      getOrderPriceUnits(order({ orderHash: "0x01", side: "BUY", priceUnits: 650_000n })),
      650_000n
    );
  });
});

function order(overrides: {
  orderHash: Hex;
  side: OrderSide;
  priceUnits?: bigint;
  status?: ClobOrder["status"];
  pendingMatchedOutcomeAmount?: bigint;
  acceptedSequence?: bigint;
}): ClobOrder {
  const outcomeAmount = 100_000_000n;
  const priceUnits = overrides.priceUnits ?? 650_000n;

  return {
    orderHash: overrides.orderHash,
    maker: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    outcomeToken: key.outcomeToken,
    marketId: key.marketId,
    outcome: key.outcome,
    side: overrides.side,
    outcomeAmount,
    usdcAmount: (priceUnits * outcomeAmount) / 1_000_000n,
    expiration: new Date(1_800_000_000_000),
    nonce: 1n,
    signature: "0xbb",
    timeInForce: "GTC",
    remainingOutcomeAmount: outcomeAmount,
    pendingMatchedOutcomeAmount: overrides.pendingMatchedOutcomeAmount ?? 0n,
    status: overrides.status ?? "LIVE",
    acceptedSequence: overrides.acceptedSequence ?? 1n,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
