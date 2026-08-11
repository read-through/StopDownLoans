import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { network } from "hardhat";
import WebSocket from "ws";
import { BookFeedPublisher } from "../../backend/src/clob/api/bookFeedPublisher.js";
import { createClobHttpServer } from "../../backend/src/clob/api/httpServer.js";
import { attachClobWebSocketFeed } from "../../backend/src/clob/api/webSocketFeed.js";
import { closePool, getPool } from "../../backend/src/clob/db/client.js";
import { upsertMarketConfig } from "../../backend/src/clob/db/marketConfigs.js";
import { getOrderByHash } from "../../backend/src/clob/db/orders.js";
import { getReservation, getReservationsPage } from "../../backend/src/clob/db/reservations.js";
import { getTradeById, getTradeFillsByTradeId } from "../../backend/src/clob/db/trades.js";
import { getSettlementAttemptsByTrade } from "../../backend/src/clob/db/settlementAttempts.js";
import { executeMatchedTradeWithRetry } from "../../backend/src/clob/executor/retry.js";
import { reconcileOutcomeExchangeEventsOnce } from "../../backend/src/clob/reconciliationLoop.js";
import { reconcileReservationAvailability } from "../../backend/src/clob/reservationReconciliation.js";
import { hashContractOrder } from "../../backend/src/clob/orderSigning.js";
import type { Hex, SignedOrderInput } from "../../backend/src/clob/types.js";

const { viem, networkHelpers } = await network.create();
const databaseSkipReason = await getDatabaseSkipReason();

const usdc = (amount: bigint) => amount * 1_000_000n;

