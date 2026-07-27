import type { WalletBalances } from "../chainReads";
import type { LoanDetail, Outcome, PredictionMarket } from "../types";
import { formatUsdc } from "./format";
import { getMarketTickUnits } from "./mappers";
import { formatUnixDeadline } from "./format";
import { minBigint } from "./mappers";

export function getOrderPreflightError(params: {
  balances: WalletBalances | null;
  market: PredictionMarket;
  outcome: Outcome;
  preview: { priceUnits: bigint; outcomeAmount: bigint; usdcAmount: bigint } | null;
  side: "BUY" | "SELL";
}): string | null {
  const inputError = getOrderInputPreflightError(params.market, params.preview);
  if (inputError !== null) {
    return inputError;
  }

  if (params.preview === null || params.balances === null) {
    return null;
  }

  if (params.side === "BUY") {
    if (params.balances.usdcBalance < params.preview.usdcAmount) {
      return "Insufficient USDC balance.";
    }

    if (
      params.balances.exchangeAllowance !== null &&
      params.balances.exchangeAllowance < params.preview.usdcAmount
    ) {
      return "Increase USDC allowance for the exchange before buying.";
    }

    return null;
  }

  if (params.balances.selectedMarket === null) {
    return "Selected market balances are not loaded.";
  }

  const outcomeBalance =
    params.outcome === "YES"
      ? params.balances.selectedMarket.yesBalance
      : params.balances.selectedMarket.noBalance;

  if (outcomeBalance < params.preview.outcomeAmount) {
    return `Insufficient ${params.outcome} balance.`;
  }

  if (params.balances.outcomeExchangeApproved !== true) {
    return "Approve the outcome exchange before selling.";
  }

  return null;
}

export function getOrderInputPreflightError(
  market: PredictionMarket,
  preview: { priceUnits: bigint; outcomeAmount: bigint; usdcAmount: bigint } | null
): string | null {
  if (market.state !== "Active") {
    return "Orders can be submitted only while the market is active.";
  }

  if (preview === null) {
    return null;
  }

  const tickUnits = getMarketTickUnits(preview.priceUnits, market);
  if (preview.priceUnits % tickUnits !== 0n) {
    return `Price must align to the active tick of ${formatUsdc(tickUnits)}.`;
  }

  if (
    market.minOrderOutcomeAmount !== null &&
    preview.outcomeAmount < BigInt(market.minOrderOutcomeAmount)
  ) {
    return `Order size is below the market minimum of ${formatUsdc(BigInt(market.minOrderOutcomeAmount))}.`;
  }

  if (
    market.maxOrderOutcomeAmount !== null &&
    preview.outcomeAmount > BigInt(market.maxOrderOutcomeAmount)
  ) {
    return `Order size is above the market maximum of ${formatUsdc(BigInt(market.maxOrderOutcomeAmount))}.`;
  }

  return null;
}

export function getExpirationMinutesError(value: string): string | null {
  if (!/^[1-9][0-9]*$/.test(value.trim())) {
    return "Expiration minutes must be a positive integer.";
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return "Expiration minutes is too large.";
  }

  return null;
}

export function getPairDepositPreflightError(params: {
  amount: bigint | null;
  balances: WalletBalances | null;
  market: PredictionMarket;
}): string | null {
  if (params.amount === null || params.balances === null) {
    return null;
  }

  if (params.market.state !== "Proto" && params.market.state !== "Active") {
    return "Pair collateral deposits are available only before resolution.";
  }

  if (params.balances.usdcBalance < params.amount) {
    return "Insufficient USDC balance.";
  }

  if (params.balances.outcomeAllowance !== null && params.balances.outcomeAllowance < params.amount) {
    return "Approve USDC for the outcome token contract before depositing pair collateral.";
  }

  return null;
}

