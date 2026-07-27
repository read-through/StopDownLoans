import { once } from "node:events";
import { network } from "hardhat";
import WebSocket from "ws";
import { BookFeedPublisher } from "../backend/src/clob/api/bookFeedPublisher.js";
import { createClobHttpServer } from "../backend/src/clob/api/httpServer.js";
import { attachClobWebSocketFeed } from "../backend/src/clob/api/webSocketFeed.js";
import { closePool, getDatabaseUrl, getPool } from "../backend/src/clob/db/client.js";
import { upsertMarketConfig } from "../backend/src/clob/db/marketConfigs.js";
import { getReservation } from "../backend/src/clob/db/reservations.js";
import { getTradeById } from "../backend/src/clob/db/trades.js";
import { executeMatchedTradeWithRetry } from "../backend/src/clob/executor/retry.js";
import { reconcileOutcomeExchangeEventsOnce } from "../backend/src/clob/reconciliationLoop.js";
import { hashContractOrder } from "../backend/src/clob/orderSigning.js";
import type { ClobBackendConfig } from "../backend/src/clob/config.js";
import type { Hex, SignedOrderInput } from "../backend/src/clob/types.js";
import { loadDotEnv } from "../backend/scripts/load-env.js";

await loadDotEnv();

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
  process.env.DATABASE_URL = "postgres://stopdown:stopdown@localhost:55432/stopdown";
}

const databaseUrl = getDatabaseUrl();
const { viem, networkHelpers } = await network.create();
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
const outcomeAmount = usdc(100n);
const buyerLimitUsdcAmount = usdc(70n);
const makerPriceUsdcAmount = usdc(60n);
const now = await networkHelpers.time.latest();
const expiration = BigInt(now + networkHelpers.time.duration.days(1));

const publisher = new BookFeedPublisher();
const server = createClobHttpServer({
  config: await createDemoClobConfig(),
  publicClient,
  bookFeedPublisher: publisher,
});
const webSocketFeed = attachClobWebSocketFeed(server, {
  publisher,
});
const { baseUrl, close } = await listen(server);
let socket: WebSocket | undefined;
let feed: ReturnType<typeof collectSocketMessages> | undefined;

