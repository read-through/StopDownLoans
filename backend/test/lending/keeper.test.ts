import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicClient, WalletClient } from "viem";
import {
  runLendingKeeperBatch,
  selectLendingKeeperAction,
  startLendingKeeperLoop,
} from "../../src/lending/keeper.js";
import type { LoanChainState, LoanChainView } from "../../src/clob/chain/contracts.js";
import type { Hex } from "../../src/clob/types.js";

const loanPositionToken = "0x0000000000000000000000000000000000000003" as Hex;
const outcomeToken = "0x0000000000000000000000000000000000000004" as Hex;
const marketId = `0x${"11".repeat(32)}` as Hex;
const transactionHash = `0x${"aa".repeat(32)}` as Hex;

describe("selectLendingKeeperAction", () => {
  it("activates a funded loan after the withdraw freeze deadline when borrower collateral is present", async () => {
    const action = await selectLendingKeeperAction({
      publicClient: fakePublicClient(),
      loanPositionToken,
      outcomeToken,
      nowSeconds: 100n,
      loan: loanView({
        state: "FUNDED",
        fundedAmount: 1_000n,
        borrowerCollateralDepositedAmount: 1_050n,
        loanWithdrawFreezeDeadline: 100n,
        activationDeadline: 200n,
      }),
    });

    assert.equal(action, "ACTIVATE");
  });

  it("cancels funding or funded loans after the activation deadline", async () => {
    const action = await selectLendingKeeperAction({
      publicClient: fakePublicClient(),
      loanPositionToken,
      outcomeToken,
      nowSeconds: 201n,
      loan: loanView({
        state: "FUNDING",
        activationDeadline: 200n,
      }),
    });

    assert.equal(action, "CANCEL_EXPIRED");
  });

  it("settles repaid active loans before the repayment deadline", async () => {
    const action = await selectLendingKeeperAction({
      publicClient: fakePublicClient(),
      loanPositionToken,
      outcomeToken,
      nowSeconds: 301n,
      loan: loanView({
        state: "ACTIVE",
        creditedAmount: 1_050n,
        repaymentAmount: 1_050n,
        repaymentSatisfiedAt: 250n,
        repaymentDeadline: 300n,
      }),
    });

    assert.equal(action, "SETTLE_REPAID");
  });

  it("marks underpaid active loans as defaulted after the repayment deadline", async () => {
    const action = await selectLendingKeeperAction({
      publicClient: fakePublicClient(),
      loanPositionToken,
      outcomeToken,
      nowSeconds: 301n,
      loan: loanView({
        state: "ACTIVE",
        creditedAmount: 900n,
        repaymentAmount: 1_050n,
        repaymentDeadline: 300n,
      }),
    });

    assert.equal(action, "MARK_DEFAULTED");
  });

  it("defaults late fully credited loans when the repayment target was not satisfied before the deadline", async () => {
    const action = await selectLendingKeeperAction({
      publicClient: fakePublicClient(),
      loanPositionToken,
      outcomeToken,
      nowSeconds: 301n,
      loan: loanView({
        state: "ACTIVE",
        creditedAmount: 1_050n,
        repaymentAmount: 1_050n,
        repaymentSatisfiedAt: 0n,
        repaymentDeadline: 300n,
      }),
    });

    assert.equal(action, "MARK_DEFAULTED");
  });

  it("redeems default collateral only when the loan contract still holds NO", async () => {
    const action = await selectLendingKeeperAction({
      publicClient: fakePublicClient({ noBalance: 50n }),
      loanPositionToken,
      outcomeToken,
      nowSeconds: 400n,
      loan: loanView({
        state: "DEFAULTED",
      }),
    });

    assert.equal(action, "REDEEM_DEFAULT_COLLATERAL");
  });
});

describe("runLendingKeeperBatch", () => {
  it("scans newest loans first and submits lifecycle transactions", async () => {
    const writes: Array<{ functionName: string; loanId: bigint }> = [];
    const publicClient = fakePublicClient({
      nextLoanId: 3n,
      loans: new Map([
        [
          2n,
          loanView({
            loanId: 2n,
            state: "ACTIVE",
            creditedAmount: 1_050n,
            repaymentAmount: 1_050n,
            repaymentSatisfiedAt: 150n,
            repaymentDeadline: 300n,
          }),
        ],
        [
          1n,
          loanView({
            loanId: 1n,
            state: "FUNDED",
            fundedAmount: 1_000n,
            borrowerCollateralDepositedAmount: 1_050n,
            loanWithdrawFreezeDeadline: 100n,
            activationDeadline: 200n,
          }),
        ],
      ]),
    });
    const walletClient = fakeWalletClient(writes);

    const result = await runLendingKeeperBatch({
      publicClient,
      walletClient,
      loanPositionToken,
      scanLimit: 10,
      nowSeconds: 150n,
    });

    assert.equal(result.checkedLoans, 2);
    assert.deepEqual(writes, [
      { functionName: "settleRepaid", loanId: 2n },
      { functionName: "activate", loanId: 1n },
    ]);
    assert.deepEqual(
      result.submitted.map((item) => item.action),
      ["SETTLE_REPAID", "ACTIVATE"]
    );
  });
});