const orderTypes = {
  Order: [
    { name: "maker", type: "address" },
    { name: "outcomeToken", type: "address" },
    { name: "marketId", type: "bytes32" },
    { name: "outcome", type: "uint8" },
    { name: "side", type: "uint8" },
    { name: "outcomeAmount", type: "uint256" },
    { name: "usdcAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

describe("CLOB local EVM e2e fixture", () => {
  it("prepares active market, balances, approvals, and signed orders", async () => {
    const fixture = await deployClobE2EFixture();

    assert.equal(await fixture.outcomeToken.read.getYesTokenId([fixture.marketId]), fixture.yesTokenId);
    assert.equal(((await fixture.outcomeToken.read.markets([fixture.marketId])) as readonly unknown[])[4], 1);
    assert.equal(
      await fixture.outcomeToken.read.balanceOf([fixture.seller.account.address, fixture.yesTokenId]),
      fixture.sellerOutcomeAmount
    );
    assert.equal(
      await fixture.outcomeToken.read.isApprovedForAll([
        fixture.seller.account.address,
        fixture.exchange.address,
      ]),
      true
    );
    assert.equal(
      await fixture.collateralToken.read.balanceOf([fixture.buyer.account.address]),
      fixture.buyerUsdcAmount
    );
    assert.equal(
      await fixture.collateralToken.read.allowance([
        fixture.buyer.account.address,
        fixture.exchange.address,
      ]),
      fixture.buyerUsdcAmount
    );
    assert.equal(await fixture.exchange.read.filledAmounts([fixture.makerOrderHash]), 0n);
    assert.equal(await fixture.exchange.read.filledAmounts([fixture.takerOrderHash]), 0n);
  });

  it(
    "accepts a maker SELL order through HTTP using real local EVM reads",
    { skip: databaseSkipReason },
    async () => {
      const fixture = await deployClobE2EFixture();
      await upsertTestMarketConfig(fixture);

      const server = createClobHttpServer({
        config: await testClobConfig(fixture),
        publicClient: fixture.publicClient,
      });
      const { baseUrl, close } = await listen(server);

      try {
        const submitResponse = await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.makerBackendOrder),
          signature: fixture.makerSignature,
          timeInForce: "GTC",
          priceUnits: "600000",
        });

        assert.equal(submitResponse.orderHash, fixture.makerOrderHash);
        assert.equal(submitResponse.status, "LIVE");
        assert.equal(submitResponse.rested, true);
        assert.equal(submitResponse.availableForMatching, fixture.sellerOutcomeAmount.toString());

        const bookResponse = await getJson(`${baseUrl}/v1/books/${fixture.outcomeToken.address}/${fixture.marketId}/YES`);

        assert.deepEqual(bookResponse.asks, [
          {
            priceUnits: 600000,
            totalRemainingOutcomeAmount: fixture.sellerOutcomeAmount.toString(),
          },
        ]);
      } finally {
        await close();
        await closePool();
      }
    }
  );

  it(
    "atomically cancels uncovered SELL and BUY remainders and releases their reservations",
    { skip: databaseSkipReason },
    async () => {
      const fixture = await deployClobE2EFixture();
      await upsertTestMarketConfig(fixture);

      const server = createClobHttpServer({
        config: await testClobConfig(fixture),
        publicClient: fixture.publicClient,
      });
      const { baseUrl, close } = await listen(server);

      try {
        const existingBuyerReservation = await getReservation(getPool(), {
          maker: fixture.buyer.account.address,
          assetType: "ERC20",
          assetAddress: fixture.collateralToken.address,
          tokenId: 0n,
        });
        const existingBuyerReservedAmount = existingBuyerReservation?.reservedAmount ?? 0n;
        await topUpBuyerForExistingUsdcReservations(fixture);
        await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.makerBackendOrder),
          signature: fixture.makerSignature,
          timeInForce: "GTC",
          priceUnits: "600000",
        });

        const reservationPage = await getReservationsPage(getPool(), {
          limit: 10_000,
          after: null,
          usdc: fixture.collateralToken.address,
          outcomeToken: fixture.outcomeToken.address,
        });
        assert.equal(
          reservationPage.every(
            (reservation) =>
              (reservation.assetType === "ERC20" &&
                reservation.assetAddress === fixture.collateralToken.address) ||
              (reservation.assetType === "ERC1155" &&
                reservation.assetAddress === fixture.outcomeToken.address)
          ),
          true
        );
        assert.equal(
          reservationPage.some(
            (reservation) =>
              reservation.maker === fixture.seller.account.address &&
              reservation.assetAddress === fixture.outcomeToken.address &&
              reservation.tokenId === fixture.yesTokenId
          ),
          true
        );

        const result = await reconcileReservationAvailability({
          key: {
            maker: fixture.seller.account.address,
            assetType: "ERC1155",
            assetAddress: fixture.outcomeToken.address,
            tokenId: fixture.yesTokenId,
          },
          availableAmount: 0n,
        });

        assert.deepEqual(
          result.cancelledOrders.map((order) => order.orderHash),
          [fixture.makerOrderHash]
        );
        assert.equal(result.projectedReservedAmount, 0n);
        assert.equal(result.unresolvedDeficit, 0n);
        assert.equal((await getOrderByHash(getPool(), fixture.makerOrderHash))?.status, "CANCELLED");
        assert.equal(
          await getReservation(getPool(), {
            maker: fixture.seller.account.address,
            assetType: "ERC1155",
            assetAddress: fixture.outcomeToken.address,
            tokenId: fixture.yesTokenId,
          }),
          null
        );

        await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.takerBackendOrder),
          signature: fixture.takerSignature,
          timeInForce: "GTC",
          priceUnits: "700000",
        });

        const buyResult = await reconcileReservationAvailability({
          key: {
            maker: fixture.buyer.account.address,
            assetType: "ERC20",
            assetAddress: fixture.collateralToken.address,
            tokenId: 0n,
          },
          availableAmount: existingBuyerReservedAmount,
        });

        assert.equal(buyResult.cancelledOrders[0]?.orderHash, fixture.takerOrderHash);
        assert.equal(buyResult.cancelledOrders.length >= 1, true);
        assert.equal(buyResult.projectedReservedAmount, existingBuyerReservedAmount);
        assert.equal(buyResult.unresolvedDeficit, 0n);
        assert.equal((await getOrderByHash(getPool(), fixture.takerOrderHash))?.status, "CANCELLED");
        const remainingBuyerReservation = await getReservation(getPool(), {
          maker: fixture.buyer.account.address,
          assetType: "ERC20",
          assetAddress: fixture.collateralToken.address,
          tokenId: 0n,
        });
        assert.equal(remainingBuyerReservation?.reservedAmount ?? 0n, existingBuyerReservedAmount);
      } finally {
        await close();
        await closePool();
      }
    }
  );

  it(
    "matches a taker BUY order through HTTP and creates a trade with fills",
    { skip: databaseSkipReason },
    async () => {
      const fixture = await deployClobE2EFixture();
      await upsertTestMarketConfig(fixture);

      const server = createClobHttpServer({
        config: await testClobConfig(fixture),
        publicClient: fixture.publicClient,
      });
      const { baseUrl, close } = await listen(server);

      try {
        await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.makerBackendOrder),
          signature: fixture.makerSignature,
          timeInForce: "GTC",
          priceUnits: "600000",
        });
        await topUpBuyerForExistingUsdcReservations(fixture);

        const takerSubmitResponse = await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.takerBackendOrder),
          signature: fixture.takerSignature,
          timeInForce: "GTC",
          priceUnits: "700000",
        });

        assert.equal(takerSubmitResponse.orderHash, fixture.takerOrderHash);
        assert.equal(takerSubmitResponse.status, "LIVE");
        assert.equal(takerSubmitResponse.availableForMatching, "0");
        assert.equal(takerSubmitResponse.rested, false);
        assert.deepEqual(takerSubmitResponse.createdTradeIds.length, 1);

        const tradesResponse = await getJson(`${baseUrl}/v1/trades?outcomeToken=${fixture.outcomeToken.address}&marketId=${fixture.marketId}&outcome=YES`);
        const trade = tradesResponse.trades[0];

        assert.equal(trade.tradeId, takerSubmitResponse.createdTradeIds[0]);
        assert.equal(trade.status, "MATCHED");
        assert.equal(trade.totalOutcomeAmount, fixture.sellerOutcomeAmount.toString());
        assert.equal(trade.totalUsdcAmount, usdc(60n).toString());

        const fills = await getTradeFillsByTradeId(getPool(), BigInt(trade.tradeId));

        assert.equal(fills.length, 1);
        assert.equal(fills[0].takerOrderHash, fixture.takerOrderHash);
        assert.equal(fills[0].makerOrderHash, fixture.makerOrderHash);
        assert.equal(fills[0].makerFillAmount, fixture.sellerOutcomeAmount);
        assert.equal(fills[0].makerUsdcAmount, usdc(60n));

        const bookResponse = await getJson(`${baseUrl}/v1/books/${fixture.outcomeToken.address}/${fixture.marketId}/YES`);

        assert.deepEqual(bookResponse.asks, []);
      } finally {
        await close();
        await closePool();
      }
    }
  );

  it(
    "settles and confirms a matched trade through the backend executor and reconciliation paths",
    { skip: databaseSkipReason },
    async () => {
      const fixture = await deployClobE2EFixture();
      await upsertTestMarketConfig(fixture);

      const server = createClobHttpServer({
        config: await testClobConfig(fixture),
        publicClient: fixture.publicClient,
      });
      const { baseUrl, close } = await listen(server);

      try {
        await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.makerBackendOrder),
          signature: fixture.makerSignature,
          timeInForce: "GTC",
          priceUnits: "600000",
        });
        await topUpBuyerForExistingUsdcReservations(fixture);

        const takerSubmitResponse = await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.takerBackendOrder),
          signature: fixture.takerSignature,
          timeInForce: "GTC",
          priceUnits: "700000",
        });
        const tradeId = BigInt(takerSubmitResponse.createdTradeIds[0]);
        const buyerReservationBeforeConfirmation = await getReservation(getPool(), {
          maker: fixture.buyer.account.address,
          assetType: "ERC20",
          assetAddress: fixture.collateralToken.address,
          tokenId: 0n,
        });
        const sellerReservationBeforeConfirmation = await getReservation(getPool(), {
          maker: fixture.seller.account.address,
          assetType: "ERC1155",
          assetAddress: fixture.outcomeToken.address,
          tokenId: fixture.yesTokenId,
        });
        const sellerUsdcBefore = asBigint(await fixture.collateralToken.read.balanceOf([
          fixture.seller.account.address,
        ]));
        const buyerUsdcBefore = asBigint(await fixture.collateralToken.read.balanceOf([
          fixture.buyer.account.address,
        ]));
        const buyerYesBefore = asBigint(await fixture.outcomeToken.read.balanceOf([
          fixture.buyer.account.address,
          fixture.yesTokenId,
        ]));
        const sellerYesBefore = asBigint(await fixture.outcomeToken.read.balanceOf([
          fixture.seller.account.address,
          fixture.yesTokenId,
        ]));

        const execution = await executeMatchedTradeWithRetry({
          client: getPool(),
          publicClient: fixture.publicClient,
          walletClient: fixture.operator,
          outcomeExchange: fixture.exchange.address,
          operator: fixture.operator.account.address,
          tradeId,
          retryPolicy: {
            maxAttempts: 1,
            backoffMs: [],
          },
        });

        assert.equal(execution.status, "SUBMITTED");
        assert.equal(execution.attemptsUsed, 1);
        const receipt = await fixture.publicClient.waitForTransactionReceipt({ hash: execution.txHash });

        assert.equal(
          await fixture.exchange.read.filledAmounts([fixture.makerOrderHash]),
          fixture.sellerOutcomeAmount
        );
        assert.equal(
          await fixture.exchange.read.filledAmounts([fixture.takerOrderHash]),
          fixture.sellerOutcomeAmount
        );
        assert.equal(
          await fixture.outcomeToken.read.balanceOf([fixture.buyer.account.address, fixture.yesTokenId]),
          buyerYesBefore + fixture.sellerOutcomeAmount
        );
        assert.equal(
          await fixture.outcomeToken.read.balanceOf([fixture.seller.account.address, fixture.yesTokenId]),
          sellerYesBefore - fixture.sellerOutcomeAmount
        );
        assert.equal(
          await fixture.collateralToken.read.balanceOf([fixture.seller.account.address]),
          sellerUsdcBefore + usdc(60n)
        );
        assert.equal(
          await fixture.collateralToken.read.balanceOf([fixture.buyer.account.address]),
          buyerUsdcBefore - usdc(60n)
        );

        const submittedTrade = await getTradeById(getPool(), tradeId);

        assert.equal(submittedTrade?.status, "SUBMITTED");
        assert.equal(submittedTrade?.txHash, execution.txHash);

        const reconciliation = await reconcileOutcomeExchangeEventsOnce({
          publicClient: fixture.publicClient,
          outcomeExchange: fixture.exchange.address,
          usdc: fixture.collateralToken.address,
          cursorName: `local_e2e_${tradeId.toString()}`,
          confirmationDepth: 0n,
          fromBlockIfNoCursor: receipt.blockNumber,
          maxBlocksPerRun: 10n,
        });

        assert.equal(reconciliation.processedLogs, 3);

        const confirmedTrade = await getTradeById(getPool(), tradeId);
        const attempts = await getSettlementAttemptsByTrade(getPool(), tradeId);
        const buyerReservationAfterConfirmation = await getReservation(getPool(), {
          maker: fixture.buyer.account.address,
          assetType: "ERC20",
          assetAddress: fixture.collateralToken.address,
          tokenId: 0n,
        });
        const sellerReservationAfterConfirmation = await getReservation(getPool(), {
          maker: fixture.seller.account.address,
          assetType: "ERC1155",
          assetAddress: fixture.outcomeToken.address,
          tokenId: fixture.yesTokenId,
        });

        assert.equal(confirmedTrade?.status, "CONFIRMED");
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].status, "MINED");
        assert.equal(
          buyerReservationAfterConfirmation?.reservedAmount ?? 0n,
          (buyerReservationBeforeConfirmation?.reservedAmount ?? 0n) - fixture.buyerUsdcAmount
        );
        assert.equal(
          sellerReservationAfterConfirmation?.reservedAmount ?? 0n,
          (sellerReservationBeforeConfirmation?.reservedAmount ?? 0n) - fixture.sellerOutcomeAmount
        );
      } finally {
        await close();
        await closePool();
      }
    }
  );

  it(
    "publishes book and trade updates over WebSocket during local matching and reconciliation",
    { skip: databaseSkipReason },
    async () => {
      const fixture = await deployClobE2EFixture();
      await upsertTestMarketConfig(fixture);

      const publisher = new BookFeedPublisher();
      const server = createClobHttpServer({
        config: await testClobConfig(fixture),
        publicClient: fixture.publicClient,
        bookFeedPublisher: publisher,
      });
      const webSocketFeed = attachClobWebSocketFeed(server, {
        publisher,
      });
      const { baseUrl, close } = await listen(server);
      const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/v1/ws`);
      const feed = collectSocketMessages(socket);

      try {
        await once(socket, "open");
        socket.send(JSON.stringify({
          type: "subscribe",
          outcomeToken: fixture.outcomeToken.address,
          marketId: fixture.marketId,
          outcome: "YES",
        }));

        await feed.waitForCount(2);
        assert.equal(feed.messages[0].type, "book_snapshot");
        assert.deepEqual(feed.messages[0].asks, []);
        assert.equal(feed.messages[1].type, "best_bid_ask");
        assert.equal(feed.messages[1].bestAsk, null);

        await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.makerBackendOrder),
          signature: fixture.makerSignature,
          timeInForce: "GTC",
          priceUnits: "600000",
        });

        await feed.waitForCount(4);
        assert.equal(feed.messages[2].type, "book_delta");
        assert.deepEqual(feed.messages[2].asks, [
          {
            priceUnits: 600000,
            totalRemainingOutcomeAmount: fixture.sellerOutcomeAmount.toString(),
          },
        ]);
        assert.equal(feed.messages[3].type, "best_bid_ask");
        assert.deepEqual(feed.messages[3].bestAsk, {
          priceUnits: 600000,
          totalRemainingOutcomeAmount: fixture.sellerOutcomeAmount.toString(),
        });

        await topUpBuyerForExistingUsdcReservations(fixture);
        const takerSubmitResponse = await postJson(`${baseUrl}/v1/orders`, {
          order: toOrderDto(fixture.takerBackendOrder),
          signature: fixture.takerSignature,
          timeInForce: "GTC",
          priceUnits: "700000",
        });

        await feed.waitForCount(7);
        assert.equal(feed.messages[4].type, "book_delta");
        assert.deepEqual(feed.messages[4].asks, [
          {
            priceUnits: 600000,
            totalRemainingOutcomeAmount: "0",
          },
        ]);
        assert.equal(feed.messages[5].type, "best_bid_ask");
        assert.equal(feed.messages[5].bestAsk, null);
        assert.equal(feed.messages[6].type, "trade");
        assert.equal(feed.messages[6].status, "MATCHED");

        const tradeId = BigInt(takerSubmitResponse.createdTradeIds[0]);
        const execution = await executeMatchedTradeWithRetry({
          client: getPool(),
          publicClient: fixture.publicClient,
          walletClient: fixture.operator,
          outcomeExchange: fixture.exchange.address,
          operator: fixture.operator.account.address,
          tradeId,
          retryPolicy: {
            maxAttempts: 1,
            backoffMs: [],
          },
        });
        assert.equal(execution.status, "SUBMITTED");
        const receipt = await fixture.publicClient.waitForTransactionReceipt({ hash: execution.txHash });

        await reconcileOutcomeExchangeEventsOnce({
          publicClient: fixture.publicClient,
          outcomeExchange: fixture.exchange.address,
          usdc: fixture.collateralToken.address,
          cursorName: `local_e2e_feed_${tradeId.toString()}`,
          confirmationDepth: 0n,
          fromBlockIfNoCursor: receipt.blockNumber,
          maxBlocksPerRun: 10n,
          bookFeedPublisher: publisher,
        });

        const confirmedTradeMessage = await feed.waitForMessage(
          (message) =>
            message.type === "trade" &&
            message.status === "CONFIRMED" &&
            message.tradeId === tradeId.toString()
        );

        assert.equal(confirmedTradeMessage.type, "trade");
        assert.equal(confirmedTradeMessage.status, "CONFIRMED");
        assert.equal(confirmedTradeMessage.tradeId, tradeId.toString());
      } finally {
        socket.close();
        await webSocketFeed.close();
        await close();
        await closePool();
      }
    }
  );
});

async function deployClobE2EFixture() {
  const [admin, borrower, seller, buyer, operator] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const collateralToken = await viem.deployContract("MockUSDC");
  const outcomeToken = await viem.deployContract("OutcomeToken", [
    admin.account.address,
    collateralToken.address,
    "",
  ]);
  const exchange = await viem.deployContract("OutcomeExchange", [
    collateralToken.address,
    admin.account.address,
  ]);
  const uniqueNonceBase = process.hrtime.bigint();
  const marketId = toBytes32(uniqueNonceBase);
  const borrowerCollateralAmount = usdc(1_050n);
  const sellerOutcomeAmount = usdc(100n);
  const buyerUsdcAmount = usdc(70n);
  const now = await networkHelpers.time.latest();
  const expiration = BigInt(now + networkHelpers.time.duration.days(1));

  await exchange.write.setOperator([operator.account.address, true], { account: admin.account });
  await outcomeToken.write.createProtoMarket([
    1n,
    borrower.account.address,
    borrowerCollateralAmount,
    marketId,
  ], { account: admin.account });

  await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
  await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], {
    account: borrower.account,
  });
  await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], {
    account: borrower.account,
  });
  await outcomeToken.write.activateMarket([marketId], { account: admin.account });

  await collateralToken.write.mint([seller.account.address, sellerOutcomeAmount]);
  await collateralToken.write.approve([outcomeToken.address, sellerOutcomeAmount], {
    account: seller.account,
  });
  await outcomeToken.write.depositPairCollateral([marketId, sellerOutcomeAmount], {
    account: seller.account,
  });
  await outcomeToken.write.mintActivatedPair([marketId], { account: seller.account });
  await outcomeToken.write.setApprovalForAll([exchange.address, true], { account: seller.account });

  await collateralToken.write.mint([buyer.account.address, buyerUsdcAmount]);
  await collateralToken.write.approve([exchange.address, buyerUsdcAmount], {
    account: buyer.account,
  });

  const makerOrder = {
    maker: seller.account.address,
    outcomeToken: outcomeToken.address,
    marketId,
    outcome: 0,
    side: 1,
    outcomeAmount: sellerOutcomeAmount,
    usdcAmount: usdc(60n),
    expiration,
    nonce: uniqueNonceBase,
  };
  const takerOrder = {
    maker: buyer.account.address,
    outcomeToken: outcomeToken.address,
    marketId,
    outcome: 0,
    side: 0,
    outcomeAmount: sellerOutcomeAmount,
    usdcAmount: buyerUsdcAmount,
    expiration,
    nonce: uniqueNonceBase + 1n,
  };
  const makerSignature = await signOrder(exchange.address, await publicClient.getChainId(), seller, makerOrder);
  const takerSignature = await signOrder(exchange.address, await publicClient.getChainId(), buyer, takerOrder);
  const makerBackendOrder = toBackendOrder(makerOrder);
  const takerBackendOrder = toBackendOrder(takerOrder);
  const makerOrderHash = hashContractOrder(makerBackendOrder);
  const takerOrderHash = hashContractOrder(takerBackendOrder);

  assert.equal(await exchange.read.hashOrder([makerOrder]), makerOrderHash);
  assert.equal(await exchange.read.hashOrder([takerOrder]), takerOrderHash);

  return {
    admin,
    borrower,
    seller,
    buyer,
    operator,
    publicClient,
    collateralToken,
    outcomeToken,
    exchange,
    marketId,
    yesTokenId: asBigint(await outcomeToken.read.getYesTokenId([marketId])),
    borrowerCollateralAmount,
    sellerOutcomeAmount,
    buyerUsdcAmount,
    makerOrder,
    takerOrder,
    makerBackendOrder,
    takerBackendOrder,
    makerSignature,
    takerSignature,
    makerOrderHash,
    takerOrderHash,
  };
}

async function topUpBuyerForExistingUsdcReservations(
  fixture: Awaited<ReturnType<typeof deployClobE2EFixture>>
): Promise<void> {
  const reservation = await getReservation(getPool(), {
    maker: fixture.buyer.account.address,
    assetType: "ERC20",
    assetAddress: fixture.collateralToken.address,
    tokenId: 0n,
  });
  const existingReservedAmount = reservation?.reservedAmount ?? 0n;

  if (existingReservedAmount === 0n) {
    return;
  }

  await fixture.collateralToken.write.mint([fixture.buyer.account.address, existingReservedAmount]);
  await fixture.collateralToken.write.approve([
    fixture.exchange.address,
    existingReservedAmount + fixture.buyerUsdcAmount,
  ], { account: fixture.buyer.account });
}

async function testClobConfig(fixture: Awaited<ReturnType<typeof deployClobE2EFixture>>) {
  return {
    databaseUrl: process.env.DATABASE_URL!,
    arcRpcUrl: "http://127.0.0.1:8545",
    chainId: await fixture.publicClient.getChainId(),
    outcomeExchange: fixture.exchange.address,
    usdc: fixture.collateralToken.address,
    expiredOrderSweepIntervalMs: 5000,
    expiredOrderSweepLimit: 100,
    reconciliationIntervalMs: 3000,
    reconciliationConfirmationDepth: 1n,
    reconciliationStartBlock: 0n,
    reconciliationMaxBlocksPerRun: 1000n,
    executorPrivateKey: null,
    executorIntervalMs: 1000,
    executorBatchLimit: 10,
    executorExecutingTradeTimeoutMs: 60_000,
    receiptSweepIntervalMs: 3000,
    receiptSweepLimit: 100,
    receiptDroppedTimeoutMs: 60_000,
    marketConfigEventSweepIntervalMs: 3000,
    marketConfigEventSweepLimit: 100,
  };
}

async function upsertTestMarketConfig(fixture: Awaited<ReturnType<typeof deployClobE2EFixture>>): Promise<void> {
  await upsertMarketConfig(getPool(), {
    outcomeToken: fixture.outcomeToken.address,
    marketId: fixture.marketId,
    clobEnabled: true,
    defaultTickUnits: 1_000n,
    edgeTickUnits: 100n,
    lowerEdgePriceUnits: 100_000n,
    upperEdgePriceUnits: 900_000n,
    minOrderOutcomeAmount: 1n,
    maxOrderOutcomeAmount: null,
  });
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

function collectSocketMessages(socket: WebSocket): {
  messages: Array<Record<string, any>>;
  waitForCount: (count: number) => Promise<void>;
  waitForMessage: (predicate: (message: Record<string, any>) => boolean) => Promise<Record<string, any>>;
} {
  const messages: Array<Record<string, any>> = [];
  const countWaiters: Array<{
    count: number;
    resolve: () => void;
  }> = [];
  const messageWaiters: Array<{
    predicate: (message: Record<string, any>) => boolean;
    resolve: (message: Record<string, any>) => void;
  }> = [];

  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString("utf8")) as Record<string, any>;
    messages.push(message);

    for (const waiter of [...countWaiters]) {
      if (messages.length < waiter.count) {
        continue;
      }

      waiter.resolve();
      countWaiters.splice(countWaiters.indexOf(waiter), 1);
    }

    for (const waiter of [...messageWaiters]) {
      if (!waiter.predicate(message)) {
        continue;
      }

      waiter.resolve(message);
      messageWaiters.splice(messageWaiters.indexOf(waiter), 1);
    }
  });

  return {
    messages,
    waitForCount: (count: number) =>
      withTimeout(
        messages.length >= count
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              countWaiters.push({ count, resolve });
            }),
        5_000,
        `Timed out waiting for ${count.toString()} WebSocket messages`
      ),
    waitForMessage: (predicate: (message: Record<string, any>) => boolean) => {
      const existing = messages.find(predicate);
      return withTimeout(
        existing === undefined
          ? new Promise<Record<string, any>>((resolve) => {
              messageWaiters.push({ predicate, resolve });
            })
          : Promise.resolve(existing),
        5_000,
        "Timed out waiting for WebSocket message"
      );
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), ms);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function asBigint(value: unknown): bigint {
  if (typeof value !== "bigint") {
    throw new Error(`Expected bigint value, got ${typeof value}`);
  }

  return value;
}

function toOrderDto(order: SignedOrderInput): Record<string, string> {
  return {
    maker: order.maker,
    outcomeToken: order.outcomeToken,
    marketId: order.marketId,
    outcome: order.outcome,
    side: order.side,
    outcomeAmount: order.outcomeAmount.toString(),
    usdcAmount: order.usdcAmount.toString(),
    expiration: order.expiration.toISOString(),
    nonce: order.nonce.toString(),
  };
}

async function postJson(url: string, body: unknown): Promise<Record<string, any>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${JSON.stringify(parsed)}`);
  }

  return parsed;
}

