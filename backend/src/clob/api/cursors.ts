import type { Hex } from "../types.js";

export type OrdersCursor = {
  createdAt: string;
  acceptedSequence: string;
};

export type TradesCursor = {
  createdAt: string;
  tradeId: string;
};

export type OffsetCursor = {
  offset: string;
};

export type MarketConfigsCursor = {
  updatedAt: string;
  outcomeToken: Hex;
  marketId: Hex;
};

export function encodeCursor(value: OrdersCursor | TradesCursor | OffsetCursor | MarketConfigsCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeOrdersCursor(cursor: string): OrdersCursor {
  const value = decodeCursor(cursor);
  if (
    typeof value.createdAt !== "string" ||
    typeof value.acceptedSequence !== "string"
  ) {
    throw new Error("Invalid orders cursor.");
  }

  return {
    createdAt: value.createdAt,
    acceptedSequence: value.acceptedSequence,
  };
}

export function decodeTradesCursor(cursor: string): TradesCursor {
  const value = decodeCursor(cursor);
  if (typeof value.createdAt !== "string" || typeof value.tradeId !== "string") {
    throw new Error("Invalid trades cursor.");
  }

  return {
    createdAt: value.createdAt,
    tradeId: value.tradeId,
  };
}

export function decodeOffsetCursor(cursor: string, label: string): number {
  const value = decodeCursor(cursor);
  if (typeof value.offset !== "string" || !/^[0-9]+$/.test(value.offset)) {
    throw new Error(`Invalid ${label} cursor.`);
  }

  const parsed = Number(value.offset);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${label} cursor.`);
  }

  return parsed;
}

export function decodeMarketConfigsCursor(cursor: string): MarketConfigsCursor {
  const value = decodeCursor(cursor);
  if (
    typeof value.updatedAt !== "string" ||
    typeof value.outcomeToken !== "string" ||
    typeof value.marketId !== "string" ||
    !isHex(value.outcomeToken, 20) ||
    !isHex(value.marketId, 32)
  ) {
    throw new Error("Invalid markets cursor.");
  }

  const updatedAt = new Date(value.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error("Invalid markets cursor.");
  }

  return {
    updatedAt: value.updatedAt,
    outcomeToken: value.outcomeToken as Hex,
    marketId: value.marketId as Hex,
  };
}

function decodeCursor(cursor: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new Error("Invalid cursor.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid cursor.");
  }

  return parsed as Record<string, unknown>;
}

function isHex(value: string, bytes: number): boolean {
  return new RegExp(`^0x[a-fA-F0-9]{${bytes * 2}}$`).test(value);
}
