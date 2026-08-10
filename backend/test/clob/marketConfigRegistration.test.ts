import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DbClient } from "../../src/clob/db/client.js";
import { createMarketConfigIfMissing } from "../../src/clob/db/marketConfigs.js";
import type { Hex } from "../../src/clob/types.js";

const outcomeToken = `0x${"11".repeat(20)}` as Hex;
const marketId = `0x${"22".repeat(32)}` as Hex;
const now = new Date("2026-01-01T00:00:00.000Z");

const input = {
  outcomeToken,
  marketId,
  clobEnabled: true,
  defaultTickUnits: 1_000n,
  edgeTickUnits: 100n,
  lowerEdgePriceUnits: 100_000n,
  upperEdgePriceUnits: 900_000n,
  minOrderOutcomeAmount: 1n,
  maxOrderOutcomeAmount: null,
};

describe("createMarketConfigIfMissing", () => {
  it("creates the config and its feed events exactly once", async () => {
    const eventTypes: string[] = [];
    let configInsertCount = 0;
    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes("INSERT INTO market_configs")) {
          configInsertCount += 1;
          return {
            rowCount: configInsertCount === 1 ? 1 : 0,
            rows: configInsertCount === 1 ? [marketConfigRow()] : [],
          };
        }

        if (sql.includes("INSERT INTO market_config_events")) {
          const eventType = params[2] as string;
          eventTypes.push(eventType);
          return {
            rowCount: 1,
            rows: [marketConfigEventRow(eventTypes.length, eventType)],
          };
        }

        throw new Error(`Unexpected query: ${sql}`);
      },
    } as unknown as DbClient;

    const created = await createMarketConfigIfMissing(client, input);
    const existing = await createMarketConfigIfMissing(client, input);

    assert.equal(created?.marketId, marketId);
    assert.equal(existing, null);
    assert.deepEqual(eventTypes, ["TICK_SIZE_CHANGE", "MARKET_OPENED"]);
  });
});

function marketConfigRow() {
  return {
    outcome_token: Buffer.from(outcomeToken.slice(2), "hex"),
    market_id: Buffer.from(marketId.slice(2), "hex"),
    clob_enabled: true,
    default_tick_units: "1000",
    edge_tick_units: "100",
    lower_edge_price_units: "100000",
    upper_edge_price_units: "900000",
    min_order_outcome_amount: "1",
    max_order_outcome_amount: null,
    created_at: now,
    updated_at: now,
  };
}

function marketConfigEventRow(id: number, eventType: string) {
  return {
    market_config_event_id: id.toString(),
    outcome_token: Buffer.from(outcomeToken.slice(2), "hex"),
    market_id: Buffer.from(marketId.slice(2), "hex"),
    event_type: eventType,
    default_tick_units: eventType === "TICK_SIZE_CHANGE" ? "1000" : null,
    edge_tick_units: eventType === "TICK_SIZE_CHANGE" ? "100" : null,
    lower_edge_price_units: eventType === "TICK_SIZE_CHANGE" ? "100000" : null,
    upper_edge_price_units: eventType === "TICK_SIZE_CHANGE" ? "900000" : null,
    created_at: now,
    processed_at: null,
  };
}
