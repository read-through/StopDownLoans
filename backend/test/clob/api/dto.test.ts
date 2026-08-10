import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClobOrder } from "../../../src/clob/types.js";
import {
  toApiBestBidAskDto,
  toApiBookDeltaDto,
  toApiBookSnapshotDto,
  toApiCancelOrderResponseDto,
  toApiMarketClosedDto,
  toApiMarketConfigDto,
  toApiMarketSummaryDto,
  toApiMarketOpenedDto,
  toApiLoanDto,
  toApiLoanPositionDto,
  toApiOrderDto,
  toApiReservationDto,
  toApiSubmitOrderResponseDto,
  toApiTickSizeChangeDto,
  toApiTradeDto,
} from "../../../src/clob/api/dto.js";

describe("api dto serializers", () => {
  it("serializes order amounts as strings and derived fields", () => {
    const dto = toApiOrderDto(makeOrder());

    assert.equal(dto.order.outcomeAmount, "100000000");
    assert.equal(dto.order.usdcAmount, "65000000");
    assert.equal(dto.priceUnits, 650000);
    assert.equal(dto.remainingOutcomeAmount, "60000000");
    assert.equal(dto.pendingMatchedOutcomeAmount, "10000000");
    assert.equal(dto.availableForMatching, "50000000");
    assert.equal(dto.isPartiallyFilled, true);
    assert.equal(dto.acceptedSequence, "42");
  });

  it("serializes L2 book snapshots without bigint values", () => {
    const dto = toApiBookSnapshotDto(
      {
        key: {
          outcomeToken: "0x0000000000000000000000000000000000000002",
          marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "YES",
        },
        bids: [{ priceUnits: 650000n, totalRemainingOutcomeAmount: 40_000_000n }],
        asks: [{ priceUnits: 660000n, totalRemainingOutcomeAmount: 25_000_000n }],
      },
      {
        sequence: 1042n,
        timestamp: new Date("2026-07-21T12:00:00.000Z"),
      }
    );

    assert.equal(dto.sequence, "1042");
    assert.deepEqual(dto.bids[0], {
      priceUnits: 650000,
      totalRemainingOutcomeAmount: "40000000",
    });
  });

  it("serializes L2 book deltas with changed and removed price levels", () => {
    const previous = toApiBookSnapshotDto(
      {
        key: {
          outcomeToken: "0x0000000000000000000000000000000000000002",
          marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "YES",
        },
        bids: [
          { priceUnits: 650000n, totalRemainingOutcomeAmount: 40_000_000n },
          { priceUnits: 640000n, totalRemainingOutcomeAmount: 10_000_000n },
        ],
        asks: [{ priceUnits: 660000n, totalRemainingOutcomeAmount: 25_000_000n }],
      },
      {
        sequence: 1n,
        timestamp: new Date("2026-07-21T12:00:00.000Z"),
      }
    );
    const current = toApiBookSnapshotDto(
      {
        key: {
          outcomeToken: "0x0000000000000000000000000000000000000002",
          marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "YES",
        },
        bids: [{ priceUnits: 650000n, totalRemainingOutcomeAmount: 15_000_000n }],
        asks: [{ priceUnits: 670000n, totalRemainingOutcomeAmount: 30_000_000n }],
      },
      {
        sequence: 2n,
        timestamp: new Date("2026-07-21T12:00:01.000Z"),
      }
    );

    assert.deepEqual(
      toApiBookDeltaDto(previous, current, {
        sequence: 2n,
        timestamp: new Date("2026-07-21T12:00:01.000Z"),
      }),
      {
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
        sequence: "2",
        bids: [
          { priceUnits: 650000, totalRemainingOutcomeAmount: "15000000" },
          { priceUnits: 640000, totalRemainingOutcomeAmount: "0" },
        ],
        asks: [
          { priceUnits: 670000, totalRemainingOutcomeAmount: "30000000" },
          { priceUnits: 660000, totalRemainingOutcomeAmount: "0" },
        ],
        timestamp: "2026-07-21T12:00:01.000Z",
      }
    );
  });

  it("serializes best bid and ask from an L2 snapshot", () => {
    const snapshot = toApiBookSnapshotDto(
      {
        key: {
          outcomeToken: "0x0000000000000000000000000000000000000002",
          marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "YES",
        },
        bids: [{ priceUnits: 650000n, totalRemainingOutcomeAmount: 40_000_000n }],
        asks: [],
      },
      {
        sequence: 1n,
        timestamp: new Date("2026-07-21T12:00:00.000Z"),
      }
    );

    assert.deepEqual(
      toApiBestBidAskDto(snapshot, {
        sequence: 2n,
        timestamp: new Date("2026-07-21T12:00:01.000Z"),
      }),
      {
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
        sequence: "2",
        bestBid: { priceUnits: 650000, totalRemainingOutcomeAmount: "40000000" },
        bestAsk: null,
        timestamp: "2026-07-21T12:00:01.000Z",
      }
    );
  });

  it("serializes market config feed events", () => {
    const config = {
      outcomeToken: "0x0000000000000000000000000000000000000002" as const,
      marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      defaultTickUnits: 10_000n,
      edgeTickUnits: 1_000n,
      lowerEdgePriceUnits: 100_000n,
      upperEdgePriceUnits: 900_000n,
    };
    const params = {
      sequence: 7n,
      timestamp: new Date("2026-07-21T12:00:01.000Z"),
    };

    assert.deepEqual(toApiTickSizeChangeDto(config, params), {
      outcomeToken: config.outcomeToken,
      marketId: config.marketId,
      sequence: "7",
      defaultTickUnits: "10000",
      edgeTickUnits: "1000",
      lowerEdgePriceUnits: "100000",
      upperEdgePriceUnits: "900000",
      timestamp: "2026-07-21T12:00:01.000Z",
    });
    assert.deepEqual(toApiMarketClosedDto(config, params), {
      outcomeToken: config.outcomeToken,
      marketId: config.marketId,
      sequence: "7",
      timestamp: "2026-07-21T12:00:01.000Z",
    });
    assert.deepEqual(toApiMarketOpenedDto(config, params), {
      outcomeToken: config.outcomeToken,
      marketId: config.marketId,
      sequence: "7",
      timestamp: "2026-07-21T12:00:01.000Z",
    });
  });

  it("serializes market configs", () => {
    const config = makeMarketConfig();

    assert.deepEqual(
      toApiMarketConfigDto(config),
      {
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        clobEnabled: true,
        defaultTickUnits: "10000",
        edgeTickUnits: "1000",
        lowerEdgePriceUnits: "100000",
        upperEdgePriceUnits: "900000",
        minOrderOutcomeAmount: "1000000",
        maxOrderOutcomeAmount: null,
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:01:00.000Z",
      }
    );
  });

  it("serializes market summaries", () => {
    assert.deepEqual(
      toApiMarketSummaryDto(makeMarketConfig(), {
        yesBestBid: { priceUnits: 640_000n, totalRemainingOutcomeAmount: 25_000_000n },
        yesBestAsk: null,
        confirmedUsdcVolume: 450_000n,
      }),
      {
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        clobEnabled: true,
        defaultTickUnits: "10000",
        edgeTickUnits: "1000",
        lowerEdgePriceUnits: "100000",
        upperEdgePriceUnits: "900000",
        minOrderOutcomeAmount: "1000000",
        maxOrderOutcomeAmount: null,
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:01:00.000Z",
        yesBestBid: {
          priceUnits: 640000,
          totalRemainingOutcomeAmount: "25000000",
        },
        yesBestAsk: null,
        confirmedUsdcVolume: "450000",
        loan: null,
      }
    );
  });

  it("serializes loan views without bigint values", () => {
    assert.deepEqual(
      toApiLoanDto({
        loanId: 3n,
        borrower: "0x0000000000000000000000000000000000000004",
        principal: 1_000_000_000n,
        repaymentAmount: 1_050_000_000n,
        loanWithdrawFreezeDeadline: 1_780_000_000n,
        activationDeadline: 1_780_003_600n,
        repaymentDeadline: 1_782_595_600n,
        fundedAmount: 720_000_000n,
        creditedAmount: 0n,
        repaymentSatisfiedAt: 0n,
        feeClaimedAmount: 0n,
        state: "FUNDING",
        interestBps: 500n,
        feeBps: 50n,
        feeRecipient: "0x0000000000000000000000000000000000000005",
        collateralBps: 10_000n,
        borrowerCollateralAmount: 1_000_000_000n,
        borrowerCollateralDepositedAmount: 250_000_000n,
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        syncedAt: new Date("2026-07-21T12:00:00.000Z"),
        updatedAt: new Date("2026-07-21T12:01:00.000Z"),
      }),
      {
        loanId: "3",
        borrower: "0x0000000000000000000000000000000000000004",
        principal: "1000000000",
        repaymentAmount: "1050000000",
        loanWithdrawFreezeDeadline: "1780000000",
        activationDeadline: "1780003600",
        repaymentDeadline: "1782595600",
        fundedAmount: "720000000",
        creditedAmount: "0",
        repaymentSatisfiedAt: "0",
        feeClaimedAmount: "0",
        state: "FUNDING",
        interestBps: "500",
        feeBps: "50",
        feeRecipient: "0x0000000000000000000000000000000000000005",
        collateralBps: "10000",
        borrowerCollateralAmount: "1000000000",
        borrowerCollateralDepositedAmount: "250000000",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }
    );
  });

  it("serializes loan positions without bigint values", () => {
    assert.deepEqual(
      toApiLoanPositionDto({
        positionId: 7n,
        loanId: 3n,
        principalAmount: 250_000_000n,
        claimedAmount: 10_000_000n,
        claimableAmount: 30_000_000n,
        balance: 1n,
        split: true,
      }),
      {
        positionId: "7",
        loanId: "3",
        principalAmount: "250000000",
        claimedAmount: "10000000",
        claimableAmount: "30000000",
        balance: "1",
        split: true,
      }
    );
  });

  it("serializes trades and reservations", () => {
    assert.equal(
      toApiTradeDto({
        tradeId: 123n,
        takerOrderHash: "0x01",
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
        totalOutcomeAmount: 40_000_000n,
        totalUsdcAmount: 26_000_000n,
        status: "CONFIRMED",
        txHash: "0x02",
        submittedAt: null,
        minedAt: null,
        confirmedAt: new Date("2026-07-21T12:00:02.000Z"),
        createdAt: new Date("2026-07-21T12:00:01.000Z"),
        updatedAt: new Date("2026-07-21T12:00:02.000Z"),
      }).tradeId,
      "123"
    );

    assert.deepEqual(
      toApiReservationDto({
        maker: "0x0000000000000000000000000000000000000001",
        assetType: "ERC20",
        assetAddress: "0x0000000000000000000000000000000000000003",
        tokenId: 0n,
        reservedAmount: 65_000_000n,
        updatedAt: new Date("2026-07-21T12:00:00.000Z"),
      }),
      {
        assetType: "ERC20",
        assetAddress: "0x0000000000000000000000000000000000000003",
        tokenId: "0",
        reservedAmount: "65000000",
        updatedAt: "2026-07-21T12:00:00.000Z",
      }
    );
  });

  it("serializes submit and cancel responses", () => {
    const order = makeOrder();

    assert.deepEqual(
      toApiSubmitOrderResponseDto({
        order,
        reservationAmount: 65_000_000n,
        trade: null,
      }),
      {
        orderHash: "0x01",
        status: "LIVE",
        remainingOutcomeAmount: "60000000",
        pendingMatchedOutcomeAmount: "10000000",
        availableForMatching: "50000000",
        isPartiallyFilled: true,
        priceUnits: 650000,
        createdTradeIds: [],
        rested: true,
      }
    );

    assert.deepEqual(
      toApiCancelOrderResponseDto({
        order: {
          ...order,
          status: "CANCELLED",
        },
        cancelledAvailableOutcomeAmount: 50_000_000n,
        reservationReleaseAmount: 32_500_000n,
      }),
      {
        orderHash: "0x01",
        status: "CANCELLED",
        cancelledAvailableOutcomeAmount: "50000000",
        pendingMatchedOutcomeAmount: "10000000",
      }
    );
  });
});

