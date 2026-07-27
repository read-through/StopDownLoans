import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { PublicClient } from "viem";
import { createArcPublicClient } from "../chain/arc.js";
import { getBackendCursor } from "../db/chainEvents.js";
import { getPool, type DbClient } from "../db/client.js";
import { ClobError } from "../errors.js";
import { formatRpcErrorMessage, isRpcRateLimitError } from "../rpcErrors.js";
import type { Hex, OrderStatus, Outcome } from "../types.js";
import { loadClobBackendConfig, type ClobBackendConfig } from "../config.js";
import { type BookFeedPublisher } from "./bookFeedPublisher.js";
import type { ApiHealthDto } from "./dto.js";
import { OUTCOME_EXCHANGE_EVENTS_CURSOR } from "../reconciliationLoop.js";
import {
  getBookView,
  getLoanPositionsView,
  getLoansView,
  getMarketConfigView,
  getMarketsView,
  getOrderView,
  getOrdersView,
  getReservationsView,
  getTradesView,
} from "./readServices.js";
import { cancelOrderRequest, submitOrderRequest, type ClobWriteServiceConfig } from "./writeServices.js";

type ClobHttpReadServices = {
  getBookView: typeof getBookView;
  getLoanPositionsView: typeof getLoanPositionsView;
  getLoansView: typeof getLoansView;
  getMarketConfigView: typeof getMarketConfigView;
  getMarketsView: typeof getMarketsView;
  getOrderView: typeof getOrderView;
  getOrdersView: typeof getOrdersView;
  getReservationsView: typeof getReservationsView;
  getTradesView: typeof getTradesView;
};

type ClobHttpWriteServices = {
  submitOrderRequest: typeof submitOrderRequest;
  cancelOrderRequest: typeof cancelOrderRequest;
};

export type ClobHttpServerOptions = {
  config?: ClobBackendConfig;
  now?: () => Date;
  bookFeedPublisher?: BookFeedPublisher;
  dbClient?: DbClient;
  publicClient?: PublicClient;
  readServices?: Partial<ClobHttpReadServices>;
  writeServices?: Partial<ClobHttpWriteServices>;
};

export function createClobHttpServer(options: ClobHttpServerOptions = {}): Server {
  const config = options.config ?? loadClobBackendConfig();
  const now = options.now ?? (() => new Date());
  const publicClient =
    options.publicClient ??
    createArcPublicClient({
      rpcUrl: config.arcRpcUrl,
    });
  const writeConfig: ClobWriteServiceConfig = {
    domain: {
      chainId: config.chainId,
      verifyingContract: config.outcomeExchange,
    },
    usdc: config.usdc,
    outcomeExchange: config.outcomeExchange,
    publicClient,
    now,
    bookFeedPublisher: options.bookFeedPublisher,
  };

  return createServer(async (request, response) => {
    applyCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const result = await routeRequest(
        request,
        {
          loanPositionToken: config.loanPositionToken,
          publicClient,
          writeConfig,
        },
        now,
        () => options.dbClient ?? getPool(),
        {
          config,
          read: {
            getBookView,
            getLoanPositionsView,
            getLoansView,
            getMarketConfigView,
            getMarketsView,
            getOrderView,
            getOrdersView,
            getReservationsView,
            getTradesView,
            ...options.readServices,
          },
          write: {
            submitOrderRequest,
            cancelOrderRequest,
            ...options.writeServices,
          },
        }
      );
      sendJson(response, 200, result);
    } catch (error) {
      sendError(response, error);
    }
  });
}

function applyCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

