import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchTakerOrder } from "../../src/clob/matching.js";
import type { ClobOrder, Hex, OrderSide } from "../../src/clob/types.js";

const base = {
  outcomeToken: "0x1111111111111111111111111111111111111111" as Hex,
  marketId: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
  outcome: "YES" as const,
};

describe("matchTakerOrder", () => {
  it("matches a BUY taker against cheapest SELL makers first", () => {
    const taker = order({ orderHash: "0x01", side: "BUY", priceUnits: 700_000n });
    const result = matchTakerOrder(taker, [
      order({ orderHash: "0x02", side: "SELL", priceUnits: 680_000n, acceptedSequence: 2n }),
      order({
        orderHash: "0x03",
        side: "SELL",
        priceUnits: 650_000n,
        outcomeAmount: 40_000_000n,
        acceptedSequence: 3n,
      }),
    ]);

    assert.deepEqual(
      result.fills.map((fill) => fill.makerOrderHash),
      ["0x03", "0x02"]
    );
    assert.equal(result.filledOutcomeAmount, 100_000_000n);
    assert.equal(result.totalUsdcAmount, 66_800_000n);
  });

  it("matches a SELL taker against highest BUY makers first", () => {
    const taker = order({ orderHash: "0x01", side: "SELL", priceUnits: 600_000n });
    const result = matchTakerOrder(taker, [
      order({ orderHash: "0x02", side: "BUY", priceUnits: 620_000n, acceptedSequence: 2n }),
      order({
        orderHash: "0x03",
        side: "BUY",
        priceUnits: 650_000n,
        outcomeAmount: 40_000_000n,
        acceptedSequence: 3n,
      }),
    ]);

    assert.deepEqual(
      result.fills.map((fill) => fill.makerOrderHash),
      ["0x03", "0x02"]
    );
    assert.equal(result.filledOutcomeAmount, 100_000_000n);
    assert.equal(result.totalUsdcAmount, 63_200_000n);
  });

  it("uses FIFO for makers at the same price", () => {
    const taker = order({
      orderHash: "0x01",
      side: "BUY",
      priceUnits: 700_000n,
      outcomeAmount: 150_000_000n,
    });
    const result = matchTakerOrder(taker, [
      order({ orderHash: "0x02", side: "SELL", priceUnits: 650_000n, acceptedSequence: 2n }),
      order({ orderHash: "0x03", side: "SELL", priceUnits: 650_000n, acceptedSequence: 1n }),
    ]);

    assert.deepEqual(
      result.fills.map((fill) => fill.makerOrderHash),
      ["0x03", "0x02"]
    );
  });

  it("partially fills when maker liquidity is smaller than taker amount", () => {
    const taker = order({
      orderHash: "0x01",
      side: "BUY",
      priceUnits: 700_000n,
      outcomeAmount: 100_000_000n,
    });
    const result = matchTakerOrder(taker, [
      order({
        orderHash: "0x02",
        side: "SELL",
        priceUnits: 650_000n,
        outcomeAmount: 40_000_000n,
      }),
    ]);

    assert.equal(result.filledOutcomeAmount, 40_000_000n);
    assert.equal(result.remainingTakerOutcomeAmount, 60_000_000n);
    assert.equal(result.totalUsdcAmount, 26_000_000n);
  });

  it("ignores non-crossing makers", () => {
    const taker = order({ orderHash: "0x01", side: "BUY", priceUnits: 600_000n });
    const result = matchTakerOrder(taker, [
      order({ orderHash: "0x02", side: "SELL", priceUnits: 650_000n }),
    ]);

    assert.equal(result.filledOutcomeAmount, 0n);
    assert.deepEqual(result.fills, []);
  });

  it("calculates maker USDC fill as cumulative on-chain delta", () => {
    const taker = order({
      orderHash: "0x01",
      side: "BUY",
      priceUnits: 700_000n,
      outcomeAmount: 10n,
    });
    const maker = order({
      orderHash: "0x02",
      side: "SELL",
      priceUnits: 333_333n,
      outcomeAmount: 3n,
      usdcAmount: 1n,
      remainingOutcomeAmount: 2n,
    });
    const result = matchTakerOrder(taker, [maker]);

    assert.equal(result.fills[0].makerFillAmount, 2n);
    assert.equal(result.fills[0].makerUsdcAmount, 1n);
  });
});

function order(overrides: {
  orderHash: Hex;
  side: OrderSide;
  priceUnits?: bigint;
  outcomeAmount?: bigint;
  usdcAmount?: bigint;
  remainingOutcomeAmount?: bigint;
  pendingMatchedOutcomeAmount?: bigint;
  acceptedSequence?: bigint;
}): ClobOrder {
  const outcomeAmount = overrides.outcomeAmount ?? 100_000_000n;
  const priceUnits = overrides.priceUnits ?? 650_000n;
  const usdcAmount = overrides.usdcAmount ?? (priceUnits * outcomeAmount) / 1_000_000n;

  return {
    orderHash: overrides.orderHash,
    maker: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    outcomeToken: base.outcomeToken,
    marketId: base.marketId,
    outcome: base.outcome,
    side: overrides.side,
    outcomeAmount,
    usdcAmount,
    expiration: new Date(1_800_000_000_000),
    nonce: 1n,
    signature: "0xbb",
    timeInForce: "GTC",
    remainingOutcomeAmount: overrides.remainingOutcomeAmount ?? outcomeAmount,
    pendingMatchedOutcomeAmount: overrides.pendingMatchedOutcomeAmount ?? 0n,
    status: "LIVE",
    acceptedSequence: overrides.acceptedSequence ?? 1n,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
