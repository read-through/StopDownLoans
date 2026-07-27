import { InMemoryOrderBook } from "../book.js";
import {
  getLoanPositionChainView,
  getNextPositionId,
} from "../chain/contracts.js";
import type { DbClient } from "../db/client.js";
import { getLoanSnapshotsByMarketIds, listLoanSnapshots } from "../db/loanSnapshots.js";
import { getMarketConfig, listMarketConfigs } from "../db/marketConfigs.js";
import { getLiveOrdersForBook, getLiveOrdersForOutcome, getOrderByHash, getOrdersByMaker } from "../db/orders.js";
import { getReservationsByMaker } from "../db/reservations.js";
import { getConfirmedUsdcVolumeByMarkets, getTradesByMarket } from "../db/trades.js";
import { ClobError } from "../errors.js";
import type { Hex, OrderStatus, Outcome } from "../types.js";
import { decodeMarketConfigsCursor, decodeOrdersCursor, decodeTradesCursor, encodeCursor } from "./cursors.js";
import {
  toApiBookSnapshotDto,
  toApiLoanDto,
  toApiMarketConfigDto,
  toApiMarketSummaryDto,
  toApiOrderDto,
  toApiLoanPositionDto,
  toApiReservationDto,
  toApiTradeDto,
  type ApiBookSnapshotDto,
  type ApiLoanDto,
  type ApiLoanPositionDto,
  type ApiMarketConfigDto,
  type ApiMarketSummaryDto,
  type ApiOrderDto,
  type ApiReservationDto,
  type ApiTradeDto,
} from "./dto.js";
import type { PublicClient } from "viem";

export async function getOrderView(
  client: DbClient,
  orderHash: Hex
): Promise<ApiOrderDto> {
  const order = await getOrderByHash(client, orderHash);
  if (order === null) {
    throw new ClobError("ORDER_NOT_FOUND", "Order not found.");
  }

  return toApiOrderDto(order);
}

export async function getOrdersView(
  client: DbClient,
  params: {
    maker: Hex;
    status?: OrderStatus;
    limit: number;
    cursor?: string;
  }
): Promise<{
  orders: ApiOrderDto[];
  nextCursor: string | null;
}> {
  const orders = await getOrdersByMaker(client, {
    maker: params.maker,
    status: params.status,
    limit: params.limit + 1,
    cursor: params.cursor === undefined ? undefined : parseOrdersCursor(params.cursor),
  });
  const page = orders.slice(0, params.limit);
  const nextOrder = orders[params.limit];

  return {
    orders: page.map(toApiOrderDto),
    nextCursor:
      nextOrder === undefined
        ? null
        : encodeCursor({
            createdAt: nextOrder.createdAt.toISOString(),
            acceptedSequence: nextOrder.acceptedSequence.toString(),
          }),
  };
}

export async function getBookView(
  client: DbClient,
  params: {
    outcomeToken: Hex;
    marketId: Hex;
    outcome: Outcome;
    sequence: bigint;
    timestamp: Date;
  }
): Promise<ApiBookSnapshotDto> {
  const orders = await getLiveOrdersForBook(
    client,
    params.outcomeToken,
    params.marketId,
    params.outcome
  );
  const book = InMemoryOrderBook.fromOrders(
    {
      outcomeToken: params.outcomeToken,
      marketId: params.marketId,
      outcome: params.outcome,
    },
    orders
  );

  return toApiBookSnapshotDto(book.snapshot(), {
    sequence: params.sequence,
    timestamp: params.timestamp,
  });
}

export async function getMarketConfigView(
  client: DbClient,
  params: {
    outcomeToken: Hex;
    marketId: Hex;
  }
): Promise<ApiMarketConfigDto> {
  const config = await getMarketConfig(client, params.outcomeToken, params.marketId);
  if (config === null) {
    throw new ClobError("MARKET_CONFIG_NOT_FOUND", "Market config not found.");
  }

  return toApiMarketConfigDto(config);
}

export async function getMarketsView(
  client: DbClient,
  params?: {
    limit?: number;
    cursor?: string;
  }
): Promise<{
  markets: ApiMarketSummaryDto[];
  nextCursor: string | null;
}> {
  const limit = params?.limit ?? 100;
  const cursor = params?.cursor === undefined ? undefined : decodeMarketConfigsCursor(params.cursor);
  const configs = await listMarketConfigs(client, {
    limit: limit + 1,
    after: cursor === undefined
      ? undefined
      : {
          updatedAt: new Date(cursor.updatedAt),
          outcomeToken: cursor.outcomeToken,
          marketId: cursor.marketId,
        },
  });
  const pageConfigs = configs.slice(0, limit);
  const lastPageConfig = pageConfigs[pageConfigs.length - 1];
  const nextCursor = configs.length > limit && lastPageConfig !== undefined
    ? encodeCursor({
        updatedAt: lastPageConfig.updatedAt.toISOString(),
        outcomeToken: lastPageConfig.outcomeToken,
        marketId: lastPageConfig.marketId,
      })
    : null;
  const [yesOrders, volumes, loansByMarket] = await Promise.all([
    getLiveOrdersForOutcome(client, "YES"),
    getConfirmedUsdcVolumeByMarkets(client),
    getLoanSnapshotsByMarketIds(client, pageConfigs.map((config) => config.marketId)),
  ]);
  const yesOrdersByMarket = groupOrdersByMarket(yesOrders);
  const volumeByMarket = new Map(
    volumes.map((volume) => [
      getMarketKey(volume.outcomeToken, volume.marketId),
      volume.confirmedUsdcVolume,
    ])
  );

  return {
    markets: pageConfigs.map((config) => {
      const key = getMarketKey(config.outcomeToken, config.marketId);
      const book = InMemoryOrderBook.fromOrders(
        {
          outcomeToken: config.outcomeToken,
          marketId: config.marketId,
          outcome: "YES",
        },
        yesOrdersByMarket.get(key) ?? []
      ).snapshot();

      return toApiMarketSummaryDto(config, {
        yesBestBid: book.bids[0] ?? null,
        yesBestAsk: book.asks[0] ?? null,
        confirmedUsdcVolume: volumeByMarket.get(key) ?? 0n,
        loan: loansByMarket.get(getLoanMarketKey(config.marketId)) ?? null,
      });
    }),
    nextCursor,
  };
}

