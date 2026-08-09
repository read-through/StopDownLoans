export type ApiMarketConfig = {
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
  yesBestBid: ApiPriceLevel | null;
  yesBestAsk: ApiPriceLevel | null;
  confirmedUsdcVolume: string;
  loan: ApiMarketLinkedLoan | null;
};

export type ApiHealth = {
  status: "ok";
  service: "clob-backend";
  timestamp: string;
  chainId: number;
  contracts: {
    loanPositionToken: string;
    outcomeToken: string;
    outcomeExchange: string;
    usdc: string;
  };
  executorEnabled: boolean;
  confirmationDepth: string;
  sync:
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
};

export type ApiMarketsResponse = {
  markets: ApiMarketConfig[];
  nextCursor: string | null;
};

export type ApiMarketLinkedLoan = {
  loanId: string;
  borrower: string;
  principal: string;
  repaymentAmount: string;
  state: ApiLoan["state"];
  activationDeadline: string;
  repaymentDeadline: string;
};

export type ApiPriceLevel = {
  priceUnits: number;
  totalRemainingOutcomeAmount: string;
};

export type ApiBookSnapshot = {
  outcomeToken: string;
  marketId: string;
  outcome: "YES" | "NO";
  sequence: string;
  bids: ApiPriceLevel[];
  asks: ApiPriceLevel[];
  timestamp: string;
};

export type ApiLoan = {
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
  state: "FUNDING" | "FUNDED" | "ACTIVE" | "CANCELLED" | "REPAID" | "DEFAULTED";
  interestBps: string;
  feeBps: string;
  feeRecipient: string;
  collateralBps: string;
  borrowerCollateralAmount: string;
  borrowerCollateralDepositedAmount: string;
  marketId: string;
};

export type ApiLoansResponse = {
  loans: ApiLoan[];
  nextCursor: string | null;
};

export type ApiLoanPosition = {
  positionId: string;
  loanId: string;
  principalAmount: string;
  claimedAmount: string;
  claimableAmount: string;
  balance: string;
  split: boolean;
};

export type ApiLoanPositionsResponse = {
  positions: ApiLoanPosition[];
  nextCursor: string | null;
};

export type ApiOrder = {
  orderHash: string;
  order: {
    maker: string;
    outcomeToken: string;
    marketId: string;
    outcome: "YES" | "NO";
    side: "BUY" | "SELL";
    outcomeAmount: string;
    usdcAmount: string;
    expiration: string;
    nonce: string;
  };
  signature: string;
  timeInForce: "GTC" | "FAK";
  priceUnits: number;
  remainingOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
  availableForMatching: string;
  status: "LIVE" | "FILLED" | "CANCELLED" | "EXPIRED" | "FAILED";
  isPartiallyFilled: boolean;
  acceptedSequence: string;
  createdAt: string;
  updatedAt: string;
};

export type SubmitOrderPayload = {
  order: {
    maker: string;
    outcomeToken: string;
    marketId: string;
    outcome: "YES" | "NO";
    side: "BUY" | "SELL";
    outcomeAmount: string;
    usdcAmount: string;
    expiration: string;
    nonce: string;
  };
  signature: string;
  timeInForce: "GTC" | "FAK";
  priceUnits: number;
};

export type ApiSubmitOrderResponse = {
  orderHash: string;
  status: ApiOrder["status"];
  remainingOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
  availableForMatching: string;
  isPartiallyFilled: boolean;
  priceUnits: number;
  createdTradeIds: string[];
  rested: boolean;
};

export type CancelOrderPayload = {
  cancel: {
    maker: string;
    orderHash: string;
    expiration: string;
    nonce: string;
  };
  signature: string;
};

export type ApiCancelOrderResponse = {
  orderHash: string;
  status: ApiOrder["status"];
  cancelledAvailableOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
};

export type ApiTrade = {
  tradeId: string;
  outcomeToken: string;
  marketId: string;
  outcome: "YES" | "NO";
  totalOutcomeAmount: string;
  totalUsdcAmount: string;
  status: "PENDING" | "SUBMITTED" | "MINED" | "CONFIRMED" | "FAILED";
  txHash: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type ApiTradesResponse = {
  trades: ApiTrade[];
  nextCursor: string | null;
};

export type ApiReservation = {
  assetType: "ERC20" | "ERC1155";
  assetAddress: string;
  tokenId: string;
  reservedAmount: string;
  updatedAt: string;
};

export type ApiReservationsResponse = {
  maker: string;
  reservations: ApiReservation[];
};

export type ApiOrdersResponse = {
  orders: ApiOrder[];
  nextCursor: string | null;
};

export const clobApiUrl =
  import.meta.env.VITE_CLOB_SAME_ORIGIN === "true"
    ? window.location.origin
    : import.meta.env.VITE_CLOB_API_URL ?? "http://127.0.0.1:3000";

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const errorBody = await response.json().catch(() => null) as ApiErrorBody | null;
  const code = errorBody?.error?.code;
  const message = errorBody?.error?.message;

  if (code === "RATE_LIMITED") {
    throw new Error("ARC RPC rate limit reached. Wait a moment and refresh.");
  }

  throw new Error(message ?? `${fallback} failed with HTTP ${response.status}`);
}

