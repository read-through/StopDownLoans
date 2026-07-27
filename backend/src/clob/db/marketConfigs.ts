import type { MarketConfig } from "../types.js";
import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";
import { insertMarketConfigEvent } from "./marketConfigEvents.js";
import { mapMarketConfigRow, type MarketConfigRow } from "./rows.js";

export type UpsertMarketConfigInput = {
  outcomeToken: MarketConfig["outcomeToken"];
  marketId: MarketConfig["marketId"];
  clobEnabled: boolean;
  defaultTickUnits: bigint;
  edgeTickUnits: bigint;
  lowerEdgePriceUnits: bigint;
  upperEdgePriceUnits: bigint;
  minOrderOutcomeAmount: bigint | null;
  maxOrderOutcomeAmount: bigint | null;
};

export async function getMarketConfig(
  client: DbClient,
  outcomeToken: MarketConfig["outcomeToken"],
  marketId: MarketConfig["marketId"]
): Promise<MarketConfig | null> {
  const result = await client.query<MarketConfigRow>(
    `
      SELECT
        outcome_token,
        market_id,
        clob_enabled,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        min_order_outcome_amount,
        max_order_outcome_amount,
        created_at,
        updated_at
      FROM market_configs
      WHERE outcome_token = $1
        AND market_id = $2
    `,
    [hexToBuffer(outcomeToken), hexToBuffer(marketId)]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapMarketConfigRow(result.rows[0]);
}

export async function listMarketConfigs(
  client: DbClient,
  params: {
    limit?: number;
    after?: {
      updatedAt: Date;
      outcomeToken: MarketConfig["outcomeToken"];
      marketId: MarketConfig["marketId"];
    };
  } = {}
): Promise<MarketConfig[]> {
  const result = await client.query<MarketConfigRow>(
    `
      SELECT
        outcome_token,
        market_id,
        clob_enabled,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        min_order_outcome_amount,
        max_order_outcome_amount,
        created_at,
        updated_at
      FROM market_configs
      WHERE (
        $2::timestamptz IS NULL
        OR updated_at < $2
        OR (
          updated_at = $2
          AND (
            outcome_token > $3
            OR (
              outcome_token = $3
              AND market_id > $4
            )
          )
        )
      )
      ORDER BY updated_at DESC, outcome_token ASC, market_id ASC
      LIMIT $1
    `,
    [
      params.limit ?? 100,
      params.after?.updatedAt ?? null,
      params.after === undefined ? null : hexToBuffer(params.after.outcomeToken),
      params.after === undefined ? null : hexToBuffer(params.after.marketId),
    ]
  );

  return result.rows.map(mapMarketConfigRow);
}

export async function upsertMarketConfig(
  client: DbClient,
  input: UpsertMarketConfigInput
): Promise<MarketConfig> {
  const result = await client.query<MarketConfigRow>(
    `
      INSERT INTO market_configs (
        outcome_token,
        market_id,
        clob_enabled,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        min_order_outcome_amount,
        max_order_outcome_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (outcome_token, market_id)
      DO UPDATE SET
        clob_enabled = EXCLUDED.clob_enabled,
        default_tick_units = EXCLUDED.default_tick_units,
        edge_tick_units = EXCLUDED.edge_tick_units,
        lower_edge_price_units = EXCLUDED.lower_edge_price_units,
        upper_edge_price_units = EXCLUDED.upper_edge_price_units,
        min_order_outcome_amount = EXCLUDED.min_order_outcome_amount,
        max_order_outcome_amount = EXCLUDED.max_order_outcome_amount,
        updated_at = now()
      RETURNING
        outcome_token,
        market_id,
        clob_enabled,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        min_order_outcome_amount,
        max_order_outcome_amount,
        created_at,
        updated_at
    `,
    [
      hexToBuffer(input.outcomeToken),
      hexToBuffer(input.marketId),
      input.clobEnabled,
      input.defaultTickUnits,
      input.edgeTickUnits,
      input.lowerEdgePriceUnits,
      input.upperEdgePriceUnits,
      input.minOrderOutcomeAmount,
      input.maxOrderOutcomeAmount,
    ]
  );

  const config = mapMarketConfigRow(result.rows[0]);
  await insertMarketConfigEvent(client, {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    eventType: "TICK_SIZE_CHANGE",
    defaultTickUnits: config.defaultTickUnits,
    edgeTickUnits: config.edgeTickUnits,
    lowerEdgePriceUnits: config.lowerEdgePriceUnits,
    upperEdgePriceUnits: config.upperEdgePriceUnits,
  });

  return config;
}

export async function updateMarketTickConfig(
  client: DbClient,
  input: Pick<
    MarketConfig,
    | "outcomeToken"
    | "marketId"
    | "defaultTickUnits"
    | "edgeTickUnits"
    | "lowerEdgePriceUnits"
    | "upperEdgePriceUnits"
  >
): Promise<MarketConfig | null> {
  const result = await client.query<MarketConfigRow>(
    `
      UPDATE market_configs
      SET
        default_tick_units = $3,
        edge_tick_units = $4,
        lower_edge_price_units = $5,
        upper_edge_price_units = $6,
        updated_at = now()
      WHERE outcome_token = $1
        AND market_id = $2
      RETURNING
        outcome_token,
        market_id,
        clob_enabled,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        min_order_outcome_amount,
        max_order_outcome_amount,
        created_at,
        updated_at
    `,
    [
      hexToBuffer(input.outcomeToken),
      hexToBuffer(input.marketId),
      input.defaultTickUnits,
      input.edgeTickUnits,
      input.lowerEdgePriceUnits,
      input.upperEdgePriceUnits,
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const config = mapMarketConfigRow(result.rows[0]);
  await insertMarketConfigEvent(client, {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    eventType: "TICK_SIZE_CHANGE",
    defaultTickUnits: config.defaultTickUnits,
    edgeTickUnits: config.edgeTickUnits,
    lowerEdgePriceUnits: config.lowerEdgePriceUnits,
    upperEdgePriceUnits: config.upperEdgePriceUnits,
  });

  return config;
}

export async function closeMarketConfig(
  client: DbClient,
  outcomeToken: MarketConfig["outcomeToken"],
  marketId: MarketConfig["marketId"]
): Promise<MarketConfig | null> {
  return setMarketClobEnabled(client, outcomeToken, marketId, false);
}

export async function openMarketConfig(
  client: DbClient,
  outcomeToken: MarketConfig["outcomeToken"],
  marketId: MarketConfig["marketId"]
): Promise<MarketConfig | null> {
  return setMarketClobEnabled(client, outcomeToken, marketId, true);
}

async function setMarketClobEnabled(
  client: DbClient,
  outcomeToken: MarketConfig["outcomeToken"],
  marketId: MarketConfig["marketId"],
  clobEnabled: boolean
): Promise<MarketConfig | null> {
  const result = await client.query<MarketConfigRow>(
    `
      UPDATE market_configs
      SET
        clob_enabled = $3,
        updated_at = now()
      WHERE outcome_token = $1
        AND market_id = $2
        AND clob_enabled <> $3
      RETURNING
        outcome_token,
        market_id,
        clob_enabled,
        default_tick_units,
        edge_tick_units,
        lower_edge_price_units,
        upper_edge_price_units,
        min_order_outcome_amount,
        max_order_outcome_amount,
        created_at,
        updated_at
    `,
    [hexToBuffer(outcomeToken), hexToBuffer(marketId), clobEnabled]
  );

  if (result.rowCount === 0) {
    return getMarketConfig(client, outcomeToken, marketId);
  }

  const config = mapMarketConfigRow(result.rows[0]);
  await insertMarketConfigEvent(client, {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    eventType: clobEnabled ? "MARKET_OPENED" : "MARKET_CLOSED",
  });

  return config;
}