function makeOrder(): ClobOrder {
  return {
    orderHash: "0x01",
    maker: "0x0000000000000000000000000000000000000001",
    outcomeToken: "0x0000000000000000000000000000000000000002",
    marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    outcome: "YES",
    side: "BUY",
    outcomeAmount: 100_000_000n,
    usdcAmount: 65_000_000n,
    expiration: new Date("2026-07-21T13:00:00.000Z"),
    nonce: 12n,
    signature: "0x03",
    timeInForce: "GTC",
    remainingOutcomeAmount: 60_000_000n,
    pendingMatchedOutcomeAmount: 10_000_000n,
    status: "LIVE",
    acceptedSequence: 42n,
    createdAt: new Date("2026-07-21T12:00:00.000Z"),
    updatedAt: new Date("2026-07-21T12:01:00.000Z"),
  };
}

function makeMarketConfig() {
  return {
    outcomeToken: "0x0000000000000000000000000000000000000002" as const,
    marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    clobEnabled: true,
    defaultTickUnits: 10_000n,
    edgeTickUnits: 1_000n,
    lowerEdgePriceUnits: 100_000n,
    upperEdgePriceUnits: 900_000n,
    minOrderOutcomeAmount: 1_000_000n,
    maxOrderOutcomeAmount: null,
    createdAt: new Date("2026-07-21T12:00:00.000Z"),
    updatedAt: new Date("2026-07-21T12:01:00.000Z"),
  };
}
