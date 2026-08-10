import { closePool, getPool, withTransaction } from "../src/clob/db/client.js";
import { BookFeedPublisher } from "../src/clob/api/bookFeedPublisher.js";
import { createClobHttpServer } from "../src/clob/api/httpServer.js";
import { attachClobWebSocketFeed } from "../src/clob/api/webSocketFeed.js";
import { loadClobBackendConfig } from "../src/clob/config.js";
import { createArcPublicClient, createArcWalletClient } from "../src/clob/chain/arc.js";
import { runExecutorBatch, startExecutorLoop } from "../src/clob/executor/worker.js";
import { runLendingKeeperBatch, startLendingKeeperLoop } from "../src/lending/keeper.js";
import { runLoanSnapshotSyncBatch, startLoanSnapshotSyncLoop } from "../src/lending/loanSnapshotSync.js";
import { startExpiredOrderSweepLoop, sweepExpiredOrders } from "../src/clob/expiredOrders.js";
import {
  reconcileOutcomeExchangeEventsOnce,
  startOutcomeExchangeReconciliationLoop,
} from "../src/clob/reconciliationLoop.js";
import { startSubmittedReceiptSweepLoop, sweepSubmittedReceipts } from "../src/clob/receiptSweep.js";
import {
  startMarketConfigEventSweepLoop,
  sweepMarketConfigEvents,
} from "../src/clob/marketConfigEventLoop.js";
import { loadDotEnv } from "./load-env.js";
import { bootstrapReconciliationCursor } from "../src/clob/reconciliationBootstrap.js";
import {
  deleteExpiredRateLimitWindows,
  loadRateLimitCleanupConfig,
  startRateLimitCleanupLoop,
} from "../src/platform/rateLimit.js";

await loadDotEnv();

const port = Number(process.env.PORT ?? 3000);

if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const config = loadClobBackendConfig();
const rateLimitCleanupConfig = loadRateLimitCleanupConfig();
const backgroundLoopsEnabled = process.env.CLOB_BACKGROUND_LOOPS !== "false";
const publicClient = createArcPublicClient({
  rpcUrl: config.arcRpcUrl,
});
const reconciliationBootstrap = await withTransaction((dbClient) =>
  bootstrapReconciliationCursor({
    dbClient,
    publicClient,
    confirmationDepth: config.reconciliationConfirmationDepth,
  })
);
console.log(
  `Reconciliation cursor ${reconciliationBootstrap.status} at block ${reconciliationBootstrap.blockNumber.toString()}`
);
const bookFeedPublisher = new BookFeedPublisher();
const stopExpiredOrderSweep = backgroundLoopsEnabled
  ? startExpiredOrderSweepLoop({
      intervalMs: config.expiredOrderSweepIntervalMs,
      sweep: () =>
        sweepExpiredOrders({
          now: new Date(),
          usdc: config.usdc,
          publicClient,
          limit: config.expiredOrderSweepLimit,
          bookFeedPublisher,
        }),
      onError: (error) => {
        console.error("Expired order sweep failed:", error);
      },
    })
  : () => {};
const stopReconciliation = backgroundLoopsEnabled
  ? startOutcomeExchangeReconciliationLoop({
      intervalMs: config.reconciliationIntervalMs,
      reconcile: () =>
        reconcileOutcomeExchangeEventsOnce({
          publicClient,
          outcomeExchange: config.outcomeExchange,
          usdc: config.usdc,
          confirmationDepth: config.reconciliationConfirmationDepth,
          fromBlockIfNoCursor: config.reconciliationStartBlock,
          maxBlocksPerRun: config.reconciliationMaxBlocksPerRun,
          bookFeedPublisher,
        }),
      onError: (error) => {
        console.error("OutcomeExchange reconciliation failed:", error);
      },
    })
  : () => {};
const stopSubmittedReceiptSweep = backgroundLoopsEnabled
  ? startSubmittedReceiptSweepLoop({
      intervalMs: config.receiptSweepIntervalMs,
      sweep: () =>
        sweepSubmittedReceipts({
          publicClient,
          usdc: config.usdc,
          now: new Date(),
          droppedTimeoutMs: config.receiptDroppedTimeoutMs,
          limit: config.receiptSweepLimit,
        }),
      onError: (error) => {
        console.error("Submitted receipt sweep failed:", error);
      },
    })
  : () => {};
