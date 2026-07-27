import { frontendContracts } from "./config";
import type { EthereumProvider, WalletAccount } from "./wallet";

const SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ACTIVATE_LOAN_SELECTOR = "0xb260c42a";
const CLAIM_POSITION_SELECTOR = "0x379607f5";
const CREATE_LOAN_SELECTOR = "0xcf2b4cbc";
const DEPOSIT_BORROWER_COLLATERAL_SELECTOR = "0x79389c85";
const DEPOSIT_PAIR_COLLATERAL_SELECTOR = "0xec647d6c";
const DEPOSIT_TO_LOAN_SELECTOR = "0x09748259";
const FUND_SELECTOR = "0xa65e2cfd";
const MARK_DEFAULTED_SELECTOR = "0x73216450";
const MERGE_POSITIONS_SELECTOR = "0xb10c5c17";
const MINT_ACTIVATED_PAIR_SELECTOR = "0x3bb11289";
const REDEEM_DEFAULT_COLLATERAL_SELECTOR = "0xa1d81475";
const REDEEM_OUTCOME_SELECTOR = "0x96844927";
const SETTLE_REPAID_SELECTOR = "0x94a5ffa4";
const WITHDRAW_PAIR_DEPOSIT_SELECTOR = "0xe853a6bd";

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
        throw new Error("Approval transaction reverted.");
      }
      return;
    }

    await delay(1500);
  }

  throw new Error("Approval transaction was not mined in time.");
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