export function getPairMintPreflightError(params: {
  selectedMarket: WalletBalances["selectedMarket"];
  market: PredictionMarket;
}): string | null {
  if (params.market.state !== "Active") {
    return "Pairs can be minted only after market activation.";
  }

  if (params.selectedMarket === null || params.selectedMarket.pairMintable === 0n) {
    return "No deposited pair collateral is mintable.";
  }

  return null;
}

export function getPairWithdrawPreflightError(params: {
  amount: bigint | null;
  selectedMarket: WalletBalances["selectedMarket"];
  market: PredictionMarket;
}): string | null {
  if (params.amount === null) {
    return null;
  }

  if (params.market.state !== "Proto" && params.market.state !== "Active" && params.market.state !== "Resolved") {
    return "Pair collateral cannot be withdrawn in this market state.";
  }

  if (params.selectedMarket === null || params.selectedMarket.unmintedPairDeposit === 0n) {
    return "No unminted pair collateral is available to withdraw.";
  }

  if (params.amount > params.selectedMarket.unmintedPairDeposit) {
    return "Amount exceeds unminted pair collateral.";
  }

  return null;
}

export function getMergePositionsPreflightError(params: {
  amount: bigint | null;
  selectedMarket: WalletBalances["selectedMarket"];
}): string | null {
  if (params.amount === null) {
    return null;
  }

  if (params.selectedMarket === null) {
    return "Selected market balances are not loaded.";
  }

  if (params.selectedMarket.marketState !== "Active") {
    return "YES/NO pairs can be merged only in active markets.";
  }

  const mergeable = minBigint(params.selectedMarket.yesBalance, params.selectedMarket.noBalance);
  if (mergeable === 0n) {
    return "No matched YES/NO pair balance is available to merge.";
  }

  if (params.amount > mergeable) {
    return "Amount exceeds matched YES/NO pair balance.";
  }

  return null;
}

export function getRedeemOutcomePreflightError(params: {
  amount: bigint | null;
  selectedMarket: WalletBalances["selectedMarket"];
}): string | null {
  if (params.amount === null) {
    return null;
  }

  if (params.selectedMarket === null) {
    return "Selected market balances are not loaded.";
  }

  if (params.selectedMarket.marketState !== "Resolved" || params.selectedMarket.winningOutcome === "None") {
    return "Winning outcome can be redeemed only after market resolution.";
  }

  const winnerBalance =
    params.selectedMarket.winningOutcome === "YES"
      ? params.selectedMarket.yesBalance
      : params.selectedMarket.noBalance;
  if (winnerBalance === 0n) {
    return `No ${params.selectedMarket.winningOutcome} balance is available to redeem.`;
  }

  if (params.amount > winnerBalance) {
    return `Amount exceeds ${params.selectedMarket.winningOutcome} balance.`;
  }

  return null;
}

export function getFundingPreflightError(params: {
  amount: bigint | null;
  balances: WalletBalances | null;
  loan: LoanDetail;
}): string | null {
  if (params.amount === null || params.balances === null) {
    return null;
  }

  if (params.loan.state !== "Funding" && params.loan.state !== "Funded") {
    return "Loan is not accepting funding.";
  }

  const remaining = BigInt(params.loan.principalRaw) - BigInt(params.loan.fundedAmountRaw);
  if (params.amount > remaining) {
    return "Amount exceeds remaining loan principal.";
  }

  if (params.balances.usdcBalance < params.amount) {
    return "Insufficient USDC balance.";
  }

  if (params.balances.loanAllowance !== null && params.balances.loanAllowance < params.amount) {
    return "Approve USDC for the loan contract before funding.";
  }

  return null;
}

