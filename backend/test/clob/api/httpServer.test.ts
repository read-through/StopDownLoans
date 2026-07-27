import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { once } from "node:events";
import { createClobHttpServer } from "../../../src/clob/api/httpServer.js";

describe("createClobHttpServer", () => {
  it("returns public service health with sync cursor lag", async () => {
    const queries: unknown[] = [];
    const publicClient = {
      getBlockNumber: async () => 105n,
    };
    const dbClient = {
      query: async (sql: string, values: unknown[]) => {
        queries.push({ sql, values });
        return {
          rowCount: 1,
          rows: [{ block_number: "100" }],
        };
      },
    };
    const server = createClobHttpServer({
      config: testConfig(),
      publicClient: publicClient as never,
      dbClient: dbClient as never,
      now: () => new Date("2026-07-23T10:00:00.000Z"),
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/health`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        status: "ok",
        service: "clob-backend",
        timestamp: "2026-07-23T10:00:00.000Z",
        chainId: 5042002,
        contracts: {
          loanPositionToken: "0x0000000000000000000000000000000000000003",
          outcomeExchange: "0x0000000000000000000000000000000000000001",
          usdc: "0x0000000000000000000000000000000000000002",
        },
        executorEnabled: false,
        confirmationDepth: "1",
        sync: {
          status: "ok",
          cursorName: "outcome_exchange_events",
          latestBlock: "105",
          safeHeadBlock: "104",
          lastIndexedBlock: "100",
          lagBlocks: "4",
        },
      });
      assert.equal(queries.length, 1);
    } finally {
      await close();
    }
  });

  it("keeps health available when sync health cannot be read", async () => {
    const server = createClobHttpServer({
      config: testConfig(),
      publicClient: {
        getBlockNumber: async () => {
          throw new Error("rpc unavailable");
        },
      } as never,
      dbClient: {
        query: async () => {
          throw new Error("db unavailable");
        },
      } as never,
      now: () => new Date("2026-07-23T10:00:00.000Z"),
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/health`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.status, "ok");
      assert.equal(body.sync.status, "unavailable");
      assert.equal(body.sync.cursorName, "outcome_exchange_events");
      assert.equal(typeof body.sync.error, "string");
    } finally {
      await close();
    }
  });

  it("handles browser CORS preflight requests", async () => {
    const server = createClobHttpServer({
      config: testConfig(),
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/markets`, {
        method: "OPTIONS",
        headers: {
          origin: "http://127.0.0.1:5173",
          "access-control-request-method": "GET",
        },
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
    } finally {
      await close();
    }
  });

  it("routes order submissions to the write service", async () => {
    const calls: unknown[] = [];
    const publicClient = { transport: "hardhat-test-client" };
    const requestBody = {
      order: {
        maker: "0x0000000000000000000000000000000000000001",
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
        side: "BUY",
        outcomeAmount: "100000000",
        usdcAmount: "65000000",
        expiration: "2026-07-21T13:00:00.000Z",
        nonce: "12",
      },
      signature: "0x1234",
      timeInForce: "GTC",
      priceUnits: 650000,
    };
    const server = createClobHttpServer({
      config: testConfig(),
      publicClient: publicClient as never,
      writeServices: {
        submitOrderRequest: async (request, config) => {
          calls.push(request);
          assert.equal(config.publicClient, publicClient);
          return {
            orderHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            status: "LIVE",
            remainingOutcomeAmount: "100000000",
            pendingMatchedOutcomeAmount: "0",
            availableForMatching: "100000000",
            isPartiallyFilled: false,
            priceUnits: 650000,
            createdTradeIds: [],
            rested: true,
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.deepEqual(calls, [requestBody]);
      assert.equal(body.orderHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.equal(body.rested, true);
    } finally {
      await close();
    }
  });

  it("routes cancellation using the order hash from the path", async () => {
    const pathOrderHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const bodyOrderHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const calls: unknown[] = [];
    const server = createClobHttpServer({
      config: testConfig(),
      writeServices: {
        cancelOrderRequest: async (request) => {
          calls.push(request);
          return {
            orderHash: pathOrderHash,
            status: "CANCELLED",
            cancelledAvailableOutcomeAmount: "100000000",
            pendingMatchedOutcomeAmount: "0",
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/orders/${pathOrderHash}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          cancel: {
            maker: "0x0000000000000000000000000000000000000001",
            orderHash: bodyOrderHash,
            expiration: "2026-07-21T13:00:00.000Z",
            nonce: "77",
          },
          signature: "0x1234",
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          cancel: {
            maker: "0x0000000000000000000000000000000000000001",
            orderHash: pathOrderHash,
            expiration: "2026-07-21T13:00:00.000Z",
            nonce: "77",
          },
          signature: "0x1234",
        },
      ]);
      assert.equal(body.orderHash, pathOrderHash);
    } finally {
      await close();
    }
  });

  it("routes market config reads without requiring admin auth", async () => {
    const calls: unknown[] = [];
    const server = createClobHttpServer({
      config: testConfig(),
      dbClient: {} as never,
      readServices: {
        getMarketConfigView: async (_client, params) => {
          calls.push(params);
          return {
            outcomeToken: params.outcomeToken,
            marketId: params.marketId,
            clobEnabled: true,
            defaultTickUnits: "10000",
            edgeTickUnits: "1000",
            lowerEdgePriceUnits: "100000",
            upperEdgePriceUnits: "900000",
            minOrderOutcomeAmount: null,
            maxOrderOutcomeAmount: null,
            createdAt: "2026-07-21T12:00:00.000Z",
            updatedAt: "2026-07-21T12:00:00.000Z",
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(
        `${baseUrl}/v1/market-configs/0x0000000000000000000000000000000000000002/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          outcomeToken: "0x0000000000000000000000000000000000000002",
          marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ]);
      assert.equal(body.clobEnabled, true);
      assert.equal(body.defaultTickUnits, "10000");
    } finally {
      await close();
    }
  });

  it("routes market list reads through the database snapshot", async () => {
    const calls: unknown[] = [];
    const server = createClobHttpServer({
      config: testConfig(),
      dbClient: {} as never,
      readServices: {
        getMarketsView: async (client, params) => {
          calls.push({ client, params });
          return {
            markets: [
              {
                outcomeToken: "0x0000000000000000000000000000000000000002",
                marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                clobEnabled: true,
                defaultTickUnits: "10000",
                edgeTickUnits: "1000",
                lowerEdgePriceUnits: "100000",
                upperEdgePriceUnits: "900000",
                minOrderOutcomeAmount: null,
                maxOrderOutcomeAmount: null,
                createdAt: "2026-07-21T12:00:00.000Z",
                updatedAt: "2026-07-21T12:00:00.000Z",
                yesBestBid: null,
                yesBestAsk: {
                  priceUnits: 650000,
                  totalRemainingOutcomeAmount: "1000000",
                },
                confirmedUsdcVolume: "450000",
                loan: {
                  loanId: "2",
                  borrower: "0x0000000000000000000000000000000000000004",
                  principal: "1000000000",
                  repaymentAmount: "1050000000",
                  state: "ACTIVE",
                  activationDeadline: "1780003600",
                  repaymentDeadline: "1782595600",
                },
              },
            ],
            nextCursor: null,
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/markets`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          client: {},
          params: {
            limit: 100,
            cursor: undefined,
          },
        },
      ]);
      assert.equal(body.markets.length, 1);
      assert.equal(body.markets[0].clobEnabled, true);
      assert.equal(body.markets[0].yesBestAsk.priceUnits, 650000);
      assert.equal(body.markets[0].confirmedUsdcVolume, "450000");
      assert.equal(body.markets[0].loan.loanId, "2");
    } finally {
      await close();
    }
  });

  it("routes recent trade reads with market filters", async () => {
    const calls: unknown[] = [];
    const server = createClobHttpServer({
      config: testConfig(),
      dbClient: {} as never,
      readServices: {
        getTradesView: async (client, params) => {
          calls.push({ client, params });
          return {
            trades: [
              {
                tradeId: "9",
                outcomeToken: "0x0000000000000000000000000000000000000002",
                marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                outcome: "YES",
                totalOutcomeAmount: "1000000",
                totalUsdcAmount: "640000",
                status: "CONFIRMED",
                txHash: null,
                createdAt: "2026-07-21T12:00:00.000Z",
                confirmedAt: null,
              },
            ],
            nextCursor: null,
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(
        `${baseUrl}/v1/trades?outcomeToken=0x0000000000000000000000000000000000000002&marketId=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&outcome=YES&limit=8&cursor=opaque`
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          client: {},
          params: {
            outcomeToken: "0x0000000000000000000000000000000000000002",
            marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            outcome: "YES",
            limit: 8,
            cursor: "opaque",
          },
        },
      ]);
      assert.equal(body.trades[0].tradeId, "9");
    } finally {
      await close();
    }
  });

  it("routes account reservation reads by maker", async () => {
    const calls: unknown[] = [];
    const maker = "0x0000000000000000000000000000000000000004";
    const server = createClobHttpServer({
      config: testConfig(),
      dbClient: {} as never,
      readServices: {
        getReservationsView: async (client, account) => {
          calls.push({ client, account });
          return {
            maker: account,
            reservations: [
              {
                assetType: "ERC20",
                assetAddress: "0x0000000000000000000000000000000000000002",
                tokenId: "0",
                reservedAmount: "1250000",
                updatedAt: "2026-07-21T12:00:00.000Z",
              },
            ],
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/reservations?maker=${maker}`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          client: {},
          account: maker,
        },
      ]);
      assert.equal(body.maker, maker);
      assert.equal(body.reservations[0].reservedAmount, "1250000");
    } finally {
      await close();
    }
  });

  it("routes paginated loan reads through the database snapshot", async () => {
    const calls: unknown[] = [];
    const server = createClobHttpServer({
      config: testConfig(),
      dbClient: {} as never,
      readServices: {
        getLoansView: async (client, params) => {
          calls.push({ client, params });
          return {
            loans: [
              {
                loanId: "2",
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
                borrowerCollateralAmount: "1050000000",
                borrowerCollateralDepositedAmount: "250000000",
                marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
            nextCursor: "1",
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/loans?limit=25&cursor=2`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          client: {},
          params: {
            limit: 25,
            cursor: "2",
          },
        },
      ]);
      assert.equal(body.loans[0].loanId, "2");
      assert.equal(body.nextCursor, "1");
    } finally {
      await close();
    }
  });

  it("routes account loan position reads through the configured loan contract", async () => {
    const calls: unknown[] = [];
    const publicClient = { transport: "hardhat-test-client" };
    const account = "0x0000000000000000000000000000000000000004";
    const server = createClobHttpServer({
      config: testConfig(),
      publicClient: publicClient as never,
      readServices: {
        getLoanPositionsView: async (client, params) => {
          calls.push({ client, params });
          return {
            positions: [
              {
                positionId: "7",
                loanId: "2",
                principalAmount: "250000000",
                claimedAmount: "0",
                claimableAmount: "250000000",
                balance: "1",
                split: false,
              },
            ],
            nextCursor: "6",
          };
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/loan-positions?account=${account}&limit=10&cursor=7`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        {
          client: publicClient,
          params: {
            loanPositionToken: "0x0000000000000000000000000000000000000003",
            account,
            limit: 10,
            cursor: "7",
          },
        },
      ]);
      assert.equal(body.positions[0].positionId, "7");
      assert.equal(body.nextCursor, "6");
    } finally {
      await close();
    }
  });

  it("returns JSON errors for invalid routes", async () => {
    const server = createClobHttpServer({
      config: testConfig(),
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/missing`);
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(body, {
        error: {
          code: "INVALID_ORDER",
          message: "Route not found.",
        },
      });
    } finally {
      await close();
    }
  });

  it("returns a rate-limit error when an RPC-backed read is throttled", async () => {
    const server = createClobHttpServer({
      config: testConfig(),
      publicClient: { transport: "hardhat-test-client" } as never,
      readServices: {
        getLoanPositionsView: async () => {
          throw new Error("request limit reached");
        },
      },
    });
    const { baseUrl, close } = await listen(server);

    try {
      const response = await fetch(
        `${baseUrl}/v1/loan-positions?account=0x0000000000000000000000000000000000000004`
      );
      const body = await response.json();

      assert.equal(response.status, 429);
      assert.deepEqual(body, {
        error: {
          code: "RATE_LIMITED",
          message: "request limit reached",
        },
      });
    } finally {
      await close();
    }
  });
});

function testConfig() {
  return {
    databaseUrl: "postgres://stopdown:stopdown@localhost:5432/stopdown",
    arcRpcUrl: "https://rpc.example",
    chainId: 5042002,
    loanPositionToken: "0x0000000000000000000000000000000000000003" as const,
    outcomeExchange: "0x0000000000000000000000000000000000000001" as const,
    usdc: "0x0000000000000000000000000000000000000002" as const,
    expiredOrderSweepIntervalMs: 5000,
    expiredOrderSweepLimit: 100,
    reconciliationIntervalMs: 3000,
    reconciliationConfirmationDepth: 1n,
    reconciliationStartBlock: 0n,
    reconciliationMaxBlocksPerRun: 1000n,
    executorPrivateKey: null,
    executorIntervalMs: 1000,
    executorBatchLimit: 10,
    executorExecutingTradeTimeoutMs: 60000,
    lendingKeeperIntervalMs: 3000,
    lendingKeeperScanLimit: 100,
    receiptSweepIntervalMs: 3000,
    receiptSweepLimit: 100,
    receiptDroppedTimeoutMs: 60000,
    marketConfigEventSweepIntervalMs: 3000,
    marketConfigEventSweepLimit: 100,
    loanSnapshotSyncIntervalMs: 3000,
    loanSnapshotSyncLimit: 100,
  };
}

async function listen(server: ReturnType<typeof createClobHttpServer>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Expected TCP server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}