export async function getLoansView(
  client: DbClient,
  params: {
    limit: number;
    cursor?: string;
  }
): Promise<{
  loans: ApiLoanDto[];
  nextCursor: string | null;
}> {
  const loans = await listLoanSnapshots(client, {
    limit: params.limit + 1,
    cursor: params.cursor === undefined ? undefined : parsePositiveBigintCursor(params.cursor, "loans cursor"),
  });
  const page = loans.slice(0, params.limit);
  const nextLoan = loans[params.limit];

  return {
    loans: page.map(toApiLoanDto),
    nextCursor: nextLoan === undefined ? null : nextLoan.loanId.toString(),
  };
}

export async function getLoanPositionsView(
  publicClient: PublicClient,
  params: {
    loanPositionToken: Hex;
    account: Hex;
    limit: number;
    cursor?: string;
  }
): Promise<{
  positions: ApiLoanPositionDto[];
  nextCursor: string | null;
}> {
  const nextPositionId = await getNextPositionId(publicClient, params.loanPositionToken);
  if (nextPositionId <= 1n) {
    return {
      positions: [],
      nextCursor: null,
    };
  }

  const requestedStartPositionId =
    params.cursor === undefined
      ? nextPositionId - 1n
      : parsePositiveBigintCursor(params.cursor, "positions cursor");
  let current = requestedStartPositionId >= nextPositionId ? nextPositionId - 1n : requestedStartPositionId;
  const positions: ApiLoanPositionDto[] = [];

  while (current > 0n && positions.length < params.limit) {
    const position = await getLoanPositionChainView(
      publicClient,
      params.loanPositionToken,
      params.account,
      current
    );
    if (position !== null) {
      positions.push(toApiLoanPositionDto(position));
    }
    current--;
  }

  return {
    positions,
    nextCursor: current > 0n ? current.toString() : null,
  };
}

export async function getTradesView(
  client: DbClient,
  params: {
    outcomeToken: Hex;
    marketId: Hex;
    outcome: Outcome;
    limit: number;
    cursor?: string;
  }
): Promise<{
  trades: ApiTradeDto[];
  nextCursor: string | null;
}> {
  const trades = await getTradesByMarket(client, {
    ...params,
    limit: params.limit + 1,
    cursor: params.cursor === undefined ? undefined : parseTradesCursor(params.cursor),
  });
  const page = trades.slice(0, params.limit);
  const nextTrade = trades[params.limit];

  return {
    trades: page.map(toApiTradeDto),
    nextCursor:
      nextTrade === undefined
        ? null
        : encodeCursor({
            createdAt: nextTrade.createdAt.toISOString(),
            tradeId: nextTrade.tradeId.toString(),
          }),
  };
}

export async function getReservationsView(
  client: DbClient,
  maker: Hex
): Promise<{
  maker: Hex;
  reservations: ApiReservationDto[];
}> {
  const reservations = await getReservationsByMaker(client, maker);

  return {
    maker,
    reservations: reservations.map(toApiReservationDto),
  };
}

function parseOrdersCursor(cursor: string): { createdAt: Date; acceptedSequence: bigint } {
  try {
    const decoded = decodeOrdersCursor(cursor);
    return {
      createdAt: parseCursorDate(decoded.createdAt),
      acceptedSequence: BigInt(decoded.acceptedSequence),
    };
  } catch {
    throw new ClobError("INVALID_ORDER", "Invalid orders cursor.");
  }
}

function parseTradesCursor(cursor: string): { createdAt: Date; tradeId: bigint } {
  try {
    const decoded = decodeTradesCursor(cursor);
    return {
      createdAt: parseCursorDate(decoded.createdAt),
      tradeId: BigInt(decoded.tradeId),
    };
  } catch {
    throw new ClobError("INVALID_ORDER", "Invalid trades cursor.");
  }
}

function parsePositiveBigintCursor(value: string, fieldName: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new ClobError("INVALID_ORDER", `${fieldName} must be a positive integer.`);
  }

  return BigInt(value);
}

function groupOrdersByMarket(
  orders: Awaited<ReturnType<typeof getLiveOrdersForOutcome>>
): Map<string, typeof orders> {
  const grouped = new Map<string, typeof orders>();

  for (const order of orders) {
    const key = getMarketKey(order.outcomeToken, order.marketId);
    const existing = grouped.get(key);

    if (existing === undefined) {
      grouped.set(key, [order]);
      continue;
    }

    existing.push(order);
  }

  return grouped;
}

function getLoanMarketKey(marketId: Hex): string {
  return marketId.toLowerCase();
}

function getMarketKey(outcomeToken: Hex, marketId: Hex): string {
  return `${outcomeToken.toLowerCase()}:${marketId.toLowerCase()}`;
}

function parseCursorDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid cursor date.");
  }

  return date;
}
