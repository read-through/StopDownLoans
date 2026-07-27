import { getOrderByHash } from "../db/orders.js";
import { getTradeById, getTradeFillsByTradeId } from "../db/trades.js";
import type { DbClient } from "../db/client.js";
import type { ClobOrder, Trade, TradeFill } from "../types.js";
import { buildMatchOrdersArgs, type MatchOrdersArgs } from "./calldata.js";

export type TradeExecutionBundle = {
  trade: Trade;
  takerOrder: ClobOrder;
  makerOrders: ClobOrder[];
  fills: TradeFill[];
};

export async function loadTradeExecutionBundle(
  client: DbClient,
  tradeId: bigint
): Promise<TradeExecutionBundle> {
  const trade = await getRequiredTrade(client, tradeId);
  const takerOrder = await getRequiredOrder(client, trade.takerOrderHash);
  const fills = await getTradeFillsByTradeId(client, trade.tradeId);

  if (fills.length === 0) {
    throw new Error(`Trade has no fills: ${tradeId.toString()}`);
  }

  const makerOrders: ClobOrder[] = [];

  for (const fill of fills) {
    makerOrders.push(await getRequiredOrder(client, fill.makerOrderHash));
  }

  return {
    trade,
    takerOrder,
    makerOrders,
    fills,
  };
}

export function buildMatchOrdersArgsFromBundle(bundle: TradeExecutionBundle): MatchOrdersArgs {
  return buildMatchOrdersArgs({
    taker: bundle.takerOrder,
    makers: bundle.makerOrders,
    fills: bundle.fills,
  });
}

async function getRequiredTrade(client: DbClient, tradeId: bigint): Promise<Trade> {
  const trade = await getTradeById(client, tradeId);

  if (trade === null) {
    throw new Error(`Trade not found: ${tradeId.toString()}`);
  }

  return trade;
}

async function getRequiredOrder(
  client: DbClient,
  orderHash: ClobOrder["orderHash"]
): Promise<ClobOrder> {
  const order = await getOrderByHash(client, orderHash);

  if (order === null) {
    throw new Error(`Order not found: ${orderHash}`);
  }

  return order;
}
