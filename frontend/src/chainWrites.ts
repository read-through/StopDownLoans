import { toFunctionSelector } from "viem";

import { frontendContracts } from "./config";
import type { EthereumProvider, WalletAccount } from "./wallet";

const SET_APPROVAL_FOR_ALL_SELECTOR = toFunctionSelector("setApprovalForAll(address,bool)");
const ERC20_APPROVE_SELECTOR = toFunctionSelector("approve(address,uint256)");
const ACTIVATE_LOAN_SELECTOR = toFunctionSelector("activate(uint256)");
const CLAIM_POSITION_SELECTOR = toFunctionSelector("claim(uint256)");
const CREATE_LOAN_SELECTOR = toFunctionSelector("createLoan(uint256,uint256,uint256,uint256,uint256,uint256)");
const DEPOSIT_BORROWER_COLLATERAL_SELECTOR = toFunctionSelector("depositBorrowerCollateral(bytes32,uint256)");
const DEPOSIT_PAIR_COLLATERAL_SELECTOR = toFunctionSelector("depositPairCollateral(bytes32,uint256)");
const DEPOSIT_TO_LOAN_SELECTOR = toFunctionSelector("depositToLoan(uint256,uint256)");
const FUND_SELECTOR = toFunctionSelector("fund(uint256,uint256)");
const MARK_DEFAULTED_SELECTOR = toFunctionSelector("markDefaulted(uint256)");
const MERGE_POSITIONS_SELECTOR = toFunctionSelector("mergePositions(bytes32,uint256)");
const MINT_ACTIVATED_PAIR_SELECTOR = toFunctionSelector("mintActivatedPair(bytes32)");
const REDEEM_DEFAULT_COLLATERAL_SELECTOR = toFunctionSelector("redeemDefaultCollateral(uint256)");
const REDEEM_OUTCOME_SELECTOR = toFunctionSelector("redeem(bytes32,uint8,uint256)");
const SETTLE_REPAID_SELECTOR = toFunctionSelector("settleRepaid(uint256)");
const WITHDRAW_PAIR_DEPOSIT_SELECTOR = toFunctionSelector("withdrawPairDeposit(bytes32,uint256)");

export async function approveUsdcExchange(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  amount: bigint;
}): Promise<string> {
  const { usdc, outcomeExchange } = frontendContracts;
  if (usdc === null) {
    throw new Error("VITE_USDC_ADDRESS is not configured.");
  }
  if (outcomeExchange === null) {
    throw new Error("VITE_OUTCOME_EXCHANGE_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: usdc,
    data: `${ERC20_APPROVE_SELECTOR}${encodeAddress(outcomeExchange)}${encodeUint256(params.amount)}`,
  });
}

export async function approveUsdcLoanContract(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  amount: bigint;
}): Promise<string> {
  const { usdc, loanPositionToken } = frontendContracts;
  if (usdc === null) {
    throw new Error("VITE_USDC_ADDRESS is not configured.");
  }
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: usdc,
    data: `${ERC20_APPROVE_SELECTOR}${encodeAddress(loanPositionToken)}${encodeUint256(params.amount)}`,
  });
}

export async function approveUsdcOutcomeToken(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  amount: bigint;
}): Promise<string> {
  const { usdc, outcomeToken } = frontendContracts;
  if (usdc === null) {
    throw new Error("VITE_USDC_ADDRESS is not configured.");
  }
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: usdc,
    data: `${ERC20_APPROVE_SELECTOR}${encodeAddress(outcomeToken)}${encodeUint256(params.amount)}`,
  });
}

export async function createLoan(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  principal: bigint;
  interestBps: bigint;
  collateralBps: bigint;
  loanWithdrawFreezeDeadline: bigint;
  activationDeadline: bigint;
  repaymentDeadline: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data:
      `${CREATE_LOAN_SELECTOR}` +
      `${encodeUint256(params.principal)}` +
      `${encodeUint256(params.interestBps)}` +
      `${encodeUint256(params.collateralBps)}` +
      `${encodeUint256(params.loanWithdrawFreezeDeadline)}` +
      `${encodeUint256(params.activationDeadline)}` +
      `${encodeUint256(params.repaymentDeadline)}`,
  });
}

export async function activateLoan(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  loanId: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${ACTIVATE_LOAN_SELECTOR}${encodeUint256(params.loanId)}`,
  });
}

export async function claimLoanPosition(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  positionId: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${CLAIM_POSITION_SELECTOR}${encodeUint256(params.positionId)}`,
  });
}

