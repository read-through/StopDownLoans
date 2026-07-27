import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMatchOrdersArgs, toContractOrder } from "../../../src/clob/executor/calldata.js";
import type { ClobOrder, Hex, OrderSide, TradeFill } from "../../../src/clob/types.js";

describe("matchOrders calldata builder", () => {
  it("maps backend order fields to contract order fields", () => {
    const order = clobOrder({
      orderHash: "0x01",
      side: "SELL",
      outcome: "NO",
    });

    assert.deepEqual(toContractOrder(order), {
      maker: order.maker,
      outcomeToken: order.outcomeToken,
      marketId: order.marketId,
      outcome: 1,
      side: 1,
      outcomeAmount: order.outcomeAmount,
      usdcAmount: order.usdcAmount,
      expiration: 1_800_000_000n,
      nonce: order.nonce,
    });
  });

  it("orders maker arrays by trade fill order", () => {
    const taker = clobOrder({ orderHash: "0x01", side: "BUY" });
    const firstMaker = clobOrder({ orderHash: "0x02", side: "SELL", signature: "0xaa" });
    const secondMaker = clobOrder({ orderHash: "0x03", side: "SELL", signature: "0xbb" });
    const args = buildMatchOrdersArgs({
      taker,
      makers: [secondMaker, firstMaker],
      fills: [
        tradeFill({ makerOrderHash: firstMaker.orderHash, makerFillAmount: 40n }),
        tradeFill({ makerOrderHash: secondMaker.orderHash, makerFillAmount: 60n }),
      ],
    });

    assert.deepEqual(
      args.makerOrders.map((order) => order.maker),
      [firstMaker.maker, secondMaker.maker]
    );
    assert.deepEqual(args.makerSignatures, ["0xaa", "0xbb"]);
    assert.deepEqual(args.makerFillAmounts, [40n, 60n]);
  });

  it("rejects fills without a corresponding maker order", () => {
    const taker = clobOrder({ orderHash: "0x01", side: "BUY" });

    assert.throws(() =>
      buildMatchOrdersArgs({
        taker,
        makers: [],
        fills: [tradeFill({ makerOrderHash: "0x02", makerFillAmount: 40n })],
      })
    );
  });
});

function clobOrder(overrides: {
  orderHash: Hex;
  side: OrderSide;
  outcome?: ClobOrder["outcome"];
  signature?: Hex;
}): ClobOrder {
  return {
    orderHash: overrides.orderHash,
    maker: makerForHash(overrides.orderHash),
    outcomeToken: "0x1111111111111111111111111111111111111111",
    marketId: "0x2222222222222222222222222222222222222222222222222222222222222222",
    outcome: overrides.outcome ?? "YES",
    side: overrides.side,
    outcomeAmount: 100n,
    usdcAmount: 65n,
    expiration: new Date(1_800_000_000_000),
    nonce: 1n,
    signature: overrides.signature ?? "0xcc",
    timeInForce: "GTC",
    remainingOutcomeAmount: 100n,
    pendingMatchedOutcomeAmount: 0n,
    status: "LIVE",
    acceptedSequence: 1n,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function tradeFill(overrides: {
  makerOrderHash: Hex;
  makerFillAmount: bigint;
}): TradeFill {
  return {
    tradeFillId: 1n,
    tradeId: 1n,
    takerOrderHash: "0x01",
    makerOrderHash: overrides.makerOrderHash,
    makerFillAmount: overrides.makerFillAmount,
    makerUsdcAmount: 1n,
    makerPriceNumerator: 65n,
    makerPriceDenominator: 100n,
    createdAt: new Date(0),
  };
}

function makerForHash(hash: Hex): Hex {
  const suffix = hash.slice(2).padStart(40, "0");
  return `0x${suffix}`;
}
