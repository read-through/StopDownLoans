import { getAddress } from "viem";
import { PRICE_SCALE, type Hex } from "../src/clob/types.js";

export type ParsedMarketConfigArgs = {
  outcomeToken: Hex;
  marketId: Hex;
  clobEnabled: boolean;
  defaultTickUnits: bigint;
  edgeTickUnits: bigint;
  lowerEdgePriceUnits: bigint;
  upperEdgePriceUnits: bigint;
  minOrderOutcomeAmount: bigint | null;
  maxOrderOutcomeAmount: bigint | null;
};

export type ParsedMarketConfigIdentityArgs = {
  outcomeToken: Hex;
  marketId: Hex;
};

export type ParsedMarketTickConfigArgs = {
  outcomeToken: Hex;
  marketId: Hex;
  defaultTickUnits: bigint;
  edgeTickUnits: bigint;
  lowerEdgePriceUnits: bigint;
  upperEdgePriceUnits: bigint;
};

const marketConfigFlags = new Set([
  "outcome-token",
  "market-id",
  "clob-enabled",
  "default-tick-units",
  "edge-tick-units",
  "lower-edge-price-units",
  "upper-edge-price-units",
  "min-order-outcome-amount",
  "max-order-outcome-amount",
]);

const marketConfigIdentityFlags = new Set([
  "outcome-token",
  "market-id",
]);

const marketTickConfigFlags = new Set([
  "outcome-token",
  "market-id",
  "default-tick-units",
  "edge-tick-units",
  "lower-edge-price-units",
  "upper-edge-price-units",
]);

export function parseMarketConfigArgs(argv: string[]): ParsedMarketConfigArgs {
  const values = parseFlags(argv, marketConfigFlags, marketConfigUsage());

  const args = {
    outcomeToken: parseAddress(requireFlag(values, "outcome-token"), "outcome-token"),
    marketId: parseBytes32(requireFlag(values, "market-id"), "market-id"),
    clobEnabled: parseBoolean(values.get("clob-enabled") ?? "true", "clob-enabled"),
    defaultTickUnits: parsePositiveBigint(requireFlag(values, "default-tick-units"), "default-tick-units"),
    edgeTickUnits: parsePositiveBigint(requireFlag(values, "edge-tick-units"), "edge-tick-units"),
    lowerEdgePriceUnits: parseNonNegativeBigint(
      requireFlag(values, "lower-edge-price-units"),
      "lower-edge-price-units"
    ),
    upperEdgePriceUnits: parseNonNegativeBigint(
      requireFlag(values, "upper-edge-price-units"),
      "upper-edge-price-units"
    ),
    minOrderOutcomeAmount: parseOptionalPositiveBigint(
      values.get("min-order-outcome-amount"),
      "min-order-outcome-amount"
    ),
    maxOrderOutcomeAmount: parseOptionalPositiveBigint(
      values.get("max-order-outcome-amount"),
      "max-order-outcome-amount"
    ),
  };

  validateMarketConfigArgs(args);

  return args;
}

export function parseMarketConfigIdentityArgs(argv: string[]): ParsedMarketConfigIdentityArgs {
  const values = parseFlags(argv, marketConfigIdentityFlags, marketConfigIdentityUsage());

  return {
    outcomeToken: parseAddress(requireFlag(values, "outcome-token"), "outcome-token"),
    marketId: parseBytes32(requireFlag(values, "market-id"), "market-id"),
  };
}

