import type { PublicClient } from "viem";
import {
  getLoanChainView,
  getNextLoanId,
  type LoanChainView,
} from "../clob/chain/contracts.js";
import { withTransaction } from "../clob/db/client.js";
import { upsertLoanSnapshot } from "../clob/db/loanSnapshots.js";
import { createMarketConfigIfMissing } from "../clob/db/marketConfigs.js";
import type { Hex } from "../clob/types.js";

export const DEFAULT_MARKET_CONFIG = {
  clobEnabled: true,
  defaultTickUnits: 1_000n,
  edgeTickUnits: 100n,
  lowerEdgePriceUnits: 100_000n,
  upperEdgePriceUnits: 900_000n,
  minOrderOutcomeAmount: 1n,
  maxOrderOutcomeAmount: null,
} as const;

export type LoanSnapshotSyncResult = {
  checkedLoans: bigint[];
  syncedLoans: bigint[];
};

export async function runLoanSnapshotSyncBatch(input: {
  publicClient: PublicClient;
  loanPositionToken: Hex;
  outcomeToken: Hex;
  limit: number;
}): Promise<LoanSnapshotSyncResult> {
  assertPositiveInteger(input.limit, "Loan snapshot sync limit");

  const nextLoanId = await getNextLoanId(input.publicClient, input.loanPositionToken);
  if (nextLoanId <= 1n) {
    return { checkedLoans: [], syncedLoans: [] };
  }

  const checkedLoans = getDescendingLoanIds(nextLoanId - 1n, input.limit);
  const syncedLoans: bigint[] = [];

  for (const loanId of checkedLoans) {
    const loan = await getLoanChainView(input.publicClient, input.loanPositionToken, loanId);
    await withTransaction(async (client) => {
      await upsertLoanSnapshot(client, {
        loanPositionToken: input.loanPositionToken,
        ...toLoanSnapshotInput(loan),
      });
      await createMarketConfigIfMissing(client, {
        outcomeToken: input.outcomeToken,
        marketId: loan.marketId,
        ...DEFAULT_MARKET_CONFIG,
      });
    });
    syncedLoans.push(loanId);
  }

  return { checkedLoans, syncedLoans };
}

export function startLoanSnapshotSyncLoop(options: {
  intervalMs: number;
  sync: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  assertPositiveInteger(options.intervalMs, "Loan snapshot sync interval");

  let running = false;
  const runOnce = () => {
    if (running) {
      return;
    }

    running = true;
    options.sync().catch(options.onError ?? (() => {})).finally(() => {
      running = false;
    });
  };

  runOnce();
  const timer = setInterval(runOnce, options.intervalMs);

  return () => clearInterval(timer);
}

function toLoanSnapshotInput(loan: LoanChainView) {
  return {
    loanId: loan.loanId,
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
    state: loan.state,
    interestBps: loan.interestBps,
    feeBps: loan.feeBps,
    feeRecipient: loan.feeRecipient,
    collateralBps: loan.collateralBps,
    borrowerCollateralAmount: loan.borrowerCollateralAmount,
    borrowerCollateralDepositedAmount: loan.borrowerCollateralDepositedAmount,
    marketId: loan.marketId,
  };
}

function getDescendingLoanIds(startLoanId: bigint, limit: number): bigint[] {
  const loanIds: bigint[] = [];
  let current = startLoanId;

  while (current > 0n && loanIds.length < limit) {
    loanIds.push(current);
    current--;
  }

  return loanIds;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}
