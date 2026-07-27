import type { PublicClient } from "viem";
import { getErc1155Balance, getErc20Allowance, getErc20Balance, getFilledAmount, getOutcomeTokenId, isErc1155ApprovedForAll, isOutcomeMarketActive } from "./chain/contracts.js";
import { withTransaction, type DbClient } from "./db/client.js";
import { getMarketConfig } from "./db/marketConfigs.js";
import { cancelOrderAvailableRemainder, getMakerCandidatesForTaker, getOrderByHash, increaseOrderPending, insertOrder } from "./db/orders.js";
import { decreaseReservation, getReservation, increaseReservation } from "./db/reservations.js";
import { createTradeWithFills, type CreatedTradeWithFills } from "./db/trades.js";
import { matchTakerOrder } from "./matching.js";
import type { OutcomeExchangeDomain } from "./orderSigning.js";
import { calculateAvailableRemainderReservationRelease } from "./reservationAccounting.js";
import type { ClobOrder, Hex, SubmitOrderInput } from "./types.js";
import { validateOrderAdmission, type OrderAdmission } from "./admission.js";

export type SubmitOrderServiceInput = {
  submit: SubmitOrderInput;
  domain: OutcomeExchangeDomain;
  usdc: Hex;
  outcomeExchange: Hex;
  now: Date;
  publicClient: PublicClient;
};

export type SubmitOrderServiceResult = {
  order: ClobOrder;
  reservationAmount: bigint;
};

export type SubmitOrderAndMatchResult = SubmitOrderServiceResult & {
  trade: CreatedTradeWithFills | null;
};

export async function submitOrderWithoutMatching(
  input: SubmitOrderServiceInput
): Promise<SubmitOrderServiceResult> {
  return withTransaction((client) => submitOrderWithoutMatchingTx(client, input));
}

export async function submitOrderAndMatch(
  input: SubmitOrderServiceInput
): Promise<SubmitOrderAndMatchResult> {
  return withTransaction((client) => submitOrderAndMatchTx(client, input));
}

export async function submitOrderWithoutMatchingTx(
  client: DbClient,
  input: SubmitOrderServiceInput
): Promise<SubmitOrderServiceResult> {
  const admission = await validateAdmission(client, input);
  const order = await persistAcceptedOrder(client, input, admission);

  return {
    order,
    reservationAmount: admission.reservationAmount,
  };
}

export async function submitOrderAndMatchTx(
  client: DbClient,
  input: SubmitOrderServiceInput
): Promise<SubmitOrderAndMatchResult> {
  const admission = await validateAdmission(client, input);
  const order = await persistAcceptedOrder(client, input, admission);
  const makerCandidates = await getMakerCandidatesForTaker(client, order);
  const match = matchTakerOrder(order, makerCandidates);

  if (match.fills.length === 0) {
    const finalOrder =
      input.submit.timeInForce === "FAK"
        ? await cancelTakerAvailableRemainder(client, order, admission)
        : order;

    return {
      order: finalOrder,
      reservationAmount: admission.reservationAmount,
      trade: null,
    };
  }

  const pendingTakerOrder = await increaseOrderPending(client, order.orderHash, match.filledOutcomeAmount);

  for (const fill of match.fills) {
    await increaseOrderPending(client, fill.makerOrderHash, fill.makerFillAmount);
  }

  const trade = await createTradeWithFills(client, {
    takerOrderHash: order.orderHash,
    outcomeToken: order.outcomeToken,
    marketId: order.marketId,
    outcome: order.outcome,
    totalOutcomeAmount: match.filledOutcomeAmount,
    totalUsdcAmount: match.totalUsdcAmount,
    fills: match.fills,
  });
  const finalOrder =
    input.submit.timeInForce === "FAK"
      ? await cancelTakerAvailableRemainder(client, pendingTakerOrder, admission)
      : pendingTakerOrder;

  return {
    order: finalOrder,
    reservationAmount: admission.reservationAmount,
    trade,
  };
}

async function validateAdmission(
  client: DbClient,
  input: SubmitOrderServiceInput
): Promise<OrderAdmission> {
  return validateOrderAdmission({
    submit: input.submit,
    domain: input.domain,
    usdc: input.usdc,
    outcomeExchange: input.outcomeExchange,
    now: input.now,
    store: {
      getExistingOrder: (orderHash) => getOrderByHash(client, orderHash),
      getMarketConfig: (outcomeToken, marketId) =>
        getMarketConfig(client, outcomeToken, marketId),
      getReservation: (key) => getReservation(client, key),
    },
    chain: {
      isOutcomeMarketActive: (outcomeToken, marketId) =>
        isOutcomeMarketActive(input.publicClient, outcomeToken, marketId),
      getOutcomeTokenId: (outcomeToken, marketId, outcome) =>
        getOutcomeTokenId(input.publicClient, outcomeToken, marketId, outcome),
      getFilledAmount: (orderHash) =>
        getFilledAmount(input.publicClient, input.outcomeExchange, orderHash),
      getErc20Balance: (token, account) =>
        getErc20Balance(input.publicClient, token, account),
      getErc20Allowance: (token, owner, spender) =>
        getErc20Allowance(input.publicClient, token, owner, spender),
      getErc1155Balance: (token, account, tokenId) =>
        getErc1155Balance(input.publicClient, token, account, tokenId),
      isErc1155ApprovedForAll: (token, account, operator) =>
        isErc1155ApprovedForAll(input.publicClient, token, account, operator),
    },
  });
}

async function persistAcceptedOrder(
  client: DbClient,
  input: SubmitOrderServiceInput,
  admission: OrderAdmission
): Promise<ClobOrder> {
  const order = await insertOrder(client, {
    ...input.submit,
    orderHash: admission.orderHash,
  });
  await increaseReservation(client, admission.reservationKey, admission.reservationAmount);

  return order;
}

async function cancelTakerAvailableRemainder(
  client: DbClient,
  order: ClobOrder,
  admission: OrderAdmission
): Promise<ClobOrder> {
  const reservationReleaseAmount = calculateAvailableRemainderReservationRelease(order);

  if (reservationReleaseAmount > 0n) {
    await decreaseReservation(client, admission.reservationKey, reservationReleaseAmount);
  }

  return cancelOrderAvailableRemainder(client, order.orderHash);
}
