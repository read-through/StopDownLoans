import type { ApiHealth, ApiLoan, ApiMarketConfig } from "../api";
import { frontendContracts } from "../config";
import type {
  LoanFilter,
  LoanOpportunity,
  LoanDetail,
  LoanState,
  MarketFilter,
  MarketState,
  PredictionMarket,
} from "../types";
import { formatBps, formatPriceUnits, formatQuotePrice, formatUnixDeadline, formatUsdc, shortHex } from "./format";
import type { WalletBalances } from "../chainReads";

export function needsUsdcExchangeApproval(balances: WalletBalances | null, amount: bigint): boolean {
  if (balances?.exchangeAllowance === null || balances?.exchangeAllowance === undefined) {
    return false;
  }

  return balances.exchangeAllowance < amount;
}

export function getMarketTickUnits(priceUnits: bigint, market: PredictionMarket): bigint {
  const lowerEdgePriceUnits = BigInt(market.lowerEdgePriceUnits);
  const upperEdgePriceUnits = BigInt(market.upperEdgePriceUnits);

  if (priceUnits <= lowerEdgePriceUnits || priceUnits >= upperEdgePriceUnits) {
    return BigInt(market.edgeTickUnits);
  }

  return BigInt(market.defaultTickUnits);
}

export function formatOrderSizeBounds(market: PredictionMarket): string {
  const minimum =
    market.minOrderOutcomeAmount === null ? "no min" : `min ${formatUsdc(BigInt(market.minOrderOutcomeAmount))}`;
  const maximum =
    market.maxOrderOutcomeAmount === null ? "no max" : `max ${formatUsdc(BigInt(market.maxOrderOutcomeAmount))}`;

  return `${minimum}, ${maximum}`;
}

export function toLoanOpportunity(loan: ApiLoan, markets: ApiMarketConfig[]): LoanOpportunity {
  const principal = BigInt(loan.principal);
  const fundedAmount = BigInt(loan.fundedAmount);
  const remainingFunding = principal > fundedAmount ? principal - fundedAmount : 0n;
  const fundedPct = principal === 0n ? 0 : Number((fundedAmount * 100n) / principal);
  const marketIndexed = markets.some(
    (market) => market.marketId.toLowerCase() === loan.marketId.toLowerCase()
  );

  return {
    loanId: loan.loanId,
    borrower: shortHex(loan.borrower),
    principal: `${formatUsdc(principal)} USDC`,
    repayment: `${formatUsdc(BigInt(loan.repaymentAmount))} USDC`,
    rate: `${formatBps(BigInt(loan.interestBps))}%`,
    fundedPct: Math.min(fundedPct, 100),
    remainingFunding: `${formatUsdc(remainingFunding)} USDC`,
    marketIndexed,
    nextDeadline: getLoanNextDeadline(loan),
    state: toLoanStateLabel(loan.state),
  };
}

export function getLoanNextDeadline(loan: ApiLoan): string {
  if (loan.state === "FUNDING" || loan.state === "FUNDED") {
    return formatUnixDeadline(loan.activationDeadline);
  }

  if (loan.state === "ACTIVE") {
    return formatUnixDeadline(loan.repaymentDeadline);
  }

  return "-";
}

export function toLoanDetail(loan: ApiLoan): LoanDetail {
  const principal = BigInt(loan.principal);
  const fundedAmount = BigInt(loan.fundedAmount);
  const fundingRemaining = principal > fundedAmount ? principal - fundedAmount : 0n;
  const creditedAmount = BigInt(loan.creditedAmount);
  const repaymentAmount = BigInt(loan.repaymentAmount);
  const repaymentRemaining = repaymentAmount > creditedAmount ? repaymentAmount - creditedAmount : 0n;
  const borrowerCollateralAmount = BigInt(loan.borrowerCollateralAmount);
  const borrowerCollateralDepositedAmount = BigInt(loan.borrowerCollateralDepositedAmount);
  const borrowerCollateralRemaining =
    borrowerCollateralAmount > borrowerCollateralDepositedAmount
      ? borrowerCollateralAmount - borrowerCollateralDepositedAmount
      : 0n;

  return {
    loanId: loan.loanId,
    borrower: loan.borrower,
    principalRaw: loan.principal,
    fundedAmountRaw: loan.fundedAmount,
    repaymentAmountRaw: loan.repaymentAmount,
    creditedAmountRaw: loan.creditedAmount,
    repaymentSatisfiedAtRaw: loan.repaymentSatisfiedAt,
    principal: `${formatUsdc(principal)} USDC`,
    fundedAmount: `${formatUsdc(fundedAmount)} USDC`,
    fundingRemaining: `${formatUsdc(fundingRemaining)} USDC`,
    creditedAmount: `${formatUsdc(creditedAmount)} USDC`,
    repaymentAmount: `${formatUsdc(repaymentAmount)} USDC`,
    repaymentRemaining: `${formatUsdc(repaymentRemaining)} USDC`,
    interestRate: `${formatBps(BigInt(loan.interestBps))}%`,
    feeRate: `${formatBps(BigInt(loan.feeBps))}%`,
    collateralRatio: `${formatBps(BigInt(loan.collateralBps))}%`,
    borrowerCollateralAmountRaw: loan.borrowerCollateralAmount,
    borrowerCollateralDepositedAmountRaw: loan.borrowerCollateralDepositedAmount,
    borrowerCollateralAmount: `${formatUsdc(borrowerCollateralAmount)} USDC`,
    borrowerCollateralDepositedAmount: `${formatUsdc(borrowerCollateralDepositedAmount)} USDC`,
    borrowerCollateralRemaining: `${formatUsdc(borrowerCollateralRemaining)} USDC`,
    loanWithdrawFreezeDeadlineRaw: loan.loanWithdrawFreezeDeadline,
    activationDeadlineRaw: loan.activationDeadline,
    repaymentDeadlineRaw: loan.repaymentDeadline,
    loanWithdrawFreezeDeadline: formatUnixDeadline(loan.loanWithdrawFreezeDeadline),
    activationDeadline: formatUnixDeadline(loan.activationDeadline),
    repaymentDeadline: formatUnixDeadline(loan.repaymentDeadline),
    marketId: loan.marketId,
    fundingPct: percentage(fundedAmount, principal),
    collateralPct: percentage(borrowerCollateralDepositedAmount, borrowerCollateralAmount),
    repaymentPct: percentage(creditedAmount, repaymentAmount),
    state: toLoanStateLabel(loan.state),
  };
}

