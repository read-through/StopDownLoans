import { once } from "node:events";
import { type Address, getAddress } from "viem";
import WebSocket from "ws";
import { BookFeedPublisher } from "../src/clob/api/bookFeedPublisher.js";
import { createClobHttpServer } from "../src/clob/api/httpServer.js";
import { attachClobWebSocketFeed } from "../src/clob/api/webSocketFeed.js";
import { closePool, getDatabaseUrl, getPool } from "../src/clob/db/client.js";
import { upsertMarketConfig } from "../src/clob/db/marketConfigs.js";
import { insertOrder } from "../src/clob/db/orders.js";
import type { ClobBackendConfig } from "../src/clob/config.js";
import type { Hex } from "../src/clob/types.js";
import { loadDotEnv } from "./load-env.js";

await loadDotEnv();

const databaseUrl = getDatabaseUrl();
const outcomeToken = getAddress("0x0000000000000000000000000000000000001001") as Hex;
const outcomeExchange = getAddress("0x0000000000000000000000000000000000001002") as Hex;
const usdc = getAddress("0x0000000000000000000000000000000000001003") as Hex;
const maker = getAddress("0x0000000000000000000000000000000000001004") as Hex;
const loanPositionToken = getAddress("0x0000000000000000000000000000000000001005") as Hex;
const runId = BigInt(Date.now());
const marketId = toBytes32(runId);
const orderHash = toBytes32(runId + 1n);
const now = new Date("2026-01-01T00:00:00.000Z");
const config = createSmokeConfig({
  databaseUrl,
  loanPositionToken,
  outcomeToken,
  outcomeExchange,
  usdc,
});
const publisher = new BookFeedPublisher();
const server = createClobHttpServer({
  config,
  now: () => now,
  bookFeedPublisher: publisher,
});
const webSocketFeed = attachClobWebSocketFeed(server, {
  publisher,
});

try {
  console.log("Preparing smoke data...");
  await upsertMarketConfig(getPool(), {
    outcomeToken,
    marketId,
    clobEnabled: true,
    defaultTickUnits: 1_000n,
    edgeTickUnits: 100n,
    lowerEdgePriceUnits: 100_000n,
    upperEdgePriceUnits: 900_000n,
    minOrderOutcomeAmount: 1n,
    maxOrderOutcomeAmount: null,
  });
  await insertOrder(getPool(), {
    orderHash,
    order: {
      maker,
      outcomeToken,
      marketId,
      outcome: "YES",
      side: "SELL",
      outcomeAmount: 1_000_000n,
      usdcAmount: 450_000n,
      expiration: new Date("2099-01-01T00:00:00.000Z"),
      nonce: runId,
    },
    signature: `0x${"11".repeat(65)}`,
    timeInForce: "GTC",
    priceUnits: 450_000n,
  });

  console.log("Starting smoke API server...");
  const baseUrl = await listenOnRandomPort();
  console.log(`Smoke API listening on ${baseUrl}`);

  console.log("Checking market config endpoint...");
  const configView = await getJson(`${baseUrl}/v1/market-configs/${outcomeToken}/${marketId}`);
  assertEqual(configView.clobEnabled, true, "market config should be enabled");
  assertEqual(configView.defaultTickUnits, "1000", "market config default tick");

  console.log("Checking order endpoint...");
  const orderView = await getJson(`${baseUrl}/v1/orders/${orderHash}`);
  assertEqual(orderView.orderHash, orderHash, "order endpoint should return inserted order");
  assertEqual(orderView.availableForMatching, "1000000", "order available amount");

  console.log("Checking book endpoint...");
  const bookView = await getJson(`${baseUrl}/v1/books/${outcomeToken}/${marketId}/YES`);
  assertEqual(bookView.asks[0]?.priceUnits, 450000, "book should expose resting ask");
  assertEqual(bookView.asks[0]?.totalRemainingOutcomeAmount, "1000000", "book ask size");

  console.log("Checking best bid/ask endpoint...");
  const bestView = await getJson(`${baseUrl}/v1/books/${outcomeToken}/${marketId}/YES/best`);
  assertEqual(bestView.bestAsk?.priceUnits, 450000, "best ask should match inserted order");

  console.log("Checking websocket feed...");
  const wsMessages = await withTimeout(
    subscribeAndCollect(`${baseUrl.replace("http", "ws")}/v1/ws`, {
      type: "subscribe",
      outcomeToken,
      marketId,
      outcome: "YES",
    }),
    5_000,
    "websocket smoke timed out"
  );
  assertEqual(wsMessages[0].type, "book_snapshot", "websocket should publish initial snapshot");
  assertEqual(wsMessages[1].type, "best_bid_ask", "websocket should publish initial best bid/ask");

  console.log("CLOB smoke OK");
} finally {
  await webSocketFeed.close();
  await closeServer();
  await closePool();
}

function createSmokeConfig(params: {
  databaseUrl: string;
  loanPositionToken: Hex;
  outcomeToken: Hex;
  outcomeExchange: Hex;
  usdc: Hex;
}): ClobBackendConfig {
  return {
    databaseUrl: params.databaseUrl,
    arcRpcUrl: "http://127.0.0.1:8545",
    chainId: 5042002,
    loanPositionToken: params.loanPositionToken,
    outcomeToken: params.outcomeToken,
    outcomeExchange: params.outcomeExchange,
    usdc: params.usdc,
    corsAllowedOrigins: ["http://127.0.0.1:5173"],
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
    receiptSweepIntervalMs: 3000,
    receiptSweepLimit: 100,
    receiptDroppedTimeoutMs: 60_000,
    marketConfigEventSweepIntervalMs: 3000,
    marketConfigEventSweepLimit: 100,
    loanSnapshotSyncIntervalMs: 3000,
    loanSnapshotSyncLimit: 100,
  };
}

function listenOnRandomPort(): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Server did not bind to a TCP port."));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function closeServer(): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function getJson(url: string): Promise<Record<string, any>> {
  const response = await withTimeout(fetch(url), 5_000, `GET ${url} timed out`);
  const body = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

async function subscribeAndCollect(
  url: string,
  message: Record<string, unknown>
): Promise<Array<Record<string, any>>> {
  const socket = new WebSocket(url);
  const messages: Array<Record<string, any>> = [];

  try {
    await waitForSocketOpen(socket);
    console.log("WebSocket opened; subscribing...");
    const collected = collectMessages(socket, 2);
    socket.send(JSON.stringify(message));
    return await collected;
  } finally {
    socket.close();
  }
}

function collectMessages(socket: WebSocket, count: number): Promise<Array<Record<string, any>>> {
  return new Promise((resolve, reject) => {
    const messages: Array<Record<string, any>> = [];
    socket.on("message", (raw) => {
      messages.push(JSON.parse(raw.toString("utf8")) as Record<string, any>);
      if (messages.length === count) {
        resolve(messages);
      }
    });
    socket.once("error", reject);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(message));
    }, ms);

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

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  await Promise.race([
    once(socket, "open"),
    once(socket, "error").then(([error]) => {
      throw error;
    }),
  ]);
}

function toBytes32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
