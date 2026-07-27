import type { MarketConfig } from "../src/clob/types.js";

export function printMarketConfig(config: MarketConfig): void {
  printJson({
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    clobEnabled: config.clobEnabled,
    defaultTickUnits: config.defaultTickUnits.toString(),
    edgeTickUnits: config.edgeTickUnits.toString(),
    lowerEdgePriceUnits: config.lowerEdgePriceUnits.toString(),
    upperEdgePriceUnits: config.upperEdgePriceUnits.toString(),
    minOrderOutcomeAmount: config.minOrderOutcomeAmount?.toString() ?? null,
    maxOrderOutcomeAmount: config.maxOrderOutcomeAmount?.toString() ?? null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  });
}

export function printMarketConfigStatus(
  config: Pick<MarketConfig, "outcomeToken" | "marketId" | "clobEnabled">
): void {
  printJson({
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    clobEnabled: config.clobEnabled,
  });
}

export function printMarketTickConfig(
  config: Pick<
    MarketConfig,
    | "outcomeToken"
    | "marketId"
    | "defaultTickUnits"
    | "edgeTickUnits"
    | "lowerEdgePriceUnits"
    | "upperEdgePriceUnits"
  >
): void {
  printJson({
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    defaultTickUnits: config.defaultTickUnits.toString(),
    edgeTickUnits: config.edgeTickUnits.toString(),
    lowerEdgePriceUnits: config.lowerEdgePriceUnits.toString(),
    upperEdgePriceUnits: config.upperEdgePriceUnits.toString(),
  });
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