describe("startLendingKeeperLoop", () => {
  it("does not run overlapping batches", async () => {
    let calls = 0;
    let releaseRun: (() => void) | undefined;
    const stop = startLendingKeeperLoop({
      intervalMs: 1,
      run: () =>
        new Promise<void>((resolve) => {
          calls += 1;
          releaseRun = resolve;
        }),
    });

    await sleep(10);
    assert.equal(calls, 1);

    releaseRun?.();
    await sleep(10);
    stop();

    assert.equal(calls > 1, true);
  });
});

function loanView(overrides: Partial<LoanChainView> = {}): LoanChainView {
  return {
    loanId: 1n,
    borrower: "0x0000000000000000000000000000000000000001",
    principal: 1_000n,
    repaymentAmount: 1_050n,
    loanWithdrawFreezeDeadline: 100n,
    activationDeadline: 200n,
    repaymentDeadline: 300n,
    fundedAmount: 1_000n,
    creditedAmount: 0n,
    repaymentSatisfiedAt: 0n,
    feeClaimedAmount: 0n,
    state: "FUNDING",
    interestBps: 500n,
    feeBps: 50n,
    feeRecipient: "0x0000000000000000000000000000000000000002",
    collateralBps: 10_000n,
    borrowerCollateralAmount: 1_050n,
    borrowerCollateralDepositedAmount: 0n,
    marketId,
    ...overrides,
  };
}

function fakePublicClient(options: {
  nextLoanId?: bigint;
  loans?: Map<bigint, LoanChainView>;
  noBalance?: bigint;
} = {}): PublicClient {
  return {
    readContract: async (request: { functionName: string; args?: unknown[] }) => {
      if (request.functionName === "nextLoanId") {
        return options.nextLoanId ?? 1n;
      }

      if (request.functionName === "outcomeToken") {
        return outcomeToken;
      }

      if (request.functionName === "getLoanView") {
        const loanId = request.args?.[0] as bigint;
        return loanToContractTuple(options.loans?.get(loanId) ?? loanView({ loanId }));
      }

      if (request.functionName === "getMarketView") {
        return {
          borrowerCollateralDepositedAmount: 1_050n,
        };
      }

      if (request.functionName === "getOutcomeTokenId") {
        return 2n;
      }

      if (request.functionName === "balanceOf") {
        return options.noBalance ?? 0n;
      }

      throw new Error(`Unexpected read: ${request.functionName}`);
    },
    waitForTransactionReceipt: async () => ({ status: "success" }),
  } as unknown as PublicClient;
}

function fakeWalletClient(writes: Array<{ functionName: string; loanId: bigint }>): WalletClient {
  return {
    account: {
      address: "0x0000000000000000000000000000000000000005",
    },
    writeContract: async (request: { functionName: string; args?: unknown[] }) => {
      writes.push({
        functionName: request.functionName,
        loanId: request.args?.[0] as bigint,
      });
      return transactionHash;
    },
  } as unknown as WalletClient;
}

type LoanContractTuple = {
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
  interestBps: bigint;
  feeBps: bigint;
  feeRecipient: Hex;
  collateralBps: bigint;
  borrowerCollateralAmount: bigint;
  marketId: Hex;
  state: number;
};

function loanToContractTuple(loan: LoanChainView): LoanContractTuple {
  return {
    borrower: loan.borrower,
    principal: loan.principal,
    repaymentAmount: loan.repaymentAmount,
    loanWithdrawFreezeDeadline: loan.loanWithdrawFreezeDeadline,
    activationDeadline: loan.activationDeadline,
    repaymentDeadline: loan.repaymentDeadline,
    fundedAmount: loan.fundedAmount,
    creditedAmount: loan.creditedAmount,
    repaymentSatisfiedAt: loan.repaymentSatisfiedAt,
    feeClaimedAmount: loan.feeClaimedAmount,
    state: loanStateToContractState(loan.state),
    interestBps: loan.interestBps,
    feeBps: loan.feeBps,
    feeRecipient: loan.feeRecipient,
    collateralBps: loan.collateralBps,
    borrowerCollateralAmount: loan.borrowerCollateralAmount,
    marketId: loan.marketId,
  };
}

function loanStateToContractState(state: LoanChainState): number {
  if (state === "FUNDING") return 0;
  if (state === "FUNDED") return 1;
  if (state === "ACTIVE") return 2;
  if (state === "CANCELLED") return 3;
  if (state === "REPAID") return 4;
  return 5;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