try {
  console.log("Local CLOB trade demo");
  console.log(`Admin: ${admin.account.address}`);
  console.log(`Borrower: ${borrower.account.address}`);
  console.log(`Seller: ${seller.account.address}`);
  console.log(`Buyer: ${buyer.account.address}`);
  console.log(`Operator: ${operator.account.address}`);
  console.log(`Collateral token: ${collateralToken.address}`);
  console.log(`OutcomeToken: ${outcomeToken.address}`);
  console.log(`OutcomeExchange: ${exchange.address}`);
  console.log(`HTTP server: ${baseUrl}`);

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

  await collateralToken.write.mint([seller.account.address, outcomeAmount]);
  await collateralToken.write.approve([outcomeToken.address, outcomeAmount], {
    account: seller.account,
  });
  await outcomeToken.write.depositPairCollateral([marketId, outcomeAmount], {
    account: seller.account,
  });
  await outcomeToken.write.mintActivatedPair([marketId], { account: seller.account });
  await outcomeToken.write.setApprovalForAll([exchange.address, true], { account: seller.account });

  await collateralToken.write.mint([buyer.account.address, buyerLimitUsdcAmount]);
  await collateralToken.write.approve([exchange.address, buyerLimitUsdcAmount], {
    account: buyer.account,
  });

  await upsertMarketConfig(getPool(), {
    outcomeToken: outcomeToken.address,
    marketId,
    clobEnabled: true,
    defaultTickUnits: 1_000n,
    edgeTickUnits: 100n,
    lowerEdgePriceUnits: 100_000n,
    upperEdgePriceUnits: 900_000n,
    minOrderOutcomeAmount: 1n,
    maxOrderOutcomeAmount: null,
  });
  console.log(`Active YES market configured: ${marketId}`);

  socket = new WebSocket(`${baseUrl.replace("http", "ws")}/v1/ws`);
  feed = collectSocketMessages(socket);
  await once(socket, "open");
  socket.send(JSON.stringify({
    type: "subscribe",
    outcomeToken: outcomeToken.address,
    marketId,
    outcome: "YES",
  }));
  await feed.waitForCount(2);
  console.log("WebSocket subscribed: initial book snapshot received");

  const makerOrder = {
    maker: seller.account.address,
    outcomeToken: outcomeToken.address,
    marketId,
    outcome: 0,
    side: 1,
    outcomeAmount,
    usdcAmount: makerPriceUsdcAmount,
    expiration,
    nonce: uniqueNonceBase,
  };
  const takerOrder = {
    maker: buyer.account.address,
    outcomeToken: outcomeToken.address,
    marketId,
    outcome: 0,
    side: 0,
    outcomeAmount,
    usdcAmount: buyerLimitUsdcAmount,
    expiration,
    nonce: uniqueNonceBase + 1n,
  };
  const makerBackendOrder = toBackendOrder(makerOrder);
  const takerBackendOrder = toBackendOrder(takerOrder);
  const makerSignature = await signOrder(exchange.address, await publicClient.getChainId(), seller, makerOrder);
  const takerSignature = await signOrder(exchange.address, await publicClient.getChainId(), buyer, takerOrder);
  const makerOrderHash = hashContractOrder(makerBackendOrder);
  const takerOrderHash = hashContractOrder(takerBackendOrder);

  await postJson(`${baseUrl}/v1/orders`, {
    order: toOrderDto(makerBackendOrder),
    signature: makerSignature,
    timeInForce: "GTC",
    priceUnits: "600000",
  });
  await feed.waitForCount(4);
  console.log(`Maker SELL rested: ${makerOrderHash}`);

  await topUpBuyerForExistingUsdcReservations();
  const takerSubmit = await postJson(`${baseUrl}/v1/orders`, {
    order: toOrderDto(takerBackendOrder),
    signature: takerSignature,
    timeInForce: "GTC",
    priceUnits: "700000",
  });
  await feed.waitForCount(7);
  const tradeId = BigInt(String(takerSubmit.createdTradeIds[0]));
  console.log(`Taker BUY matched: ${takerOrderHash}`);
  console.log(`Trade created: ${tradeId.toString()}`);

  const sellerUsdcBefore = asBigint(await collateralToken.read.balanceOf([seller.account.address]));
  const buyerUsdcBefore = asBigint(await collateralToken.read.balanceOf([buyer.account.address]));
  const buyerYesBefore = asBigint(await outcomeToken.read.balanceOf([
    buyer.account.address,
    await outcomeToken.read.getYesTokenId([marketId]),
  ]));

  const execution = await executeMatchedTradeWithRetry({
    client: getPool(),
    publicClient,
    walletClient: operator,
    outcomeExchange: exchange.address,
    operator: operator.account.address,
    tradeId,
    retryPolicy: {
      maxAttempts: 1,
      backoffMs: [],
    },
  });
  if (execution.status !== "SUBMITTED") {
    throw new Error(`Expected submitted settlement, got ${execution.status}`);
  }
  console.log(`Settlement submitted: ${execution.txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: execution.txHash });
  await reconcileOutcomeExchangeEventsOnce({
    publicClient,
    outcomeExchange: exchange.address,
    usdc: collateralToken.address,
    cursorName: `local_demo_clob_${tradeId.toString()}`,
    confirmationDepth: 0n,
    fromBlockIfNoCursor: receipt.blockNumber,
    maxBlocksPerRun: 10n,
    bookFeedPublisher: publisher,
  });
  await feed.waitForMessage(
    (message) =>
      message.type === "trade" &&
      message.status === "CONFIRMED" &&
      message.tradeId === tradeId.toString()
  );
  console.log("Reconciliation confirmed trade and WebSocket published CONFIRMED");

  const confirmedTrade = await getTradeById(getPool(), tradeId);
  const sellerUsdcAfter = asBigint(await collateralToken.read.balanceOf([seller.account.address]));
  const buyerUsdcAfter = asBigint(await collateralToken.read.balanceOf([buyer.account.address]));
  const buyerYesAfter = asBigint(await outcomeToken.read.balanceOf([
    buyer.account.address,
    await outcomeToken.read.getYesTokenId([marketId]),
  ]));
  const book = await getJson(`${baseUrl}/v1/books/${outcomeToken.address}/${marketId}/YES`);

  console.log("");
  console.log("Final state:");
  console.log(`Trade status: ${confirmedTrade?.status ?? "missing"}`);
  console.log(`Seller USDC delta: ${(sellerUsdcAfter - sellerUsdcBefore).toString()}`);
  console.log(`Buyer USDC delta: ${(buyerUsdcAfter - buyerUsdcBefore).toString()}`);
  console.log(`Buyer YES delta: ${(buyerYesAfter - buyerYesBefore).toString()}`);
  console.log(`Final asks: ${JSON.stringify(book.asks)}`);
} finally {
  if (socket !== undefined) {
    await closeSocket(socket);
  }
  await webSocketFeed.close();
  await close();
  await closePool();
}

process.exit(0);

async function createDemoClobConfig(): Promise<ClobBackendConfig> {
  return {
    databaseUrl,
    arcRpcUrl: "http://127.0.0.1:8545",
    chainId: await publicClient.getChainId(),
    loanPositionToken: outcomeToken.address,
    outcomeExchange: exchange.address,
    usdc: collateralToken.address,
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
    lendingKeeperIntervalMs: 3000,
    lendingKeeperScanLimit: 100,
    loanSnapshotSyncIntervalMs: 3000,
    loanSnapshotSyncLimit: 100,
    receiptSweepIntervalMs: 3000,
    receiptSweepLimit: 100,
    receiptDroppedTimeoutMs: 60_000,
    marketConfigEventSweepIntervalMs: 3000,
    marketConfigEventSweepLimit: 100,
  };
}

async function topUpBuyerForExistingUsdcReservations(): Promise<void> {
  const reservation = await getReservation(getPool(), {
    maker: buyer.account.address,
    assetType: "ERC20",
    assetAddress: collateralToken.address,
    tokenId: 0n,
  });
  const existingReservedAmount = reservation?.reservedAmount ?? 0n;

  if (existingReservedAmount === 0n) {
    return;
  }

  await collateralToken.write.mint([buyer.account.address, existingReservedAmount]);
  await collateralToken.write.approve([exchange.address, existingReservedAmount + buyerLimitUsdcAmount], {
    account: buyer.account,
  });
}

async function listen(serverToListen: ReturnType<typeof createClobHttpServer>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  serverToListen.listen(0, "127.0.0.1");
  await once(serverToListen, "listening");

  const address = serverToListen.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Expected TCP server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      serverToListen.close();
      await once(serverToListen, "close");
    },
  };
}

function collectSocketMessages(socketToCollect: WebSocket): {
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

  socketToCollect.on("message", (raw) => {
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

async function closeSocket(socketToClose: WebSocket): Promise<void> {
  if (socketToClose.readyState === WebSocket.CLOSED) {
    return;
  }

  if (socketToClose.readyState === WebSocket.CONNECTING) {
    socketToClose.terminate();
    return;
  }

  const closed = once(socketToClose, "close").then(() => undefined);
  socketToClose.close();
  await withTimeout(
    closed.catch(() => undefined),
    1_000,
    "Timed out waiting for WebSocket close"
  ).catch(() => {
    socketToClose.terminate();
  });
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
  verifyingContract: Hex,
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
      verifyingContract,
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

function toBytes32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function asBigint(value: unknown): bigint {
  if (typeof value !== "bigint") {
    throw new Error(`Expected bigint value, got ${typeof value}`);
  }

  return value;
}