export function getBorrowerCollateralPreflightError(params: {
  amount: bigint | null;
  balances: WalletBalances | null;
  loan: LoanDetail;
}): string | null {
  if (params.amount === null || params.balances === null) {
    return null;
  }

  if (params.loan.state !== "Funding" && params.loan.state !== "Funded") {
    return "Borrower collateral can be deposited only before activation.";
  }

  const required = BigInt(params.loan.borrowerCollateralAmountRaw);
  const deposited = BigInt(params.loan.borrowerCollateralDepositedAmountRaw);
  const remaining = required > deposited ? required - deposited : 0n;
  if (remaining === 0n) {
    return "Borrower collateral is already fully deposited.";
  }

  if (params.amount > remaining) {
    return "Amount exceeds remaining borrower collateral.";
  }

  if (params.balances.usdcBalance < params.amount) {
    return "Insufficient USDC balance.";
  }

  if (params.balances.outcomeAllowance !== null && params.balances.outcomeAllowance < params.amount) {
    return "Approve USDC for the outcome token contract before depositing collateral.";
  }

  return null;
}

export function getLoanActivationPreflightError(loan: LoanDetail): string | null {
  if (loan.state !== "Funded") {
    return "Loan must be fully funded before activation.";
  }

  if (BigInt(loan.borrowerCollateralDepositedAmountRaw) < BigInt(loan.borrowerCollateralAmountRaw)) {
    return "Borrower collateral must be fully deposited before activation.";
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const freezeDeadline = BigInt(loan.loanWithdrawFreezeDeadlineRaw);
  const activationDeadline = BigInt(loan.activationDeadlineRaw);
  if (now < freezeDeadline) {
    return `Activation opens ${formatUnixDeadline(loan.loanWithdrawFreezeDeadlineRaw)}.`;
  }
  if (now > activationDeadline) {
    return "Activation deadline has passed.";
  }

  return null;
}

export function getLoanPaymentDepositPreflightError(params: {
  amount: bigint | null;
  balances: WalletBalances | null;
  loan: LoanDetail;
}): string | null {
  if (params.amount === null || params.balances === null) {
    return null;
  }

  if (params.loan.state !== "Active" && params.loan.state !== "Repaid" && params.loan.state !== "Defaulted") {
    return "Loan payment deposits are available after activation.";
  }

  if (params.balances.usdcBalance < params.amount) {
    return "Insufficient USDC balance.";
  }

  if (params.balances.loanAllowance !== null && params.balances.loanAllowance < params.amount) {
    return "Approve USDC for the loan contract before depositing payment.";
  }

  return null;
}

export function getSettleRepaidPreflightError(loan: LoanDetail): string | null {
  if (loan.state !== "Active") {
    return "Only active loans can be settled as repaid.";
  }

  if (BigInt(loan.creditedAmountRaw) < BigInt(loan.repaymentAmountRaw)) {
    return "Credited amount is below repayment target.";
  }

  const repaymentSatisfiedAt = BigInt(loan.repaymentSatisfiedAtRaw);
  if (repaymentSatisfiedAt === 0n) {
    return "Repayment target has not been satisfied.";
  }

  if (repaymentSatisfiedAt > BigInt(loan.repaymentDeadlineRaw)) {
    return "Repayment target was satisfied after the deadline.";
  }

  return null;
}

export function getMarkDefaultedPreflightError(loan: LoanDetail): string | null {
  if (loan.state !== "Active") {
    return "Only active loans can be marked defaulted.";
  }

  if (BigInt(Math.floor(Date.now() / 1000)) <= BigInt(loan.repaymentDeadlineRaw)) {
    return "Repayment deadline has not passed.";
  }

  const repaymentSatisfiedAt = BigInt(loan.repaymentSatisfiedAtRaw);
  if (repaymentSatisfiedAt !== 0n && repaymentSatisfiedAt <= BigInt(loan.repaymentDeadlineRaw)) {
    return "Repayment target was satisfied before the deadline.";
  }

  return null;
}

export function getRedeemDefaultCollateralPreflightError(loan: LoanDetail): string | null {
  if (loan.state !== "Defaulted") {
    return "Default collateral can be redeemed only after default settlement.";
  }

  return null;
}