async function getJson(url: string): Promise<Record<string, any>> {
  const response = await fetch(url);
  const parsed = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${JSON.stringify(parsed)}`);
  }

  return parsed;
}

async function signOrder(
  exchange: Hex,
  chainId: number,
  signer: Awaited<ReturnType<typeof viem.getWalletClients>>[number],
  order: {
    maker: Hex;
    outcomeToken: Hex;
    marketId: Hex;
    outcome: number;
    side: number;
    outcomeAmount: bigint;
    usdcAmount: bigint;
    expiration: bigint;
    nonce: bigint;
  }
): Promise<Hex> {
  return signer.signTypedData({
    domain: {
      name: "StopDownOutcomeExchange",
      version: "1",
      chainId,
      verifyingContract: exchange,
    },
    types: orderTypes,
    primaryType: "Order",
    message: order,
  });
}

function toBackendOrder(order: {
  maker: Hex;
  outcomeToken: Hex;
  marketId: Hex;
  outcome: number;
  side: number;
  outcomeAmount: bigint;
  usdcAmount: bigint;
  expiration: bigint;
  nonce: bigint;
}): SignedOrderInput {
  return {
    maker: order.maker,
    outcomeToken: order.outcomeToken,
    marketId: order.marketId,
    outcome: order.outcome === 0 ? "YES" : "NO",
    side: order.side === 0 ? "BUY" : "SELL",
    outcomeAmount: order.outcomeAmount,
    usdcAmount: order.usdcAmount,
    expiration: new Date(Number(order.expiration) * 1000),
    nonce: order.nonce,
  };
}

function toBytes32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

async function getDatabaseSkipReason(): Promise<string | false> {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
    return "DATABASE_URL is required for local CLOB e2e";
  }

  try {
    await getPool().query("SELECT 1");
    return false;
  } catch {
    return "PostgreSQL is unavailable for local CLOB e2e";
  } finally {
    await closePool();
  }
}
