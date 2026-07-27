import { getOrderPriceUnits, type L2BookSnapshot, type L2PriceLevel } from "../book.js";
import type { LoanPositionChainView } from "../chain/contracts.js";
import type { CancelOrderServiceResult } from "../orderCancellation.js";
import type { SubmitOrderAndMatchResult } from "../orderSubmission.js";
import {
  getAvailableForMatching,
  isPartiallyFilled,
  type ClobOrder,
  type LoanSnapshot,
  type LoanState,
  type MarketConfig,
  type Reservation,
  type Trade,
} from "../types.js";

export type ApiOrderDto = {
  orderHash: string;
  order: {
    maker: string;
    outcomeToken: string;
    marketId: string;
    outcome: ClobOrder["outcome"];
    side: ClobOrder["side"];
    outcomeAmount: string;
    usdcAmount: string;
    expiration: string;
    nonce: string;
  };
  signature: string;
  timeInForce: ClobOrder["timeInForce"];
  priceUnits: number;
  remainingOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
  availableForMatching: string;
  status: ClobOrder["status"];
  isPartiallyFilled: boolean;
  acceptedSequence: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiPriceLevelDto = {
  priceUnits: number;
  totalRemainingOutcomeAmount: string;
};

export type ApiBookSnapshotDto = {
  outcomeToken: string;
  marketId: string;
  outcome: L2BookSnapshot["key"]["outcome"];
  sequence: string;
  bids: ApiPriceLevelDto[];
  asks: ApiPriceLevelDto[];
  timestamp: string;
};

export type ApiBookDeltaDto = {
  outcomeToken: string;
  marketId: string;
  outcome: L2BookSnapshot["key"]["outcome"];
  sequence: string;
  bids: ApiPriceLevelDto[];
  asks: ApiPriceLevelDto[];
  timestamp: string;
};

export type ApiBestBidAskDto = {
  outcomeToken: string;
  marketId: string;
  outcome: L2BookSnapshot["key"]["outcome"];
  sequence: string;
  bestBid: ApiPriceLevelDto | null;
  bestAsk: ApiPriceLevelDto | null;
  timestamp: string;
};

export type ApiTickSizeChangeDto = {
  outcomeToken: string;
  marketId: string;
  sequence: string;
  defaultTickUnits: string;
  edgeTickUnits: string;
  lowerEdgePriceUnits: string;
  upperEdgePriceUnits: string;
  timestamp: string;
};

export type ApiMarketClosedDto = {
  outcomeToken: string;
  marketId: string;
  sequence: string;
  timestamp: string;
};

export type ApiMarketOpenedDto = ApiMarketClosedDto;

export type ApiMarketConfigDto = {
  outcomeToken: string;
  marketId: string;
  clobEnabled: boolean;
  defaultTickUnits: string;
  edgeTickUnits: string;
  lowerEdgePriceUnits: string;
  upperEdgePriceUnits: string;
  minOrderOutcomeAmount: string | null;
  maxOrderOutcomeAmount: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiMarketSummaryDto = ApiMarketConfigDto & {
  yesBestBid: ApiPriceLevelDto | null;
  yesBestAsk: ApiPriceLevelDto | null;
  confirmedUsdcVolume: string;
  loan: ApiMarketLinkedLoanDto | null;
};

export type ApiMarketLinkedLoanDto = {
  loanId: string;
  borrower: string;
  principal: string;
  repaymentAmount: string;
  state: LoanState;
  activationDeadline: string;
  repaymentDeadline: string;
};

export type ApiHealthDto = {
  status: "ok";
  service: "clob-backend";
  timestamp: string;
  chainId: number;
  contracts: {
    loanPositionToken: string;
    outcomeExchange: string;
    usdc: string;
  };
  executorEnabled: boolean;
  confirmationDepth: string;
  sync: ApiSyncHealthDto;
};

export type ApiSyncHealthDto =
  | {
      status: "ok";
      cursorName: string;
      latestBlock: string;
      safeHeadBlock: string;
      lastIndexedBlock: string | null;
      lagBlocks: string | null;
    }
  | {
      status: "unavailable";
      cursorName: string;
      error: string;
    };

export type ApiLoanDto = {
  loanId: string;
  borrower: string;
  principal: string;
  repaymentAmount: string;
  loanWithdrawFreezeDeadline: string;
  activationDeadline: string;
  repaymentDeadline: string;
  fundedAmount: string;
  creditedAmount: string;
  repaymentSatisfiedAt: string;
  feeClaimedAmount: string;
  state: LoanState;
  interestBps: string;
  feeBps: string;
  feeRecipient: string;
  collateralBps: string;
  borrowerCollateralAmount: string;
  borrowerCollateralDepositedAmount: string;
  marketId: string;
};

export type ApiLoanPositionDto = {
  positionId: string;
  loanId: string;
  principalAmount: string;
  claimedAmount: string;
  claimableAmount: string;
  balance: string;
  split: boolean;
};

export type ApiTradeDto = {
  tradeId: string;
  outcomeToken: string;
  marketId: string;
  outcome: Trade["outcome"];
  totalOutcomeAmount: string;
  totalUsdcAmount: string;
  status: Trade["status"];
  txHash: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type ApiReservationDto = {
  assetType: Reservation["assetType"];
  assetAddress: string;
  tokenId: string;
  reservedAmount: string;
  updatedAt: string;
};

export type ApiSubmitOrderResponseDto = {
  orderHash: string;
  status: ClobOrder["status"];
  remainingOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
  availableForMatching: string;
  isPartiallyFilled: boolean;
  priceUnits: number;
  createdTradeIds: string[];
  rested: boolean;
};

export type ApiCancelOrderResponseDto = {
  orderHash: string;
  status: ClobOrder["status"];
  cancelledAvailableOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
};

export function toApiOrderDto(order: ClobOrder): ApiOrderDto {
  return {
    orderHash: order.orderHash,
    order: {
      maker: order.maker,
      outcomeToken: order.outcomeToken,
      marketId: order.marketId,
      outcome: order.outcome,
      side: order.side,
      outcomeAmount: order.outcomeAmount.toString(),
      usdcAmount: order.usdcAmount.toString(),
      expiration: order.expiration.toISOString(),
      nonce: order.nonce.toString(),
    },
    signature: order.signature,
    timeInForce: order.timeInForce,
    priceUnits: toSafeApiNumber(getOrderPriceUnits(order), "priceUnits"),
    remainingOutcomeAmount: order.remainingOutcomeAmount.toString(),
    pendingMatchedOutcomeAmount: order.pendingMatchedOutcomeAmount.toString(),
    availableForMatching: getAvailableForMatching(order).toString(),
    status: order.status,
    isPartiallyFilled: isPartiallyFilled(order),
    acceptedSequence: order.acceptedSequence.toString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function toApiLoanPositionDto(position: LoanPositionChainView): ApiLoanPositionDto {
  return {
    positionId: position.positionId.toString(),
    loanId: position.loanId.toString(),
    principalAmount: position.principalAmount.toString(),
    claimedAmount: position.claimedAmount.toString(),
    claimableAmount: position.claimableAmount.toString(),
    balance: position.balance.toString(),
    split: position.split,
  };
}

export function toApiSubmitOrderResponseDto(
  result: SubmitOrderAndMatchResult
): ApiSubmitOrderResponseDto {
  return {
    orderHash: result.order.orderHash,
    status: result.order.status,
    remainingOutcomeAmount: result.order.remainingOutcomeAmount.toString(),
    pendingMatchedOutcomeAmount: result.order.pendingMatchedOutcomeAmount.toString(),
    availableForMatching: getAvailableForMatching(result.order).toString(),
    isPartiallyFilled: isPartiallyFilled(result.order),
    priceUnits: toSafeApiNumber(getOrderPriceUnits(result.order), "priceUnits"),
    createdTradeIds: result.trade === null ? [] : [result.trade.trade.tradeId.toString()],
    rested: result.order.status === "LIVE" && getAvailableForMatching(result.order) > 0n,
  };
}

export function toApiCancelOrderResponseDto(
  result: CancelOrderServiceResult
): ApiCancelOrderResponseDto {
  return {
    orderHash: result.order.orderHash,
    status: result.order.status,
    cancelledAvailableOutcomeAmount: result.cancelledAvailableOutcomeAmount.toString(),
    pendingMatchedOutcomeAmount: result.order.pendingMatchedOutcomeAmount.toString(),
  };
}

export function toApiBookSnapshotDto(
  snapshot: L2BookSnapshot,
  params: {
    sequence: bigint;
    timestamp: Date;
  }
): ApiBookSnapshotDto {
  return {
    outcomeToken: snapshot.key.outcomeToken,
    marketId: snapshot.key.marketId,
    outcome: snapshot.key.outcome,
    sequence: params.sequence.toString(),
    bids: snapshot.bids.map(toApiPriceLevelDto),
    asks: snapshot.asks.map(toApiPriceLevelDto),
    timestamp: params.timestamp.toISOString(),
  };
}

export function toApiBookDeltaDto(
  previous: ApiBookSnapshotDto,
  current: ApiBookSnapshotDto,
  params: {
    sequence: bigint;
    timestamp: Date;
  }
): ApiBookDeltaDto {
  return {
    outcomeToken: current.outcomeToken,
    marketId: current.marketId,
    outcome: current.outcome,
    sequence: params.sequence.toString(),
    bids: diffPriceLevels(previous.bids, current.bids),
    asks: diffPriceLevels(previous.asks, current.asks),
    timestamp: params.timestamp.toISOString(),
  };
}

export function toApiBestBidAskDto(
  snapshot: ApiBookSnapshotDto,
  params: {
    sequence: bigint;
    timestamp: Date;
  }
): ApiBestBidAskDto {
  return {
    outcomeToken: snapshot.outcomeToken,
    marketId: snapshot.marketId,
    outcome: snapshot.outcome,
    sequence: params.sequence.toString(),
    bestBid: snapshot.bids[0] ?? null,
    bestAsk: snapshot.asks[0] ?? null,
    timestamp: params.timestamp.toISOString(),
  };
}

export function toApiTickSizeChangeDto(
  config: Pick<
    MarketConfig,
    | "outcomeToken"
    | "marketId"
    | "defaultTickUnits"
    | "edgeTickUnits"
    | "lowerEdgePriceUnits"
    | "upperEdgePriceUnits"
  >,
  params: {
    sequence: bigint;
    timestamp: Date;
  }
): ApiTickSizeChangeDto {
  return {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    sequence: params.sequence.toString(),
    defaultTickUnits: config.defaultTickUnits.toString(),
    edgeTickUnits: config.edgeTickUnits.toString(),
    lowerEdgePriceUnits: config.lowerEdgePriceUnits.toString(),
    upperEdgePriceUnits: config.upperEdgePriceUnits.toString(),
    timestamp: params.timestamp.toISOString(),
  };
}

export function toApiMarketClosedDto(
  config: Pick<MarketConfig, "outcomeToken" | "marketId">,
  params: {
    sequence: bigint;
    timestamp: Date;
  }
): ApiMarketClosedDto {
  return {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    sequence: params.sequence.toString(),
    timestamp: params.timestamp.toISOString(),
  };
}

export function toApiMarketOpenedDto(
  config: Pick<MarketConfig, "outcomeToken" | "marketId">,
  params: {
    sequence: bigint;
    timestamp: Date;
  }
): ApiMarketOpenedDto {
  return {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    sequence: params.sequence.toString(),
    timestamp: params.timestamp.toISOString(),
  };
}

export function toApiMarketConfigDto(config: MarketConfig): ApiMarketConfigDto {
  return {
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
  };
}

export function toApiMarketSummaryDto(
  config: MarketConfig,
  params: {
    yesBestBid: L2PriceLevel | null;
    yesBestAsk: L2PriceLevel | null;
    confirmedUsdcVolume: bigint;
    loan?: LoanSnapshot | null;
  }
): ApiMarketSummaryDto {
  return {
    ...toApiMarketConfigDto(config),
    yesBestBid: params.yesBestBid === null ? null : toApiPriceLevelDto(params.yesBestBid),
    yesBestAsk: params.yesBestAsk === null ? null : toApiPriceLevelDto(params.yesBestAsk),
    confirmedUsdcVolume: params.confirmedUsdcVolume.toString(),
    loan: params.loan === undefined || params.loan === null ? null : toApiMarketLinkedLoanDto(params.loan),
  };
}

export function toApiLoanDto(loan: LoanSnapshot): ApiLoanDto {
  return {
    loanId: loan.loanId.toString(),
    borrower: loan.borrower,
    principal: loan.principal.toString(),
    repaymentAmount: loan.repaymentAmount.toString(),
    loanWithdrawFreezeDeadline: loan.loanWithdrawFreezeDeadline.toString(),
    activationDeadline: loan.activationDeadline.toString(),
    repaymentDeadline: loan.repaymentDeadline.toString(),
    fundedAmount: loan.fundedAmount.toString(),
    creditedAmount: loan.creditedAmount.toString(),
    repaymentSatisfiedAt: loan.repaymentSatisfiedAt.toString(),
    feeClaimedAmount: loan.feeClaimedAmount.toString(),
    state: loan.state,
    interestBps: loan.interestBps.toString(),
    feeBps: loan.feeBps.toString(),
    feeRecipient: loan.feeRecipient,
    collateralBps: loan.collateralBps.toString(),
    borrowerCollateralAmount: loan.borrowerCollateralAmount.toString(),
    borrowerCollateralDepositedAmount: loan.borrowerCollateralDepositedAmount.toString(),
    marketId: loan.marketId,
  };
}

function toApiMarketLinkedLoanDto(loan: LoanSnapshot): ApiMarketLinkedLoanDto {
  return {
    loanId: loan.loanId.toString(),
    borrower: loan.borrower,
    principal: loan.principal.toString(),
    repaymentAmount: loan.repaymentAmount.toString(),
    state: loan.state,
    activationDeadline: loan.activationDeadline.toString(),
    repaymentDeadline: loan.repaymentDeadline.toString(),
  };
}

export function toApiTradeDto(trade: Trade): ApiTradeDto {
  return {
    tradeId: trade.tradeId.toString(),
    outcomeToken: trade.outcomeToken,
    marketId: trade.marketId,
    outcome: trade.outcome,
    totalOutcomeAmount: trade.totalOutcomeAmount.toString(),
    totalUsdcAmount: trade.totalUsdcAmount.toString(),
    status: trade.status,
    txHash: trade.txHash,
    createdAt: trade.createdAt.toISOString(),
    confirmedAt: trade.confirmedAt?.toISOString() ?? null,
  };
}

export function toApiReservationDto(reservation: Reservation): ApiReservationDto {
  return {
    assetType: reservation.assetType,
    assetAddress: reservation.assetAddress,
    tokenId: reservation.tokenId.toString(),
    reservedAmount: reservation.reservedAmount.toString(),
    updatedAt: reservation.updatedAt.toISOString(),
  };
}

function toApiPriceLevelDto(level: L2PriceLevel): ApiPriceLevelDto {
  return {
    priceUnits: toSafeApiNumber(level.priceUnits, "priceUnits"),
    totalRemainingOutcomeAmount: level.totalRemainingOutcomeAmount.toString(),
  };
}

function diffPriceLevels(
  previous: ApiPriceLevelDto[],
  current: ApiPriceLevelDto[]
): ApiPriceLevelDto[] {
  const previousByPrice = new Map(previous.map((level) => [level.priceUnits, level]));
  const currentByPrice = new Map(current.map((level) => [level.priceUnits, level]));
  const changed: ApiPriceLevelDto[] = [];

  for (const level of current) {
    const previousLevel = previousByPrice.get(level.priceUnits);
    if (
      previousLevel === undefined ||
      previousLevel.totalRemainingOutcomeAmount !== level.totalRemainingOutcomeAmount
    ) {
      changed.push(level);
    }
  }

  for (const level of previous) {
    if (!currentByPrice.has(level.priceUnits)) {
      changed.push({
        priceUnits: level.priceUnits,
        totalRemainingOutcomeAmount: "0",
      });
    }
  }

  return changed;
}

function toSafeApiNumber(value: bigint, fieldName: string): number {
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(`${fieldName} is not a safe JSON number: ${value.toString()}`);
  }

  return asNumber;
}
