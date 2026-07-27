import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseMarketConfigArgs,
  parseMarketConfigIdentityArgs,
  parseMarketTickConfigArgs,
} from "../../scripts/market-config-args.js";

const validArgs = [
  "--outcome-token",
  "0x0000000000000000000000000000000000000001",
  "--market-id",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
  "--default-tick-units",
  "10000",
  "--edge-tick-units",
  "1000",
  "--lower-edge-price-units",
  "100000",
  "--upper-edge-price-units",
  "900000",
];

describe("parseMarketConfigArgs", () => {
  it("parses required and optional market config flags", () => {
    assert.deepEqual(
      parseMarketConfigArgs([
        ...validArgs,
        "--clob-enabled",
        "false",
        "--min-order-outcome-amount",
        "1000000",
        "--max-order-outcome-amount",
        "1000000000",
      ]),
      {
        outcomeToken: "0x0000000000000000000000000000000000000001",
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000002",
        clobEnabled: false,
        defaultTickUnits: 10_000n,
        edgeTickUnits: 1_000n,
        lowerEdgePriceUnits: 100_000n,
        upperEdgePriceUnits: 900_000n,
        minOrderOutcomeAmount: 1_000_000n,
        maxOrderOutcomeAmount: 1_000_000_000n,
      }
    );
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseMarketConfigArgs(["--unknown", "1"]), /Unknown --unknown/);
  });

  it("rejects invalid price bounds", () => {
    assert.throws(
      () =>
        parseMarketConfigArgs([
          ...replaceFlag(validArgs, "lower-edge-price-units", "900000"),
          "--upper-edge-price-units",
          "900000",
        ]),
      /lower-edge-price-units/
    );
  });

  it("rejects upper bound above price scale", () => {
    assert.throws(
      () => parseMarketConfigArgs(replaceFlag(validArgs, "upper-edge-price-units", "1000001")),
      /upper-edge-price-units/
    );
  });

  it("rejects min order amount above max order amount", () => {
    assert.throws(
      () =>
        parseMarketConfigArgs([
          ...validArgs,
          "--min-order-outcome-amount",
          "20",
          "--max-order-outcome-amount",
          "10",
        ]),
      /min-order-outcome-amount/
    );
  });
});

describe("parseMarketConfigIdentityArgs", () => {
  it("parses market config identity flags", () => {
    assert.deepEqual(
      parseMarketConfigIdentityArgs([
        "--outcome-token",
        "0x0000000000000000000000000000000000000001",
        "--market-id",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      ]),
      {
        outcomeToken: "0x0000000000000000000000000000000000000001",
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000002",
      }
    );
  });

  it("rejects non-identity flags", () => {
    assert.throws(
      () =>
        parseMarketConfigIdentityArgs([
          "--outcome-token",
          "0x0000000000000000000000000000000000000001",
          "--market-id",
          "0x0000000000000000000000000000000000000000000000000000000000000002",
          "--default-tick-units",
          "10000",
        ]),
      /Unknown --default-tick-units/
    );
  });
});

describe("parseMarketTickConfigArgs", () => {
  it("parses tick-only market config flags", () => {
    assert.deepEqual(parseMarketTickConfigArgs(validArgs), {
      outcomeToken: "0x0000000000000000000000000000000000000001",
      marketId: "0x0000000000000000000000000000000000000000000000000000000000000002",
      defaultTickUnits: 10_000n,
      edgeTickUnits: 1_000n,
      lowerEdgePriceUnits: 100_000n,
      upperEdgePriceUnits: 900_000n,
    });
  });

  it("rejects non-tick config flags", () => {
    assert.throws(
      () =>
        parseMarketTickConfigArgs([
          ...validArgs,
          "--min-order-outcome-amount",
          "100",
        ]),
      /Unknown --min-order-outcome-amount/
    );
  });
});

function replaceFlag(args: string[], flag: string, value: string): string[] {
  const next = [...args];
  const index = next.indexOf(`--${flag}`);
  if (index === -1) {
    throw new Error(`Missing test flag: ${flag}`);
  }

  next[index + 1] = value;
  return next;
}