export function parseMarketTickConfigArgs(argv: string[]): ParsedMarketTickConfigArgs {
  const values = parseFlags(argv, marketTickConfigFlags, marketTickConfigUsage());
  const args = {
    outcomeToken: parseAddress(requireFlag(values, "outcome-token"), "outcome-token"),
    marketId: parseBytes32(requireFlag(values, "market-id"), "market-id"),
    defaultTickUnits: parsePositiveBigint(requireFlag(values, "default-tick-units"), "default-tick-units"),
    edgeTickUnits: parsePositiveBigint(requireFlag(values, "edge-tick-units"), "edge-tick-units"),
    lowerEdgePriceUnits: parseNonNegativeBigint(
      requireFlag(values, "lower-edge-price-units"),
      "lower-edge-price-units"
    ),
    upperEdgePriceUnits: parseNonNegativeBigint(
      requireFlag(values, "upper-edge-price-units"),
      "upper-edge-price-units"
    ),
  };

  validateTickConfigArgs(args);

  return args;
}

export function marketConfigUsage(): string {
  return [
    "Usage:",
    "npm.cmd run market-config:upsert -- --outcome-token 0x... --market-id 0x... --default-tick-units 10000 --edge-tick-units 1000 --lower-edge-price-units 100000 --upper-edge-price-units 900000",
  ].join("\n");
}

export function marketConfigIdentityUsage(): string {
  return [
    "Usage:",
    "npm.cmd run market-config:get -- --outcome-token 0x... --market-id 0x...",
    "npm.cmd run market-config:open -- --outcome-token 0x... --market-id 0x...",
    "npm.cmd run market-config:close -- --outcome-token 0x... --market-id 0x...",
  ].join("\n");
}

export function marketTickConfigUsage(): string {
  return [
    "Usage:",
    "npm.cmd run market-config:update-ticks -- --outcome-token 0x... --market-id 0x... --default-tick-units 10000 --edge-tick-units 1000 --lower-edge-price-units 100000 --upper-edge-price-units 900000",
  ].join("\n");
}

function parseFlags(argv: string[], allowedFlags: Set<string>, usage: string): Map<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === undefined || !key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(usage);
    }

    const flag = key.slice(2);
    if (!allowedFlags.has(flag)) {
      throw new Error(`Unknown --${flag}.\n\n${usage}`);
    }

    values.set(flag, value);
  }

  return values;
}

function validateMarketConfigArgs(args: ParsedMarketConfigArgs): void {
  validateTickConfigArgs(args);

  if (
    args.minOrderOutcomeAmount !== null &&
    args.maxOrderOutcomeAmount !== null &&
    args.minOrderOutcomeAmount > args.maxOrderOutcomeAmount
  ) {
    throw new Error("--min-order-outcome-amount must be <= --max-order-outcome-amount.");
  }
}

function validateTickConfigArgs(args: Pick<
  ParsedMarketConfigArgs,
  "lowerEdgePriceUnits" | "upperEdgePriceUnits"
>): void {
  if (args.lowerEdgePriceUnits >= args.upperEdgePriceUnits) {
    throw new Error("--lower-edge-price-units must be lower than --upper-edge-price-units.");
  }

  if (args.upperEdgePriceUnits > PRICE_SCALE) {
    throw new Error(`--upper-edge-price-units must be <= ${PRICE_SCALE.toString()}.`);
  }
}

function requireFlag(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing --${key}.\n\n${marketConfigUsage()}`);
  }

  return value;
}

function parseAddress(value: string, key: string): Hex {
  try {
    return getAddress(value) as Hex;
  } catch {
    throw new Error(`--${key} must be an EVM address.`);
  }
}

function parseBytes32(value: string, key: string): Hex {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`--${key} must be bytes32.`);
  }

  return value as Hex;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`--${key} must be true or false.`);
}

function parseOptionalPositiveBigint(value: string | undefined, key: string): bigint | null {
  return value === undefined ? null : parsePositiveBigint(value, key);
}

function parsePositiveBigint(value: string, key: string): bigint {
  const parsed = parseNonNegativeBigint(value, key);
  if (parsed <= 0n) {
    throw new Error(`--${key} must be positive.`);
  }

  return parsed;
}

function parseNonNegativeBigint(value: string, key: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`--${key} must be an integer string.`);
  }

  return BigInt(value);
}