async function routeRequest(
  request: IncomingMessage,
  context: {
    loanPositionToken: Hex;
    publicClient: PublicClient;
    writeConfig: ClobWriteServiceConfig;
  },
  now: () => Date,
  getDbClient: () => DbClient,
  services: {
    config: ClobBackendConfig;
    read: ClobHttpReadServices;
    write: ClobHttpWriteServices;
  }
): Promise<unknown> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = trimPath(url.pathname);

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "health") {
    return getHealthDto(services.config, context.publicClient, getDbClient(), now());
  }

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "loans") {
    return services.read.getLoansView(getDbClient(), {
      limit: parseLimit(url.searchParams.get("limit")),
      cursor: parseOptionalCursor(url.searchParams.get("cursor")),
    });
  }

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "loan-positions") {
    return services.read.getLoanPositionsView(context.publicClient, {
      loanPositionToken: context.loanPositionToken,
      account: parseRequiredAddressQuery(url, "account"),
      limit: parseLimit(url.searchParams.get("limit")),
      cursor: parseOptionalCursor(url.searchParams.get("cursor")),
    });
  }

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "markets") {
    return services.read.getMarketsView(getDbClient(), {
      limit: parseLimit(url.searchParams.get("limit")),
      cursor: parseOptionalCursor(url.searchParams.get("cursor")),
    });
  }

  if (request.method === "GET" && path.length === 5 && path[0] === "v1" && path[1] === "books") {
    return services.read.getBookView(getDbClient(), {
      outcomeToken: parseAddressPath(path[2], "outcomeToken"),
      marketId: parseBytes32Path(path[3], "marketId"),
      outcome: parseOutcome(path[4]),
      sequence: 0n,
      timestamp: now(),
    });
  }

  if (
    request.method === "GET" &&
    path.length === 4 &&
    path[0] === "v1" &&
    path[1] === "market-configs"
  ) {
    return services.read.getMarketConfigView(getDbClient(), {
      outcomeToken: parseAddressPath(path[2], "outcomeToken"),
      marketId: parseBytes32Path(path[3], "marketId"),
    });
  }

  if (
    request.method === "GET" &&
    path.length === 6 &&
    path[0] === "v1" &&
    path[1] === "books" &&
    path[5] === "best"
  ) {
    const book = await services.read.getBookView(getDbClient(), {
      outcomeToken: parseAddressPath(path[2], "outcomeToken"),
      marketId: parseBytes32Path(path[3], "marketId"),
      outcome: parseOutcome(path[4]),
      sequence: 0n,
      timestamp: now(),
    });

    return {
      outcomeToken: book.outcomeToken,
      marketId: book.marketId,
      outcome: book.outcome,
      sequence: book.sequence,
      bestBid: book.bids[0] ?? null,
      bestAsk: book.asks[0] ?? null,
      timestamp: book.timestamp,
    };
  }

  if (request.method === "GET" && path.length === 3 && path[0] === "v1" && path[1] === "orders") {
    return services.read.getOrderView(getDbClient(), parseBytes32Path(path[2], "orderHash"));
  }

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "orders") {
    return services.read.getOrdersView(getDbClient(), {
      maker: parseRequiredAddressQuery(url, "maker"),
      status: parseOptionalOrderStatus(url.searchParams.get("status")),
      limit: parseLimit(url.searchParams.get("limit")),
      cursor: parseOptionalCursor(url.searchParams.get("cursor")),
    });
  }

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "trades") {
    return services.read.getTradesView(getDbClient(), {
      outcomeToken: parseRequiredAddressQuery(url, "outcomeToken"),
      marketId: parseRequiredBytes32Query(url, "marketId"),
      outcome: parseOutcome(url.searchParams.get("outcome")),
      limit: parseLimit(url.searchParams.get("limit")),
      cursor: parseOptionalCursor(url.searchParams.get("cursor")),
    });
  }

  if (request.method === "GET" && path.length === 2 && path[0] === "v1" && path[1] === "reservations") {
    return services.read.getReservationsView(getDbClient(), parseRequiredAddressQuery(url, "maker"));
  }

  if (request.method === "POST" && path.length === 2 && path[0] === "v1" && path[1] === "orders") {
    return services.write.submitOrderRequest(await readJsonBody(request), context.writeConfig);
  }

  if (
    request.method === "POST" &&
    path.length === 4 &&
    path[0] === "v1" &&
    path[1] === "orders" &&
    path[3] === "cancel"
  ) {
    const body = await readJsonBody(request);
    return services.write.cancelOrderRequest(
      attachCancelOrderHash(body, parseBytes32Path(path[2], "orderHash")),
      context.writeConfig
    );
  }

  throw new ClobError("INVALID_ORDER", "Route not found.");
}

async function getHealthDto(
  config: ClobBackendConfig,
  publicClient: PublicClient,
  dbClient: DbClient,
  timestamp: Date
): Promise<ApiHealthDto> {
  return {
    status: "ok",
    service: "clob-backend",
    timestamp: timestamp.toISOString(),
    chainId: config.chainId,
    contracts: {
      loanPositionToken: config.loanPositionToken,
      outcomeExchange: config.outcomeExchange,
      usdc: config.usdc,
    },
    executorEnabled: config.executorPrivateKey !== null,
    confirmationDepth: config.reconciliationConfirmationDepth.toString(),
    sync: await getSyncHealthDto(config, publicClient, dbClient),
  };
}