export async function fundLoan(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  loanId: bigint;
  amount: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${FUND_SELECTOR}${encodeUint256(params.loanId)}${encodeUint256(params.amount)}`,
  });
}

export async function depositBorrowerCollateral(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  marketId: string;
  amount: bigint;
}): Promise<string> {
  const { outcomeToken } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data: `${DEPOSIT_BORROWER_COLLATERAL_SELECTOR}${encodeBytes32(params.marketId)}${encodeUint256(params.amount)}`,
  });
}

export async function depositPairCollateral(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  marketId: string;
  amount: bigint;
}): Promise<string> {
  const { outcomeToken } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data: `${DEPOSIT_PAIR_COLLATERAL_SELECTOR}${encodeBytes32(params.marketId)}${encodeUint256(params.amount)}`,
  });
}

export async function mintActivatedPair(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  marketId: string;
}): Promise<string> {
  const { outcomeToken } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data: `${MINT_ACTIVATED_PAIR_SELECTOR}${encodeBytes32(params.marketId)}`,
  });
}

export async function withdrawPairDeposit(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  marketId: string;
  amount: bigint;
}): Promise<string> {
  const { outcomeToken } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data: `${WITHDRAW_PAIR_DEPOSIT_SELECTOR}${encodeBytes32(params.marketId)}${encodeUint256(params.amount)}`,
  });
}

export async function mergeOutcomePositions(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  marketId: string;
  amount: bigint;
}): Promise<string> {
  const { outcomeToken } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data: `${MERGE_POSITIONS_SELECTOR}${encodeBytes32(params.marketId)}${encodeUint256(params.amount)}`,
  });
}

export async function redeemOutcome(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  marketId: string;
  outcome: "YES" | "NO";
  amount: bigint;
}): Promise<string> {
  const { outcomeToken } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data:
      `${REDEEM_OUTCOME_SELECTOR}` +
      `${encodeBytes32(params.marketId)}` +
      `${encodeUint256(params.outcome === "YES" ? 1n : 2n)}` +
      `${encodeUint256(params.amount)}`,
  });
}

export async function depositToLoan(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  loanId: bigint;
  amount: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${DEPOSIT_TO_LOAN_SELECTOR}${encodeUint256(params.loanId)}${encodeUint256(params.amount)}`,
  });
}

export async function settleRepaidLoan(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  loanId: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${SETTLE_REPAID_SELECTOR}${encodeUint256(params.loanId)}`,
  });
}

export async function markLoanDefaulted(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  loanId: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${MARK_DEFAULTED_SELECTOR}${encodeUint256(params.loanId)}`,
  });
}

export async function redeemDefaultCollateral(params: {
  provider: EthereumProvider;
  account: WalletAccount;
  loanId: bigint;
}): Promise<string> {
  const { loanPositionToken } = frontendContracts;
  if (loanPositionToken === null) {
    throw new Error("VITE_LOAN_POSITION_TOKEN_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: loanPositionToken,
    data: `${REDEEM_DEFAULT_COLLATERAL_SELECTOR}${encodeUint256(params.loanId)}`,
  });
}

export async function approveOutcomeExchange(params: {
  provider: EthereumProvider;
  account: WalletAccount;
}): Promise<string> {
  const { outcomeToken, outcomeExchange } = frontendContracts;
  if (outcomeToken === null) {
    throw new Error("VITE_OUTCOME_TOKEN_ADDRESS is not configured.");
  }
  if (outcomeExchange === null) {
    throw new Error("VITE_OUTCOME_EXCHANGE_ADDRESS is not configured.");
  }

  return sendAndWait(params.provider, {
    from: params.account.address,
    to: outcomeToken,
    data: `${SET_APPROVAL_FOR_ALL_SELECTOR}${encodeAddress(outcomeExchange)}${encodeBool(true)}`,
  });
}

async function sendAndWait(
  provider: EthereumProvider,
  transaction: {
    from: string;
    to: string;
    data: string;
  }
): Promise<string> {
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [transaction],
  });

  if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]+$/.test(txHash)) {
    throw new Error("Wallet returned an invalid transaction hash.");
  }

  await waitForTransactionReceipt(provider, txHash);

  return txHash;
}

async function waitForTransactionReceipt(provider: EthereumProvider, txHash: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });

    if (receipt !== null) {
      if (isFailedReceipt(receipt)) {
        throw new Error(`Transaction reverted: ${txHash}`);
      }
      return;
    }

    await delay(1500);
  }

  throw new Error(`Transaction was not mined in time: ${txHash}`);
}

function isFailedReceipt(receipt: unknown): boolean {
  return (
    typeof receipt === "object" &&
    receipt !== null &&
    !Array.isArray(receipt) &&
    (receipt as { status?: unknown }).status === "0x0"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function encodeAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM address.");
  }

  return address.slice(2).padStart(64, "0");
}

function encodeBool(value: boolean): string {
  return (value ? "1" : "0").padStart(64, "0");
}

function encodeBytes32(value: string): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("Invalid bytes32 value.");
  }

  return value.slice(2);
}

function encodeUint256(value: bigint): string {
  if (value < 0n) {
    throw new Error("uint256 cannot be negative.");
  }

  return value.toString(16).padStart(64, "0");
}
