import { getAddress, isHex } from "viem";
import { ClobError } from "../errors.js";
import type { CancelOrderInput, Hex, Outcome, OrderSide, SubmitOrderInput, TimeInForce } from "../types.js";

export function parseSubmitOrderRequest(value: unknown): SubmitOrderInput {
  const root = asRecord(value, "request");
  const order = asRecord(root.order, "order");

  return {
    order: {
      maker: parseAddress(order.maker, "order.maker"),
      outcomeToken: parseAddress(order.outcomeToken, "order.outcomeToken"),
      marketId: parseBytes32(order.marketId, "order.marketId"),
      outcome: parseOutcome(order.outcome, "order.outcome"),
      side: parseOrderSide(order.side, "order.side"),
      outcomeAmount: parsePositiveBigInt(order.outcomeAmount, "order.outcomeAmount"),
      usdcAmount: parsePositiveBigInt(order.usdcAmount, "order.usdcAmount"),
      expiration: parseDate(order.expiration, "order.expiration"),
      nonce: parseBigIntValue(order.nonce, "order.nonce"),
    },
    signature: parseHex(root.signature, "signature"),
    timeInForce: parseTimeInForce(root.timeInForce, "timeInForce"),
    priceUnits: parsePositiveBigInt(root.priceUnits, "priceUnits"),
  };
}

export function parseCancelOrderRequest(value: unknown): {
  cancel: CancelOrderInput;
  signature: Hex;
} {
  const root = asRecord(value, "request");
  const cancel = asRecord(root.cancel, "cancel");

  return {
    cancel: {
      maker: parseAddress(cancel.maker, "cancel.maker"),
      orderHash: parseBytes32(cancel.orderHash, "cancel.orderHash"),
      expiration: parseDate(cancel.expiration, "cancel.expiration"),
      nonce: parseBigIntValue(cancel.nonce, "cancel.nonce"),
    },
    signature: parseHex(root.signature, "signature"),
  };
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseAddress(value: unknown, fieldName: string): Hex {
  if (typeof value !== "string") {
    throw invalid(`${fieldName} must be an address string.`);
  }

  try {
    return getAddress(value) as Hex;
  } catch {
    throw invalid(`${fieldName} must be a valid address.`);
  }
}

function parseBytes32(value: unknown, fieldName: string): Hex {
  const hex = parseHex(value, fieldName);
  if (hex.length !== 66) {
    throw invalid(`${fieldName} must be bytes32 hex.`);
  }

  return hex;
}

function parseHex(value: unknown, fieldName: string): Hex {
  if (typeof value !== "string" || !isHex(value)) {
    throw invalid(`${fieldName} must be a hex string.`);
  }

  return value as Hex;
}

function parseOutcome(value: unknown, fieldName: string): Outcome {
  if (value === "YES" || value === "NO") {
    return value;
  }

  throw invalid(`${fieldName} must be YES or NO.`);
}

function parseOrderSide(value: unknown, fieldName: string): OrderSide {
  if (value === "BUY" || value === "SELL") {
    return value;
  }

  throw invalid(`${fieldName} must be BUY or SELL.`);
}

function parseTimeInForce(value: unknown, fieldName: string): TimeInForce {
  if (value === "GTC" || value === "FAK") {
    return value;
  }

  throw invalid(`${fieldName} must be GTC or FAK.`);
}

function parsePositiveBigInt(value: unknown, fieldName: string): bigint {
  const parsed = parseBigIntValue(value, fieldName);
  if (parsed <= 0n) {
    throw invalid(`${fieldName} must be positive.`);
  }

  return parsed;
}

function parseBigIntValue(value: unknown, fieldName: string): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw invalid(`${fieldName} must be a non-negative safe integer.`);
    }

    return BigInt(value);
  }

  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalid(`${fieldName} must be a non-negative integer string.`);
  }

  return BigInt(value);
}

function parseDate(value: unknown, fieldName: string): Date {
  if (typeof value !== "string") {
    throw invalid(`${fieldName} must be an ISO timestamp string.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw invalid(`${fieldName} must be a valid ISO timestamp string.`);
  }

  return date;
}

function invalid(message: string): ClobError {
  return new ClobError("INVALID_ORDER", message);
}
