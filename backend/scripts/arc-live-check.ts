import { request } from "node:http";
import { WebSocket } from "ws";
import { getAddress, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcPublicClient } from "../src/clob/chain/arc.js";
import { closePool, getPool } from "../src/clob/db/client.js";
import { loadClobBackendConfig } from "../src/clob/config.js";
import { loadDotEnv } from "./load-env.js";

const outcomeExchangeAbi = [
  {
    type: "function",
    name: "operators",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type HealthResponse = {
  status: "ok";
  executorEnabled: boolean;
  sync: { status: "ok" | "unavailable" };
};

type MarketsResponse = {
  markets: Array<{
    outcomeToken: string;
    marketId: string;
    loan: null | { loanId: string; state: string };
  }>;
};

await loadDotEnv();

const errors: string[] = [];

try {
  await main();
} catch (error) {
  console.error("");
  console.error("ARC live stack check failed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await closePool();
}

async function main(): Promise<void> {
  const config = loadClobBackendConfig();
  const publicClient = createArcPublicClient({ rpcUrl: config.arcRpcUrl });
  const executor = config.executorPrivateKey === null ? null : privateKeyToAccount(config.executorPrivateKey);
  const clobApiUrl = process.env.CLOB_API_URL ?? "http://127.0.0.1:3000";

  console.log("Checking ARC live stack...");
  console.log(`CLOB API: ${clobApiUrl}`);

  await checkDatabase();
  const chainId = await publicClient.getChainId();
  assert(chainId === config.chainId, `RPC chain id expected ${config.chainId}, got ${chainId}`);
  console.log(`OK ARC RPC chain=${chainId}`);

  if (executor === null) {
    fail("EXECUTOR_PRIVATE_KEY is not set.");
  } else {
    const executorAddress = getAddress(executor.address);
    const [balance, isOperator] = await Promise.all([
      withRetry(() => publicClient.getBalance({ address: executorAddress })),
      withRetry(() => publicClient.readContract({
        address: config.outcomeExchange,
        abi: outcomeExchangeAbi,
        functionName: "operators",
        args: [executorAddress],
      })),
    ]);

    console.log(`OK executor=${executorAddress}`);
    console.log(`OK executor operator=${String(isOperator)}`);
    console.log(`OK executor gas balance=${formatEther(balance)}`);

    if (!isOperator) {
      fail(`Executor ${executorAddress} is not an OutcomeExchange operator.`);
    }

    if (balance === 0n) {
      fail(`Executor ${executorAddress} has zero ARC gas balance.`);
    }
  }

  const health = await getJson<HealthResponse>(`${clobApiUrl}/v1/health`);
  assert(health.status === "ok", "Backend health is not ok.");
  assert(health.executorEnabled, "Backend executorEnabled is false. Run npm.cmd run dev:clob, not dev:clob:api-only.");
  assert(health.sync.status === "ok", "Backend sync is unavailable.");
  console.log("OK backend health/executor/sync");

  const markets = await getJson<MarketsResponse>(`${clobApiUrl}/v1/markets?limit=5`);
  assert(markets.markets.length > 0, "No markets returned by /v1/markets.");
  const market = selectMarket(markets);
  assert(market.loan !== null, `Market ${market.marketId} has no linked loan context.`);
  console.log(`OK market=${market.marketId}`);
  console.log(`OK linked loan=#${market.loan.loanId} ${market.loan.state}`);

  await checkBookFeed(getWsUrl(clobApiUrl), market.outcomeToken, market.marketId);
  console.log("OK websocket book feed");

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  console.log("");
  console.log("ARC live stack ready for frontend trading.");
}

async function checkDatabase(): Promise<void> {
  try {
    const result = await getPool().query<{ now: Date }>("SELECT now()");
    console.log(`OK database=${result.rows[0].now.toISOString()}`);
  } catch (error) {
    throw new Error(
      [
        "PostgreSQL is not reachable.",
        "Run: npm.cmd run db:up",
        "Then run: npm.cmd run db:migrate",
        error instanceof Error ? error.message : String(error),
      ].join("\n")
    );
  }
}

function selectMarket(markets: MarketsResponse): MarketsResponse["markets"][number] {
  const expectedMarketId = process.env.MARKET_ID?.toLowerCase();
  if (expectedMarketId !== undefined && expectedMarketId !== "") {
    const market = markets.markets.find((candidate) => candidate.marketId.toLowerCase() === expectedMarketId);
    assert(market !== undefined, `MARKET_ID ${expectedMarketId} was not returned by /v1/markets.`);
    return market;
  }

  return markets.markets[0];
}

function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${url} failed with HTTP ${response.statusCode}: ${body}`));
          return;
        }

        resolve(JSON.parse(body) as T);
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function checkBookFeed(wsUrl: string, outcomeToken: string, marketId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket feed check timed out."));
    }, 5_000);

    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "subscribe",
        outcomeToken,
        marketId,
        outcome: "YES",
      }));
    });

    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { type: string; error?: { message?: string } };
      if (message.type === "error") {
        clearTimeout(timeout);
        socket.close();
        reject(new Error(message.error?.message ?? "WebSocket feed returned an error."));
        return;
      }

      if (message.type === "book_snapshot" || message.type === "best_bid_ask") {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const backoffMs = [2_000, 5_000, 15_000, 30_000];

  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === backoffMs.length || !isRetryableRpcError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }
  }

  throw new Error("unreachable retry state");
}

function isRetryableRpcError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("request limit reached") || message.includes("fetch failed");
}

function getWsUrl(clobApiUrl: string): string {
  const url = new URL(clobApiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/v1/ws";
  url.search = "";
  return url.toString();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function fail(message: string): never {
  errors.push(message);
  throw new Error(message);
}