export function percentage(value: bigint, target: bigint): number {
  if (target === 0n) {
    return 0;
  }

  const pct = Number((value * 100n) / target);
  return Math.min(Math.max(pct, 0), 100);
}

export function toPredictionMarket(config: ApiMarketConfig): PredictionMarket {
  return {
    outcomeToken: config.outcomeToken,
    marketId: config.marketId,
    loan: config.loan,
    outcome:
      config.loan === null
        ? `Standalone market ${shortHex(config.marketId)}`
        : `Loan #${config.loan.loanId} repayment`,
    state: config.loan === null ? (config.clobEnabled ? "Active" : "Proto") : toMarketStateFromLoan(config.loan.state),
    bestBid: formatQuotePrice(config.yesBestBid),
    bestAsk: formatQuotePrice(config.yesBestAsk),
    volume: `${formatUsdc(BigInt(config.confirmedUsdcVolume))} USDC`,
    defaultTickUnits: config.defaultTickUnits,
    edgeTickUnits: config.edgeTickUnits,
    lowerEdgePriceUnits: config.lowerEdgePriceUnits,
    upperEdgePriceUnits: config.upperEdgePriceUnits,
    minOrderOutcomeAmount: config.minOrderOutcomeAmount,
    maxOrderOutcomeAmount: config.maxOrderOutcomeAmount,
  };
}

export function toMarketStateFromLoan(state: ApiLoan["state"]): MarketState {
  if (state === "ACTIVE") return "Active";
  if (state === "CANCELLED") return "Cancelled";
  if (state === "REPAID" || state === "DEFAULTED") return "Resolved";
  return "Proto";
}

export function getMarketKey(outcomeToken: string, marketId: string): string {
  return `${outcomeToken.toLowerCase()}:${marketId.toLowerCase()}`;
}

export function toLoanStateLabel(state: ApiLoan["state"]): LoanState {
  if (state === "FUNDING") return "Funding";
  if (state === "FUNDED") return "Funded";
  if (state === "ACTIVE") return "Active";
  if (state === "CANCELLED") return "Cancelled";
  if (state === "REPAID") return "Repaid";
  return "Defaulted";
}



export function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

export function countLoansForFilter(loans: LoanOpportunity[], filter: LoanFilter): number {
  if (filter === "All") {
    return loans.length;
  }

  return loans.filter((loan) => loan.state === filter).length;
}

export function countMarketsForFilter(markets: PredictionMarket[], filter: MarketFilter): number {
  if (filter === "All") {
    return markets.length;
  }

  return markets.filter((market) => market.state === filter).length;
}

export function getMissingFrontendCoreContracts(expectedContracts: typeof frontendContracts): string[] {
  const requiredContracts = [
    { label: "VITE_LOAN_POSITION_TOKEN_ADDRESS", value: expectedContracts.loanPositionToken },
    { label: "VITE_OUTCOME_EXCHANGE_ADDRESS", value: expectedContracts.outcomeExchange },
    { label: "VITE_USDC_ADDRESS", value: expectedContracts.usdc },
  ];

  return requiredContracts
    .filter((contract) => contract.value === null)
    .map((contract) => contract.label);
}

export function getBackendContractMismatch(
  expectedContracts: typeof frontendContracts,
  health: ApiHealth
): { label: string; frontendValue: string; backendValue: string } | null {
  const checks = [
    {
      label: "LoanPositionToken",
      frontendValue: expectedContracts.loanPositionToken,
      backendValue: health.contracts.loanPositionToken,
    },
    {
      label: "OutcomeExchange",
      frontendValue: expectedContracts.outcomeExchange,
      backendValue: health.contracts.outcomeExchange,
    },
    {
      label: "USDC",
      frontendValue: expectedContracts.usdc,
      backendValue: health.contracts.usdc,
    },
  ];

  for (const check of checks) {
    if (check.frontendValue !== null && check.frontendValue.toLowerCase() !== check.backendValue.toLowerCase()) {
      return {
        label: check.label,
        frontendValue: shortHex(check.frontendValue),
        backendValue: shortHex(check.backendValue),
      };
    }
  }

  return null;
}