async function getSyncHealthDto(
  config: ClobBackendConfig,
  publicClient: PublicClient,
  dbClient: DbClient
): Promise<ApiHealthDto["sync"]> {
  const cursorName = OUTCOME_EXCHANGE_EVENTS_CURSOR;

  try {
    const [latestBlock, lastIndexedBlock] = await Promise.all([
      publicClient.getBlockNumber(),
      getBackendCursor(dbClient, cursorName),
    ]);
    const safeHeadBlock =
      latestBlock < config.reconciliationConfirmationDepth
        ? 0n
        : latestBlock - config.reconciliationConfirmationDepth;
    const lagBlocks =
      lastIndexedBlock === null
        ? null
        : safeHeadBlock > lastIndexedBlock
          ? safeHeadBlock - lastIndexedBlock
          : 0n;

    return {
      status: "ok",
      cursorName,
      latestBlock: latestBlock.toString(),
      safeHeadBlock: safeHeadBlock.toString(),
      lastIndexedBlock: lastIndexedBlock?.toString() ?? null,
      lagBlocks: lagBlocks?.toString() ?? null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      cursorName,
      error: error instanceof Error ? error.message : "Sync health unavailable.",
    };
  }
}

function trimPath(pathname: string): string[] {
  return pathname.split("/").filter((part) => part.length > 0);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") {
    throw new ClobError("INVALID_ORDER", "Request body is required.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ClobError("INVALID_ORDER", "Request body must be valid JSON.");
  }
}

function attachCancelOrderHash(body: unknown, orderHash: Hex): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return body;
  }

  const root = body as Record<string, unknown>;
  if (typeof root.cancel !== "object" || root.cancel === null || Array.isArray(root.cancel)) {
    return body;
  }

  return {
    ...root,
    cancel: {
      ...(root.cancel as Record<string, unknown>),
      orderHash,
    },
  };
}

function parseRequiredAddressQuery(url: URL, key: string): Hex {
  return parseAddressPath(requireQuery(url, key), key);
}

function parseRequiredBytes32Query(url: URL, key: string): Hex {
  return parseBytes32Path(requireQuery(url, key), key);
}

function requireQuery(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (value === null || value === "") {
    throw new ClobError("INVALID_ORDER", `${key} query param is required.`);
  }

  return value;
}

function parseAddressPath(value: string, fieldName: string): Hex {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new ClobError("INVALID_ORDER", `${fieldName} must be an address.`);
  }

  return value as Hex;
}

function parseBytes32Path(value: string, fieldName: string): Hex {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new ClobError("INVALID_ORDER", `${fieldName} must be bytes32.`);
  }

  return value as Hex;
}

function parseOutcome(value: string | null): Outcome {
  if (value === "YES" || value === "NO") {
    return value;
  }

  throw new ClobError("INVALID_ORDER", "outcome must be YES or NO.");
}

function parseOptionalOrderStatus(value: string | null): OrderStatus | undefined {
  if (value === null || value === "") {
    return undefined;
  }

  if (value === "LIVE" || value === "FILLED" || value === "CANCELLED" || value === "EXPIRED" || value === "FAILED") {
    return value;
  }

  throw new ClobError("INVALID_ORDER", "status is invalid.");
}

function parseLimit(value: string | null): number {
  if (value === null || value === "") {
    return 100;
  }

  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new ClobError("INVALID_ORDER", "limit must be a positive integer.");
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 500) {
    throw new ClobError("INVALID_ORDER", "limit must be between 1 and 500.");
  }

  return parsed;
}

function parseOptionalCursor(value: string | null): string | undefined {
  if (value === null || value === "") {
    return undefined;
  }

  return value;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown): void {
  if (isRpcRateLimitError(error)) {
    sendJson(response, 429, {
      error: {
        code: "RATE_LIMITED",
        message: formatRpcErrorMessage(error),
      },
    });
    return;
  }

  if (error instanceof ClobError) {
    const statusCode =
      error.code === "ORDER_NOT_FOUND" || error.code === "MARKET_CONFIG_NOT_FOUND" ? 404 : 400;

    sendJson(response, statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  sendJson(response, 500, {
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Internal error.",
    },
  });
}
