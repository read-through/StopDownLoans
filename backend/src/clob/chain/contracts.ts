import type { PublicClient } from "viem";
import { isRetryableRpcError } from "../rpcErrors.js";
import type { Hex, Outcome } from "../types.js";

const outcomeExchangeAbi = [
  {
    type: "function",
    name: "filledAmounts",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const loanPositionTokenAbi = [
  {
    type: "function",
    name: "outcomeToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "nextLoanId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextPositionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "loanId", type: "uint256" },
      { name: "principalAmount", type: "uint256" },
      { name: "claimedAmount", type: "uint256" },
      { name: "split", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getLoanView",
    stateMutability: "view",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "principal", type: "uint256" },
          { name: "repaymentAmount", type: "uint256" },
          { name: "loanWithdrawFreezeDeadline", type: "uint256" },
          { name: "activationDeadline", type: "uint256" },
          { name: "repaymentDeadline", type: "uint256" },
          { name: "fundedAmount", type: "uint256" },
          { name: "creditedAmount", type: "uint256" },
          { name: "repaymentSatisfiedAt", type: "uint256" },
          { name: "feeClaimedAmount", type: "uint256" },
          { name: "state", type: "uint8" },
          { name: "interestBps", type: "uint256" },
          { name: "feeBps", type: "uint256" },
          { name: "feeRecipient", type: "address" },
          { name: "collateralBps", type: "uint256" },
          { name: "borrowerCollateralAmount", type: "uint256" },
          { name: "marketId", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "activate",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settleRepaid",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelExpiredLoan",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "markDefaulted",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "redeemDefaultCollateral",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
] as const;

const outcomeTokenAbi = [
  {
    type: "function",
    name: "getMarketView",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "loanId", type: "uint256" },
          { name: "borrower", type: "address" },
          { name: "borrowerCollateralAmount", type: "uint256" },
          { name: "borrowerCollateralDepositedAmount", type: "uint256" },
          { name: "winningOutcome", type: "uint8" },
          { name: "state", type: "uint8" },
          { name: "yesTokenId", type: "uint256" },
          { name: "noTokenId", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getOutcomeTokenId",
    stateMutability: "pure",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "winningOutcome", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const erc1155Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const OUTCOME_MARKET_STATE_ACTIVE = 1;

export type LoanChainState =
  | "FUNDING"
  | "FUNDED"
  | "ACTIVE"
  | "CANCELLED"
  | "REPAID"
  | "DEFAULTED";

export type LoanChainView = {
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
  state: LoanChainState;
  interestBps: bigint;
  feeBps: bigint;
  feeRecipient: Hex;
  collateralBps: bigint;
  borrowerCollateralAmount: bigint;
  borrowerCollateralDepositedAmount: bigint;
  marketId: Hex;
};

export type LoanPositionChainView = {
  positionId: bigint;
  loanId: bigint;
  principalAmount: bigint;
  claimedAmount: bigint;
  claimableAmount: bigint;
  split: boolean;
  balance: bigint;
};

type LoanContractView = {
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
  state: number;
  interestBps: bigint;
  feeBps: bigint;
  feeRecipient: Hex;
  collateralBps: bigint;
  borrowerCollateralAmount: bigint;
  marketId: Hex;
};

type OutcomeMarketView = {
  borrowerCollateralDepositedAmount: bigint;
  state: number;
};

export async function getNextLoanId(client: PublicClient, loanPositionToken: Hex): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "nextLoanId",
  });
}

export async function getNextPositionId(client: PublicClient, loanPositionToken: Hex): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "nextPositionId",
  });
}

export async function getConfiguredOutcomeToken(
  client: PublicClient,
  loanPositionToken: Hex
): Promise<Hex | null> {
  const outcomeToken = await readContractWithRetry<Hex>(client, {
    address: loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "outcomeToken",
  });

  return outcomeToken === "0x0000000000000000000000000000000000000000" ? null : outcomeToken;
}

export async function getLoanPositionChainView(
  client: PublicClient,
  loanPositionToken: Hex,
  account: Hex,
  positionId: bigint
): Promise<LoanPositionChainView | null> {
  const [position, balance] = await Promise.all([
    readContractWithRetry<readonly [bigint, bigint, bigint, boolean]>(client, {
      address: loanPositionToken,
      abi: loanPositionTokenAbi,
      functionName: "positions",
      args: [positionId],
    }),
    getErc1155Balance(client, loanPositionToken, account, positionId),
  ]);

  const [loanId, principalAmount, claimedAmount, split] = position;

  if (balance === 0n || loanId === 0n) {
    return null;
  }
  const loan = await getLoanChainView(client, loanPositionToken, loanId);

  return {
    positionId,
    loanId,
    principalAmount,
    claimedAmount,
    claimableAmount: calculateClaimableAmount(
      {
        principalAmount,
        claimedAmount,
      },
      loan,
      BigInt(Math.floor(Date.now() / 1000))
    ),
    split,
    balance,
  };
}

