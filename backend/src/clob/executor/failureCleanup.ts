import { getOutcomeTokenId } from "../chain/contracts.js";
import { withTransaction, type DbClient } from "../db/client.js";
import { releaseOrderPending } from "../db/orders.js";
import { decreaseReservation } from "../db/reservations.js";
import { markTradeFailed } from "../db/trades.js";
import { calculateFailedPendingReservationRelease } from "../reservationAccounting.js";
import { buildOrderReservationKey } from "../reservationKeys.js";
import type { ClobOrder, Hex, Trade } from "../types.js";
import { loadTradeExecutionBundle } from "./tradeBundle.js";
import type { PublicClient } from "viem";

export type FinalizeFailedTradeInput = {
  publicClient: PublicClient;
  tradeId: bigint;
  usdc: Hex;
};

export type FinalizeFailedTradeResult = {
  trade: Trade;
  affectedOrders: ClobOrder[];
};

export async function finalizeFailedTrade(
  input: FinalizeFailedTradeInput
): Promise<FinalizeFailedTradeResult> {
  return withTransaction((client) => finalizeFailedTradeTx(client, input));
}

export async function finalizeFailedTradeTx(
  client: DbClient,
  input: FinalizeFailedTradeInput
): Promise<FinalizeFailedTradeResult> {
  const bundle = await loadTradeExecutionBundle(client, input.tradeId);
  if (
    bundle.trade.status !== "MATCHED" &&
    bundle.trade.status !== "EXECUTING" &&
    bundle.trade.status !== "RETRYING"
  ) {
    throw new Error(`Trade is not eligible for failed cleanup: ${input.tradeId.toString()}`);
  }

  const affectedOrders: ClobOrder[] = [];

  affectedOrders.push(
    await releasePendingAndMaybeReservation(client, {
      order: bundle.takerOrder,
      amount: bundle.trade.totalOutcomeAmount,
      usdc: input.usdc,
      publicClient: input.publicClient,
    })
  );

  for (let index = 0; index < bundle.fills.length; index += 1) {
    affectedOrders.push(
      await releasePendingAndMaybeReservation(client, {
        order: bundle.makerOrders[index],
        amount: bundle.fills[index].makerFillAmount,
        usdc: input.usdc,
        publicClient: input.publicClient,
      })
    );
  }

  return {
    trade: await markTradeFailed(client, input.tradeId),
    affectedOrders,
  };
}

async function releasePendingAndMaybeReservation(
  client: DbClient,
  params: {
    order: ClobOrder;
    amount: bigint;
    usdc: Hex;
    publicClient: PublicClient;
  }
): Promise<ClobOrder> {
  if (params.order.status !== "LIVE") {
    const reserveRelease = calculateFailedPendingReservationRelease(params.order, params.amount);
    const outcomeTokenId =
      params.order.side === "SELL"
        ? await getOutcomeTokenId(
            params.publicClient,
            params.order.outcomeToken,
            params.order.marketId,
            params.order.outcome
          )
        : 0n;

    await decreaseReservation(
      client,
      buildOrderReservationKey(params.order, {
        usdc: params.usdc,
        outcomeTokenId,
      }),
      reserveRelease
    );
  }

  return releaseOrderPending(client, params.order.orderHash, params.amount);
}