export async function fetchHealth(): Promise<ApiHealth> {
  const response = await fetch(`${clobApiUrl}/v1/health`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/health");
  }

  return (await response.json()) as ApiHealth;
}

export async function fetchMarkets(params: { limit?: number; cursor?: string } = {}): Promise<ApiMarketsResponse> {
  const search = new URLSearchParams({
    limit: (params.limit ?? 25).toString(),
  });

  if (params.cursor !== undefined) {
    search.set("cursor", params.cursor);
  }

  const response = await fetch(`${clobApiUrl}/v1/markets?${search.toString()}`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/markets");
  }

  return (await response.json()) as ApiMarketsResponse;
}

export async function fetchLoans(params: { limit?: number; cursor?: string } = {}): Promise<ApiLoansResponse> {
  const search = new URLSearchParams({
    limit: (params.limit ?? 25).toString(),
  });

  if (params.cursor !== undefined) {
    search.set("cursor", params.cursor);
  }

  const response = await fetch(`${clobApiUrl}/v1/loans?${search.toString()}`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/loans");
  }

  return (await response.json()) as ApiLoansResponse;
}

export async function fetchLoanPositions(params: {
  account: string;
  limit?: number;
  cursor?: string;
}): Promise<ApiLoanPositionsResponse> {
  const search = new URLSearchParams({
    account: params.account,
    limit: (params.limit ?? 10).toString(),
  });

  if (params.cursor !== undefined) {
    search.set("cursor", params.cursor);
  }

  const response = await fetch(`${clobApiUrl}/v1/loan-positions?${search.toString()}`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/loan-positions");
  }

  return (await response.json()) as ApiLoanPositionsResponse;
}

export async function fetchBookSnapshot(params: {
  outcomeToken: string;
  marketId: string;
  outcome: "YES" | "NO";
}): Promise<ApiBookSnapshot> {
  const response = await fetch(
    `${clobApiUrl}/v1/books/${params.outcomeToken}/${params.marketId}/${params.outcome}`
  );

  if (!response.ok) {
    await throwApiError(response, "GET /v1/books/...");
  }

  return (await response.json()) as ApiBookSnapshot;
}

export async function fetchTrades(params: {
  outcomeToken: string;
  marketId: string;
  outcome: "YES" | "NO";
  limit?: number;
  cursor?: string;
}): Promise<ApiTradesResponse> {
  const search = new URLSearchParams({
    outcomeToken: params.outcomeToken,
    marketId: params.marketId,
    outcome: params.outcome,
    limit: (params.limit ?? 10).toString(),
  });

  if (params.cursor !== undefined) {
    search.set("cursor", params.cursor);
  }

  const response = await fetch(`${clobApiUrl}/v1/trades?${search.toString()}`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/trades");
  }

  return (await response.json()) as ApiTradesResponse;
}

export async function fetchOrders(params: {
  maker: string;
  status?: ApiOrder["status"];
  limit?: number;
  cursor?: string;
}): Promise<ApiOrdersResponse> {
  const search = new URLSearchParams({
    maker: params.maker,
    limit: (params.limit ?? 25).toString(),
  });

  if (params.status !== undefined) {
    search.set("status", params.status);
  }

  if (params.cursor !== undefined) {
    search.set("cursor", params.cursor);
  }

  const response = await fetch(`${clobApiUrl}/v1/orders?${search.toString()}`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/orders");
  }

  return (await response.json()) as ApiOrdersResponse;
}

export async function fetchReservations(params: { maker: string }): Promise<ApiReservationsResponse> {
  const search = new URLSearchParams({
    maker: params.maker,
  });
  const response = await fetch(`${clobApiUrl}/v1/reservations?${search.toString()}`);

  if (!response.ok) {
    await throwApiError(response, "GET /v1/reservations");
  }

  return (await response.json()) as ApiReservationsResponse;
}

export async function submitOrder(payload: SubmitOrderPayload): Promise<ApiSubmitOrderResponse> {
  const response = await fetch(`${clobApiUrl}/v1/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await throwApiError(response, "POST /v1/orders");
  }

  return (await response.json()) as ApiSubmitOrderResponse;
}

export async function cancelOrder(payload: CancelOrderPayload): Promise<ApiCancelOrderResponse> {
  const response = await fetch(`${clobApiUrl}/v1/orders/${payload.cancel.orderHash}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await throwApiError(response, "POST /v1/orders/.../cancel");
  }

  return (await response.json()) as ApiCancelOrderResponse;
}