function calculateClaimableAmount(
  position: Pick<LoanPositionChainView, "principalAmount" | "claimedAmount">,
  loan: LoanChainView,
  nowSeconds: bigint
): bigint {
  if (loan.state === "FUNDING" || loan.state === "FUNDED") {
    if (nowSeconds >= loan.loanWithdrawFreezeDeadline) {
      return 0n;
    }

    return saturatingSub(position.principalAmount, position.claimedAmount);
  }

  if (loan.state === "CANCELLED") {
    return saturatingSub(position.principalAmount, position.claimedAmount);
  }

  if (loan.state !== "REPAID" && loan.state !== "DEFAULTED") {
    return 0n;
  }

  if (loan.fundedAmount === 0n) {
    return 0n;
  }

  const totalEntitlement = (lenderPayoutPool(loan) * position.principalAmount) / loan.fundedAmount;
  return saturatingSub(totalEntitlement, position.claimedAmount);
}

function lenderPayoutPool(loan: LoanChainView): bigint {
  return saturatingSub(loan.creditedAmount, totalProtocolFee(loan));
}

function totalProtocolFee(loan: LoanChainView): bigint {
  if (loan.creditedAmount <= loan.fundedAmount) {
    return 0n;
  }

  return ((loan.creditedAmount - loan.fundedAmount) * loan.feeBps) / 10_000n;
}

function saturatingSub(left: bigint, right: bigint): bigint {
  return left > right ? left - right : 0n;
}

export async function getLoanChainView(
  client: PublicClient,
  loanPositionToken: Hex,
  loanId: bigint
): Promise<LoanChainView> {
  const loan = await readContractWithRetry<LoanContractView>(client, {
    address: loanPositionToken,
    abi: loanPositionTokenAbi,
    functionName: "getLoanView",
    args: [loanId],
  });
  const borrowerCollateralDepositedAmount = await getBorrowerCollateralDepositedAmount(
    client,
    loanPositionToken,
    loan.marketId
  );

  return {
    loanId,
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
    state: mapLoanChainState(loan.state),
    interestBps: loan.interestBps,
    feeBps: loan.feeBps,
    feeRecipient: loan.feeRecipient,
    collateralBps: loan.collateralBps,
    borrowerCollateralAmount: loan.borrowerCollateralAmount,
    borrowerCollateralDepositedAmount,
    marketId: loan.marketId,
  };
}

async function getBorrowerCollateralDepositedAmount(
  client: PublicClient,
  loanPositionToken: Hex,
  marketId: Hex
): Promise<bigint> {
  const outcomeToken = await getConfiguredOutcomeToken(client, loanPositionToken);
  if (outcomeToken === null) {
    return 0n;
  }

  const market = await readContractWithRetry<OutcomeMarketView>(client, {
    address: outcomeToken,
    abi: outcomeTokenAbi,
    functionName: "getMarketView",
    args: [marketId],
  });

  return market.borrowerCollateralDepositedAmount;
}

export async function isOutcomeMarketActive(
  client: PublicClient,
  outcomeToken: Hex,
  marketId: Hex
): Promise<boolean> {
  const market = await readContractWithRetry<OutcomeMarketView>(client, {
    address: outcomeToken,
    abi: outcomeTokenAbi,
    functionName: "getMarketView",
    args: [marketId],
  });

  return market.state === OUTCOME_MARKET_STATE_ACTIVE;
}

export async function getOutcomeTokenId(
  client: PublicClient,
  outcomeToken: Hex,
  marketId: Hex,
  outcome: Outcome
): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: outcomeToken,
    abi: outcomeTokenAbi,
    functionName: "getOutcomeTokenId",
    args: [marketId, outcome === "YES" ? 1 : 2],
  });
}

export async function getFilledAmount(
  client: PublicClient,
  outcomeExchange: Hex,
  orderHash: Hex
): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: outcomeExchange,
    abi: outcomeExchangeAbi,
    functionName: "filledAmounts",
    args: [orderHash],
  });
}

export async function getErc20Balance(
  client: PublicClient,
  token: Hex,
  account: Hex
): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function getErc20Allowance(
  client: PublicClient,
  token: Hex,
  owner: Hex,
  spender: Hex
): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function getErc1155Balance(
  client: PublicClient,
  token: Hex,
  account: Hex,
  tokenId: bigint
): Promise<bigint> {
  return readContractWithRetry<bigint>(client, {
    address: token,
    abi: erc1155Abi,
    functionName: "balanceOf",
    args: [account, tokenId],
  });
}

export async function isErc1155ApprovedForAll(
  client: PublicClient,
  token: Hex,
  account: Hex,
  operator: Hex
): Promise<boolean> {
  return readContractWithRetry<boolean>(client, {
    address: token,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: [account, operator],
  });
}

function mapLoanChainState(value: number): LoanChainState {
  if (value === 0) return "FUNDING";
  if (value === 1) return "FUNDED";
  if (value === 2) return "ACTIVE";
  if (value === 3) return "CANCELLED";
  if (value === 4) return "REPAID";
  if (value === 5) return "DEFAULTED";

  throw new Error(`Unknown loan state: ${value}`);
}

async function readContractWithRetry<T>(
  client: PublicClient,
  parameters: Parameters<PublicClient["readContract"]>[0]
): Promise<T> {
  const backoffMs = [2_000, 5_000, 15_000, 30_000];

  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      return await client.readContract(parameters as any) as T;
    } catch (error) {
      if (attempt === backoffMs.length || !isRetryableRpcError(error)) {
        throw error;
      }

      await delay(backoffMs[attempt]);
    }
  }

  throw new Error("unreachable readContract retry state");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
