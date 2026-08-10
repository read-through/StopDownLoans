export const PRICE_SCALE = 1_000_000n;

export type Hex = `0x${string}`;

export type Outcome = "YES" | "NO";

export type OrderSide = "BUY" | "SELL";

export type TimeInForce = "GTC" | "FAK";

export type OrderStatus = "LIVE" | "FILLED" | "CANCELLED" | "EXPIRED" | "FAILED";

export type TradeStatus =
  | "MATCHED"
  | "EXECUTING"
  | "SUBMITTED"
  | "MINED"
  | "CONFIRMED"
  | "RETRYING"
  | "FAILED";

export type SettlementAttemptStatus =
  | "CREATED"
  | "SUBMITTED"
  | "MINED"
  | "REVERTED"
  | "DROPPED"
  | "FAILED";

export type SettlementErrorCode =
  | "STALE_ORDER"
  | "MARKET_CLOSED"
  | "INSUFFICIENT_BALANCE_OR_ALLOWANCE"
  | "ORDER_EXPIRED"
  | "ORDER_OVERFILLED"
  | "INFRASTRUCTURE_ERROR"
  | "UNKNOWN_REVERT";

export type ClobErrorCode =
  | "INVALID_SIGNATURE"
  | "INVALID_ORDER"
  | "INVALID_PRICE_TICK"
  | "ROUNDING_NOT_ALLOWED"
  | "DUPLICATE_ORDER"
  | "ORDER_NOT_FOUND"
  | "MARKET_CONFIG_NOT_FOUND"
  | "ORDER_EXPIRED"
  | "ORDER_NOT_CANCELLABLE"
  | "MARKET_NOT_ACTIVE"
  | "INSUFFICIENT_BALANCE_OR_ALLOWANCE"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "CLOB_DISABLED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type AssetType = "ERC20" | "ERC1155";

export type ClobOrder = {
  orderHash: Hex;
  maker: Hex;
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
  side: OrderSide;
  outcomeAmount: bigint;
  usdcAmount: bigint;
  expiration: Date;
  nonce: bigint;
  signature: Hex;
  timeInForce: TimeInForce;
  remainingOutcomeAmount: bigint;
  pendingMatchedOutcomeAmount: bigint;
  status: OrderStatus;
  acceptedSequence: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export type SignedOrderInput = {
  maker: Hex;
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
  side: OrderSide;
  outcomeAmount: bigint;
  usdcAmount: bigint;
  expiration: Date;
  nonce: bigint;
};

export type SubmitOrderInput = {
  order: SignedOrderInput;
  signature: Hex;
  timeInForce: TimeInForce;
  priceUnits: bigint;
};

export type CancelOrderInput = {
  maker: Hex;
  orderHash: Hex;
  expiration: Date;
  nonce: bigint;
};

export type Reservation = {
  maker: Hex;
  assetType: AssetType;
  assetAddress: Hex;
  tokenId: bigint;
  reservedAmount: bigint;
  updatedAt: Date;
};

export type Trade = {
  tradeId: bigint;
  takerOrderHash: Hex;
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
  totalOutcomeAmount: bigint;
  totalUsdcAmount: bigint;
  status: TradeStatus;
  txHash: Hex | null;
  submittedAt: Date | null;
  minedAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TradeFill = {
  tradeFillId: bigint;
  tradeId: bigint;
  takerOrderHash: Hex;
  makerOrderHash: Hex;
  makerFillAmount: bigint;
  makerUsdcAmount: bigint;
  makerPriceNumerator: bigint;
  makerPriceDenominator: bigint;
  createdAt: Date;
};

export type SettlementAttempt = {
  settlementAttemptId: bigint;
  tradeId: bigint;
  operator: Hex;
  txHash: Hex | null;
  status: SettlementAttemptStatus;
  errorCode: SettlementErrorCode | null;
  errorMessage: string | null;
  submittedAt: Date | null;
  minedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MarketConfig = {
  outcomeToken: Hex;
  marketId: Hex;
  clobEnabled: boolean;
  defaultTickUnits: bigint;
  edgeTickUnits: bigint;
  lowerEdgePriceUnits: bigint;
  upperEdgePriceUnits: bigint;
  minOrderOutcomeAmount: bigint | null;
  maxOrderOutcomeAmount: bigint | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MarketConfigEventType = "TICK_SIZE_CHANGE" | "MARKET_OPENED" | "MARKET_CLOSED";

export type MarketConfigEvent = {
  marketConfigEventId: bigint;
  outcomeToken: Hex;
  marketId: Hex;
  eventType: MarketConfigEventType;
  defaultTickUnits: bigint | null;
  edgeTickUnits: bigint | null;
  lowerEdgePriceUnits: bigint | null;
  upperEdgePriceUnits: bigint | null;
  createdAt: Date;
  processedAt: Date | null;
};

export type LoanState = "FUNDING" | "FUNDED" | "ACTIVE" | "CANCELLED" | "REPAID" | "DEFAULTED";

export type LoanSnapshot = {
  loanPositionToken: Hex;
  loanId: bigint;
  borrower: Hex;
  principal: bigint;
  repaymentAmount: bigint;
  loanWithdrawFreezeDeadline: bigint;
  activationDeadline: bigint;
  repaymentDeadline: bigint;
  fundedAmount: bigint;
  creditedAmount: bigint;
  repaymentSatisfiedAt: bigint;
  feeClaimedAmount: bigint;
  state: LoanState;
  interestBps: bigint;
  feeBps: bigint;
  feeRecipient: Hex;
  collateralBps: bigint;
  borrowerCollateralAmount: bigint;
  borrowerCollateralDepositedAmount: bigint;
  marketId: Hex;
  syncedAt: Date;
  updatedAt: Date;
};

export function getAvailableForMatching(order: Pick<ClobOrder, "remainingOutcomeAmount" | "pendingMatchedOutcomeAmount">): bigint {
  return order.remainingOutcomeAmount - order.pendingMatchedOutcomeAmount;
}

export function isPartiallyFilled(order: Pick<ClobOrder, "outcomeAmount" | "remainingOutcomeAmount">): boolean {
  const confirmedFilled = order.outcomeAmount - order.remainingOutcomeAmount;
  return confirmedFilled > 0n && order.remainingOutcomeAmount > 0n;
}
