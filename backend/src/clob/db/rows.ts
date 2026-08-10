import type {
  AssetType,
  ClobOrder,
  MarketConfig,
  OrderSide,
  OrderStatus,
  Outcome,
  Reservation,
  SettlementAttempt,
  SettlementErrorCode,
  SettlementAttemptStatus,
  TimeInForce,
  Trade,
  TradeFill,
  TradeStatus,
  MarketConfigEvent,
  LoanSnapshot,
  LoanState,
} from "../types.js";
import { bufferToHex } from "./hex.js";

export type OrderRow = {
  order_hash: Buffer;
  maker: Buffer;
  outcome_token: Buffer;
  market_id: Buffer;
  outcome: number;
  side: number;
  outcome_amount: string;
  usdc_amount: string;
  expiration: Date;
  nonce: string;
  signature: Buffer;
  time_in_force: TimeInForce;
  remaining_outcome_amount: string;
  pending_matched_outcome_amount: string;
  status: OrderStatus;
  accepted_sequence: string;
  created_at: Date;
  updated_at: Date;
};

export type ReservationRow = {
  maker: Buffer;
  asset_type: AssetType;
  asset_address: Buffer;
  token_id: string;
  reserved_amount: string;
  updated_at: Date;
};

export type TradeRow = {
  trade_id: string;
  taker_order_hash: Buffer;
  outcome_token: Buffer;
  market_id: Buffer;
  outcome: number;
  total_outcome_amount: string;
  total_usdc_amount: string;
  status: TradeStatus;
  tx_hash: Buffer | null;
  submitted_at: Date | null;
  mined_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type TradeFillRow = {
  trade_fill_id: string;
  trade_id: string;
  taker_order_hash: Buffer;
  maker_order_hash: Buffer;
  maker_fill_amount: string;
  maker_usdc_amount: string;
  maker_price_numerator: string;
  maker_price_denominator: string;
  created_at: Date;
};

export type SettlementAttemptRow = {
  settlement_attempt_id: string;
  trade_id: string;
  operator: Buffer;
  tx_hash: Buffer | null;
  status: SettlementAttemptStatus;
  error_code: string | null;
  error_message: string | null;
  submitted_at: Date | null;
  mined_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type MarketConfigRow = {
  outcome_token: Buffer;
  market_id: Buffer;
  clob_enabled: boolean;
  default_tick_units: string;
  edge_tick_units: string;
  lower_edge_price_units: string;
  upper_edge_price_units: string;
  min_order_outcome_amount: string | null;
  max_order_outcome_amount: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MarketConfigEventRow = {
  market_config_event_id: string;
  outcome_token: Buffer;
  market_id: Buffer;
  event_type: MarketConfigEvent["eventType"];
  default_tick_units: string | null;
  edge_tick_units: string | null;
  lower_edge_price_units: string | null;
  upper_edge_price_units: string | null;
  created_at: Date;
  processed_at: Date | null;
};

export type LoanSnapshotRow = {
  loan_position_token: Buffer;
  loan_id: string;
  borrower: Buffer;
  principal: string;
  repayment_amount: string;
  loan_withdraw_freeze_deadline: string;
  activation_deadline: string;
  repayment_deadline: string;
  funded_amount: string;
  credited_amount: string;
  repayment_satisfied_at: string;
  fee_claimed_amount: string;
  state: LoanState;
  interest_bps: string;
  fee_bps: string;
  fee_recipient: Buffer;
  collateral_bps: string;
  borrower_collateral_amount: string;
  borrower_collateral_deposited_amount: string;
  market_id: Buffer;
  synced_at: Date;
  updated_at: Date;
};

export function mapOrderRow(row: OrderRow): ClobOrder {
  return {
    orderHash: bufferToHex(row.order_hash),
    maker: bufferToHex(row.maker),
    outcomeToken: bufferToHex(row.outcome_token),
    marketId: bufferToHex(row.market_id),
    outcome: mapOutcome(row.outcome),
    side: mapSide(row.side),
    outcomeAmount: BigInt(row.outcome_amount),
    usdcAmount: BigInt(row.usdc_amount),
    expiration: row.expiration,
    nonce: BigInt(row.nonce),
    signature: bufferToHex(row.signature),
    timeInForce: row.time_in_force,
    remainingOutcomeAmount: BigInt(row.remaining_outcome_amount),
    pendingMatchedOutcomeAmount: BigInt(row.pending_matched_outcome_amount),
    status: row.status,
    acceptedSequence: BigInt(row.accepted_sequence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapReservationRow(row: ReservationRow): Reservation {
  return {
    maker: bufferToHex(row.maker),
    assetType: row.asset_type,
    assetAddress: bufferToHex(row.asset_address),
    tokenId: BigInt(row.token_id),
    reservedAmount: BigInt(row.reserved_amount),
    updatedAt: row.updated_at,
  };
}

export function mapTradeRow(row: TradeRow): Trade {
  return {
    tradeId: BigInt(row.trade_id),
    takerOrderHash: bufferToHex(row.taker_order_hash),
    outcomeToken: bufferToHex(row.outcome_token),
    marketId: bufferToHex(row.market_id),
    outcome: mapOutcome(row.outcome),
    totalOutcomeAmount: BigInt(row.total_outcome_amount),
    totalUsdcAmount: BigInt(row.total_usdc_amount),
    status: row.status,
    txHash: row.tx_hash === null ? null : bufferToHex(row.tx_hash),
    submittedAt: row.submitted_at,
    minedAt: row.mined_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTradeFillRow(row: TradeFillRow): TradeFill {
  return {
    tradeFillId: BigInt(row.trade_fill_id),
    tradeId: BigInt(row.trade_id),
    takerOrderHash: bufferToHex(row.taker_order_hash),
    makerOrderHash: bufferToHex(row.maker_order_hash),
    makerFillAmount: BigInt(row.maker_fill_amount),
    makerUsdcAmount: BigInt(row.maker_usdc_amount),
    makerPriceNumerator: BigInt(row.maker_price_numerator),
    makerPriceDenominator: BigInt(row.maker_price_denominator),
    createdAt: row.created_at,
  };
}

export function mapSettlementAttemptRow(row: SettlementAttemptRow): SettlementAttempt {
  return {
    settlementAttemptId: BigInt(row.settlement_attempt_id),
    tradeId: BigInt(row.trade_id),
    operator: bufferToHex(row.operator),
    txHash: row.tx_hash === null ? null : bufferToHex(row.tx_hash),
    status: row.status,
    errorCode: mapSettlementErrorCode(row.error_code),
    errorMessage: row.error_message,
    submittedAt: row.submitted_at,
    minedAt: row.mined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMarketConfigRow(row: MarketConfigRow): MarketConfig {
  return {
    outcomeToken: bufferToHex(row.outcome_token),
    marketId: bufferToHex(row.market_id),
    clobEnabled: row.clob_enabled,
    defaultTickUnits: BigInt(row.default_tick_units),
    edgeTickUnits: BigInt(row.edge_tick_units),
    lowerEdgePriceUnits: BigInt(row.lower_edge_price_units),
    upperEdgePriceUnits: BigInt(row.upper_edge_price_units),
    minOrderOutcomeAmount:
      row.min_order_outcome_amount === null ? null : BigInt(row.min_order_outcome_amount),
    maxOrderOutcomeAmount:
      row.max_order_outcome_amount === null ? null : BigInt(row.max_order_outcome_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMarketConfigEventRow(row: MarketConfigEventRow): MarketConfigEvent {
  return {
    marketConfigEventId: BigInt(row.market_config_event_id),
    outcomeToken: bufferToHex(row.outcome_token),
    marketId: bufferToHex(row.market_id),
    eventType: row.event_type,
    defaultTickUnits: row.default_tick_units === null ? null : BigInt(row.default_tick_units),
    edgeTickUnits: row.edge_tick_units === null ? null : BigInt(row.edge_tick_units),
    lowerEdgePriceUnits:
      row.lower_edge_price_units === null ? null : BigInt(row.lower_edge_price_units),
    upperEdgePriceUnits:
      row.upper_edge_price_units === null ? null : BigInt(row.upper_edge_price_units),
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export function mapLoanSnapshotRow(row: LoanSnapshotRow): LoanSnapshot {
  return {
    loanPositionToken: bufferToHex(row.loan_position_token),
    loanId: BigInt(row.loan_id),
    borrower: bufferToHex(row.borrower),
    principal: BigInt(row.principal),
    repaymentAmount: BigInt(row.repayment_amount),
    loanWithdrawFreezeDeadline: BigInt(row.loan_withdraw_freeze_deadline),
    activationDeadline: BigInt(row.activation_deadline),
    repaymentDeadline: BigInt(row.repayment_deadline),
    fundedAmount: BigInt(row.funded_amount),
    creditedAmount: BigInt(row.credited_amount),
    repaymentSatisfiedAt: BigInt(row.repayment_satisfied_at),
    feeClaimedAmount: BigInt(row.fee_claimed_amount),
    state: row.state,
    interestBps: BigInt(row.interest_bps),
    feeBps: BigInt(row.fee_bps),
    feeRecipient: bufferToHex(row.fee_recipient),
    collateralBps: BigInt(row.collateral_bps),
    borrowerCollateralAmount: BigInt(row.borrower_collateral_amount),
    borrowerCollateralDepositedAmount: BigInt(row.borrower_collateral_deposited_amount),
    marketId: bufferToHex(row.market_id),
    syncedAt: row.synced_at,
    updatedAt: row.updated_at,
  };
}

function mapOutcome(value: number): Outcome {
  if (value === 0) {
    return "YES";
  }

  if (value === 1) {
    return "NO";
  }

  throw new Error(`Unknown outcome value: ${value}`);
}

function mapSide(value: number): OrderSide {
  if (value === 0) {
    return "BUY";
  }

  if (value === 1) {
    return "SELL";
  }

  throw new Error(`Unknown order side value: ${value}`);
}

function mapSettlementErrorCode(value: string | null): SettlementErrorCode | null {
  if (value === null) {
    return null;
  }

  if (
    value === "STALE_ORDER" ||
    value === "MARKET_CLOSED" ||
    value === "INSUFFICIENT_BALANCE_OR_ALLOWANCE" ||
    value === "ORDER_EXPIRED" ||
    value === "ORDER_OVERFILLED" ||
    value === "INFRASTRUCTURE_ERROR" ||
    value === "UNKNOWN_REVERT"
  ) {
    return value;
  }

  throw new Error(`Unknown settlement error code: ${value}`);
}
