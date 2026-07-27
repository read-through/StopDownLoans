import { ClobError } from "./errors.js";
import { assertValidTick, calculateBuyReservation, deriveUsdcAmount } from "./orderMath.js";
import {
  assertValidOrderSignature,
  hashContractOrder,
  type OutcomeExchangeDomain,
} from "./orderSigning.js";
import type { ClobOrder, Hex, MarketConfig, Reservation, SubmitOrderInput } from "./types.js";

export type AdmissionChainReader = {
  isOutcomeMarketActive(outcomeToken: Hex, marketId: Hex): Promise<boolean>;
  getOutcomeTokenId(outcomeToken: Hex, marketId: Hex, outcome: SubmitOrderInput["order"]["outcome"]): Promise<bigint>;
  getFilledAmount(orderHash: Hex): Promise<bigint>;
  getErc20Balance(token: Hex, account: Hex): Promise<bigint>;
  getErc20Allowance(token: Hex, owner: Hex, spender: Hex): Promise<bigint>;
  getErc1155Balance(token: Hex, account: Hex, tokenId: bigint): Promise<bigint>;
  isErc1155ApprovedForAll(token: Hex, account: Hex, operator: Hex): Promise<boolean>;
};

export type AdmissionStore = {
  getExistingOrder(orderHash: Hex): Promise<ClobOrder | null>;
  getMarketConfig(outcomeToken: Hex, marketId: Hex): Promise<MarketConfig | null>;
  getReservation(key: AdmissionReservationKey): Promise<Reservation | null>;
};

export type AdmissionReservationKey = {
  maker: Hex;
  assetType: "ERC20" | "ERC1155";
  assetAddress: Hex;
  tokenId: bigint;
};

export type ValidateOrderAdmissionInput = {
  submit: SubmitOrderInput;
  domain: OutcomeExchangeDomain;
  usdc: Hex;
  outcomeExchange: Hex;
  now: Date;
  store: AdmissionStore;
  chain: AdmissionChainReader;
};

export type OrderAdmission = {
  orderHash: Hex;
  marketConfig: MarketConfig;
  reservationKey: AdmissionReservationKey;
  reservationAmount: bigint;
};

export async function validateOrderAdmission(
  input: ValidateOrderAdmissionInput
): Promise<OrderAdmission> {
  const { submit, domain, usdc, outcomeExchange, now, store, chain } = input;
  const { order } = submit;

  await assertValidOrderSignature(order, submit.signature, domain);
  assertOrderAmounts(submit);

  const orderHash = hashContractOrder(order);

  if (await store.getExistingOrder(orderHash)) {
    throw new ClobError("DUPLICATE_ORDER", "Order already exists.");
  }

  if (now.getTime() > order.expiration.getTime()) {
    throw new ClobError("ORDER_EXPIRED", "Order expiration has passed.");
  }

  const marketConfig = await store.getMarketConfig(order.outcomeToken, order.marketId);
  if (marketConfig === null) {
    throw new ClobError("MARKET_NOT_ACTIVE", "Market config does not exist.");
  }

  if (!marketConfig.clobEnabled) {
    throw new ClobError("CLOB_DISABLED", "CLOB is disabled for this market.");
  }

  assertValidTick(submit.priceUnits, marketConfig);
  assertOrderSizeWithinConfig(order.outcomeAmount, marketConfig);

  if (!(await chain.isOutcomeMarketActive(order.outcomeToken, order.marketId))) {
    throw new ClobError("MARKET_NOT_ACTIVE", "Outcome market is not active.");
  }

  if ((await chain.getFilledAmount(orderHash)) > 0n) {
    throw new ClobError("DUPLICATE_ORDER", "Order already has on-chain fill state.");
  }

  return order.side === "BUY"
    ? await validateBuyOrder(input, orderHash, marketConfig)
    : await validateSellOrder(input, orderHash, marketConfig);
}

function assertOrderAmounts(submit: SubmitOrderInput): void {
  const expectedUsdcAmount = deriveUsdcAmount(
    submit.priceUnits,
    submit.order.outcomeAmount
  );

  if (expectedUsdcAmount !== submit.order.usdcAmount) {
    throw new ClobError("INVALID_ORDER", "Signed usdcAmount does not match priceUnits.");
  }
}

function assertOrderSizeWithinConfig(outcomeAmount: bigint, config: MarketConfig): void {
  if (config.minOrderOutcomeAmount !== null && outcomeAmount < config.minOrderOutcomeAmount) {
    throw new ClobError("INVALID_ORDER", "Order outcome amount is below market minimum.");
  }

  if (config.maxOrderOutcomeAmount !== null && outcomeAmount > config.maxOrderOutcomeAmount) {
    throw new ClobError("INVALID_ORDER", "Order outcome amount is above market maximum.");
  }
}

async function validateBuyOrder(
  input: ValidateOrderAdmissionInput,
  orderHash: Hex,
  marketConfig: MarketConfig
): Promise<OrderAdmission> {
  const { submit, usdc, outcomeExchange, store, chain } = input;
  const { order } = submit;
  const reservationKey: AdmissionReservationKey = {
    maker: order.maker,
    assetType: "ERC20",
    assetAddress: usdc,
    tokenId: 0n,
  };
  const reservationAmount = calculateBuyReservation(
    order.usdcAmount,
    order.outcomeAmount,
    order.outcomeAmount
  );

  const [balance, allowance, reservation] = await Promise.all([
    chain.getErc20Balance(usdc, order.maker),
    chain.getErc20Allowance(usdc, order.maker, outcomeExchange),
    store.getReservation(reservationKey),
  ]);
  const available = minBigint(balance, allowance) - (reservation?.reservedAmount ?? 0n);

  if (available < reservationAmount) {
    throw new ClobError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      "Maker does not have enough available USDC balance or allowance."
    );
  }

  return { orderHash, marketConfig, reservationKey, reservationAmount };
}

async function validateSellOrder(
  input: ValidateOrderAdmissionInput,
  orderHash: Hex,
  marketConfig: MarketConfig
): Promise<OrderAdmission> {
  const { submit, outcomeExchange, store, chain } = input;
  const { order } = submit;
  const tokenId = await chain.getOutcomeTokenId(order.outcomeToken, order.marketId, order.outcome);
  const reservationKey: AdmissionReservationKey = {
    maker: order.maker,
    assetType: "ERC1155",
    assetAddress: order.outcomeToken,
    tokenId,
  };
  const reservationAmount = order.outcomeAmount;

  const [balance, approved, reservation] = await Promise.all([
    chain.getErc1155Balance(order.outcomeToken, order.maker, tokenId),
    chain.isErc1155ApprovedForAll(order.outcomeToken, order.maker, outcomeExchange),
    store.getReservation(reservationKey),
  ]);

  if (!approved) {
    throw new ClobError(
      "INSUFFICIENT_BALANCE_OR_ALLOWANCE",
      "Outcome token is not approved for the exchange."
    );
  }

  const available = balance - (reservation?.reservedAmount ?? 0n);

  if (available < reservationAmount) {
    throw new ClobError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      "Maker does not have enough available outcome token balance."
    );
  }

  return { orderHash, marketConfig, reservationKey, reservationAmount };
}

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