const stopLoanSnapshotSync = backgroundLoopsEnabled
  ? startLoanSnapshotSyncLoop({
      intervalMs: config.loanSnapshotSyncIntervalMs,
      sync: () =>
        runLoanSnapshotSyncBatch({
          publicClient,
          loanPositionToken: config.loanPositionToken,
          limit: config.loanSnapshotSyncLimit,
        }),
      onError: (error) => {
        console.error("Loan snapshot sync failed:", error);
      },
    })
  : () => {};
const stopMarketConfigEventSweep = backgroundLoopsEnabled
  ? startMarketConfigEventSweepLoop({
      intervalMs: config.marketConfigEventSweepIntervalMs,
      sweep: () =>
        sweepMarketConfigEvents({
          limit: config.marketConfigEventSweepLimit,
          bookFeedPublisher,
        }),
      onError: (error) => {
        console.error("Market config event sweep failed:", error);
      },
    })
  : () => {};
const stopRateLimitCleanup = backgroundLoopsEnabled
  ? startRateLimitCleanupLoop({
      intervalMs: rateLimitCleanupConfig.intervalMs,
      cleanup: () =>
        deleteExpiredRateLimitWindows(getPool(), {
          limit: rateLimitCleanupConfig.batchLimit,
        }),
      onError: (error) => {
        console.error("Rate-limit cleanup failed:", error);
      },
    })
  : () => {};
const walletClient =
  config.executorPrivateKey === null
    ? null
    : createArcWalletClient({
        privateKey: config.executorPrivateKey,
        rpcUrl: config.arcRpcUrl,
      });
const stopExecutor =
  walletClient === null || !backgroundLoopsEnabled
    ? () => {}
    : startExecutorLoop({
        intervalMs: config.executorIntervalMs,
        run: () =>
          runExecutorBatch({
            publicClient,
            walletClient,
            outcomeExchange: config.outcomeExchange,
            usdc: config.usdc,
            operator: walletClient.account!.address,
            limit: config.executorBatchLimit,
            executingTradeTimeoutMs: config.executorExecutingTradeTimeoutMs,
            bookFeedPublisher,
          }),
        onError: (error) => {
          console.error("Executor loop failed:", error);
        },
      });
const stopLendingKeeper =
  walletClient === null || !backgroundLoopsEnabled
    ? () => {}
    : startLendingKeeperLoop({
        intervalMs: config.lendingKeeperIntervalMs,
        run: () =>
          runLendingKeeperBatch({
            publicClient,
            walletClient,
            loanPositionToken: config.loanPositionToken,
            scanLimit: config.lendingKeeperScanLimit,
          }),
        onError: (error) => {
          console.error("Lending keeper loop failed:", error);
        },
      });
const server = createClobHttpServer({
  config,
  bookFeedPublisher,
  staticDir: process.env.FRONTEND_STATIC_DIR,
});
const webSocketFeed = attachClobWebSocketFeed(server, {
  publisher: bookFeedPublisher,
});

server.listen(port, () => {
  console.log(`CLOB API listening on http://localhost:${port}`);
  if (!backgroundLoopsEnabled) {
    console.log("CLOB background loops disabled");
  }
});

async function shutdown(): Promise<void> {
  stopExpiredOrderSweep();
  stopReconciliation();
  stopSubmittedReceiptSweep();
  stopLoanSnapshotSync();
  stopMarketConfigEventSweep();
  stopRateLimitCleanup();
  stopExecutor();
  stopLendingKeeper();
  await webSocketFeed.close();
  await closeServer();
  await closePool();
}

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

process.on("SIGINT", () => {
  shutdown().then(
    () => process.exit(0),
    () => process.exit(1)
  );
});

process.on("SIGTERM", () => {
  shutdown().then(
    () => process.exit(0),
    () => process.exit(1)
  );
});
