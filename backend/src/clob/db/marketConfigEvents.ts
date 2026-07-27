import type { Hex, MarketConfigEvent, MarketConfigEventType } from "../types.js";
import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";
import {
  mapMarketConfigEventRow,
  type MarketConfigEventRow,
} from "./rows.js";

export type InsertMarketConfigEventInput = {
  outcomeToken: Hex;
  marketId: Hex;
  eventType: MarketConfigEventType;
  defaultTickUnits?: bigint | null;
  edgeTickUnits?: bigint | null;
  lowerEdgePriceUnits?: bigint | null;
  upperEdgePriceUnits?: bigint | null;
};

export async function insertMarketConfigEvent(
  client: DbClient,
  input: InsertMarketConfigEventInput
): Promise<MarketConfigEvent> {
  const result = await client.query<MarketConfigEventRow>(
    `
      INSERT INTO market_config_events (
        outcome_token,
        market_id,
        event_type,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        market_config_event_id,
        outcome_token,
        market_id,
        event_type,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        created_at,
        processed_at
    `,
    [
      hexToBuffer(input.outcomeToken),
      hexToBuffer(input.marketId),
      input.eventType,
      input.defaultTickUnits?.toString() ?? null,
      input.edgeTickUnits?.toString() ?? null,
      input.lowerEdgePriceUnits?.toString() ?? null,
      input.upperEdgePriceUnits?.toString() ?? null,
    ]
  );

  return mapMarketConfigEventRow(result.rows[0]);
}

export async function getUnprocessedMarketConfigEventsForUpdate(
  client: DbClient,
  limit: number
): Promise<MarketConfigEvent[]> {
  const result = await client.query<MarketConfigEventRow>(
    `
      SELECT
        market_config_event_id,
        outcome_token,
        market_id,
        event_type,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        created_at,
        processed_at
      FROM market_config_events
      WHERE processed_at IS NULL
      ORDER BY created_at ASC, market_config_event_id ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `,
    [limit]
  );

  return result.rows.map(mapMarketConfigEventRow);
}

export async function markMarketConfigEventProcessed(
  client: DbClient,
  marketConfigEventId: bigint
): Promise<void> {
  await client.query(
    `
      UPDATE market_config_events
      SET processed_at = now()
      WHERE market_config_event_id = $1
    `,
    [marketConfigEventId.toString()]
  );
}
