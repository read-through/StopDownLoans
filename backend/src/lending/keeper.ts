import type { PublicClient, WalletClient } from "viem";
import {
  getConfiguredOutcomeToken,
  getErc1155Balance,
  getLoanChainView,
  getNextLoanId,
  getOutcomeTokenId,
  loanPositionTokenAbi,
  type LoanChainView,
} from "../clob/chain/contracts.js";
import type { Hex } from "../clob/types.js";

export type LendingKeeperAction =
  | "ACTIVATE"
  | "SETTLE_REPAID"
  | "CANCEL_EXPIRED"
  | "MARK_DEFAULTED"
  | "REDEEM_DEFAULT_COLLATERAL";

export type LendingKeeperBatchItem = {
  loanId: bigint;
  action: LendingKeeperAction;
  transactionHash: Hex;
};

export type RunLendingKeeperBatchInput = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  loanPositionToken: Hex;
  scanLimit: number;
  nowSeconds?: bigint;
};

export type RunLendingKeeperBatchResult = {
  checkedLoans: number;
  submitted: LendingKeeperBatchItem[];
};

export async function runLendingKeeperBatch(
  input: RunLendingKeeperBatchInput
): Promise<RunLendingKeeperBatchResult> {
  assertPositiveInteger(input.scanLimit, "Lending keeper scan limit");
  assertWalletAccount(input.walletClient);

  const nextLoanId = await getNextLoanId(input.publicClient, input.loanPositionToken);
  const outcomeToken = await getConfiguredOutcomeToken(input.publicClient, input.loanPositionToken);
  const nowSeconds = input.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  const submitted: LendingKeeperBatchItem[] = [];
  let checkedLoans = 0;

  for (
    let loanId = nextLoanId - 1n;
    loanId > 0n && checkedLoans < input.scanLimit;
    loanId--
  ) {
    checkedLoans++;
    const loan = await getLoanChainView(input.publicClient, input.loanPositionToken, loanId);
    const action = await selectLendingKeeperAction({
      publicClient: input.publicClient,
      loanPositionToken: input.loanPositionToken,
      outcomeToken,
      loan,
      nowSeconds,
    });

    if (action === null) {
      continue;
    }

    const transactionHash = await writeLoanLifecycleAction({
      walletClient: input.walletClient,
      loanPositionToken: input.loanPositionToken,
      loanId,
      action,
    });
    await input.publicClient.waitForTransactionReceipt({ hash: transactionHash });
    submitted.push({ loanId, action, transactionHash });
  }

  return { checkedLoans, submitted };
}

export async function selectLendingKeeperAction(input: {
  publicClient: PublicClient;
  loanPositionToken: Hex;
  outcomeToken: Hex | null;
  loan: LoanChainView;
  nowSeconds: bigint;
}): Promise<LendingKeeperAction | null> {
  if (
    input.loan.state === "FUNDED" &&
    input.nowSeconds >= input.loan.loanWithdrawFreezeDeadline &&
    input.nowSeconds <= input.loan.activationDeadline &&
    input.loan.fundedAmount >= input.loan.principal &&
    input.loan.borrowerCollateralDepositedAmount >= input.loan.borrowerCollateralAmount
  ) {
    return "ACTIVATE";
  }

  if (
    (input.loan.state === "FUNDING" || input.loan.state === "FUNDED") &&
    input.nowSeconds > input.loan.activationDeadline
  ) {
    return "CANCEL_EXPIRED";
  }

  if (
    input.loan.state === "ACTIVE" &&
    input.loan.repaymentSatisfiedAt !== 0n &&
    input.loan.repaymentSatisfiedAt <= input.loan.repaymentDeadline
  ) {
    return "SETTLE_REPAID";
  }

  if (
    input.loan.state === "ACTIVE" &&
    input.nowSeconds > input.loan.repaymentDeadline &&
    (input.loan.repaymentSatisfiedAt === 0n || input.loan.repaymentSatisfiedAt > input.loan.repaymentDeadline)
  ) {
    return "MARK_DEFAULTED";
  }

  if (input.loan.state === "DEFAULTED" && input.outcomeToken !== null) {
    const noTokenId = await getOutcomeTokenId(
      input.publicClient,
      input.outcomeToken,
      input.loan.marketId,
      "NO"
    );
    const noBalance = await getErc1155Balance(
      input.publicClient,
      input.outcomeToken,
      input.loanPositionToken,
      noTokenId
    );

    return noBalance > 0n ? "REDEEM_DEFAULT_COLLATERAL" : null;
  }

  return null;
}

export function startLendingKeeperLoop(options: {
  intervalMs: number;
  run: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  assertPositiveInteger(options.intervalMs, "Lending keeper interval");

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    options.run().then(
      () => {
        running = false;
      },
      (error) => {
        running = false;
        options.onError?.(error);
      }
    );
  }, options.intervalMs);

  return () => clearInterval(timer);
}

async function writeLoanLifecycleAction(input: {
  walletClient: WalletClient;
  loanPositionToken: Hex;
  loanId: bigint;
  action: LendingKeeperAction;
}): Promise<Hex> {
  assertWalletAccount(input.walletClient);

  if (input.action === "ACTIVATE") {
    return input.walletClient.writeContract({
      address: input.loanPositionToken,
      abi: loanPositionTokenAbi,
      functionName: "activate",
      args: [input.loanId],
      account: input.walletClient.account,
      chain: null,
    });
  }

  if (input.action === "SETTLE_REPAID") {
    return input.walletClient.writeContract({
      address: input.loanPositionToken,
      abi: loanPositionTokenAbi,
      functionName: "settleRepaid",
      args: [input.loanId],
      account: input.walletClient.account,
      chain: null,
    });
  }

  if (input.action === "CANCEL_EXPIRED") {
    return input.walletClient.writeContract({
      address: input.loanPositionToken,
      abi: loanPositionTokenAbi,
      functionName: "cancelExpiredLoan",
      args: [input.loanId],
      account: input.walletClient.account,
      chain: null,
    });
  }

  if (input.action === "MARK_DEFAULTED") {
    return input.walletClient.writeContract({
      address: input.loanPositionToken,
      abi: loanPositionTokenAbi,
      functionName: "markDefaulted",
      args: [input.loanId],
      account: input.walletClient.account,
      chain: null,
    });
  }

  return input.walletClient.writeContract({
    address: input.loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "redeemDefaultCollateral",
    args: [input.loanId],
    account: input.walletClient.account,
    chain: null,
  });
}

function assertWalletAccount(walletClient: WalletClient): asserts walletClient is WalletClient & {
  account: NonNullable<WalletClient["account"]>;
} {
  if (walletClient.account === undefined) {
    throw new Error("Lending keeper wallet client must have an account.");
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be positive: ${value}`);
  }
}
