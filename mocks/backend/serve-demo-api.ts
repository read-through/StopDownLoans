import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const addresses = {
  loanPositionToken: "0x0000000000000000000000000000000000003001",
  outcomeExchange: "0x0000000000000000000000000000000000003003",
  outcomeToken: "0x0000000000000000000000000000000000003002",
  usdc: "0x0000000000000000000000000000000000003004",
};

const marketId = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const maker = "0x0000000000000000000000000000000000001004";
const now = new Date("2026-07-23T12:00:00.000Z");

const server = createServer(async (request, response) => {
  applyCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;

  if (request.method === "GET" && path === "/v1/health") {
    sendJson(response, healthDto());
    return;
  }

  if (request.method === "GET" && path === "/v1/markets") {
    sendJson(response, marketsDto());
    return;
  }

  if (request.method === "GET" && path === "/v1/loans") {
    sendJson(response, loansDto());
    return;
  }

  if (request.method === "GET" && path.startsWith("/v1/books/")) {
    sendJson(response, bookDto(path.includes("/NO") ? "NO" : "YES"));
    return;
  }

  if (request.method === "GET" && path === "/v1/trades") {
    sendJson(response, tradesDto(url.searchParams.get("outcome") === "NO" ? "NO" : "YES"));
    return;
  }

  if (request.method === "GET" && path === "/v1/orders") {
    sendJson(response, ordersDto(url.searchParams.get("status")));
    return;
  }

  if (request.method === "GET" && path === "/v1/reservations") {
    sendJson(response, reservationsDto(url.searchParams.get("maker") ?? maker));
    return;
  }

  if (request.method === "GET" && path === "/v1/loan-positions") {
    sendJson(response, loanPositionsDto());
    return;
  }

  if (request.method === "POST" && path === "/v1/orders") {
    await readBody(request);
    sendJson(response, {
      orderHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      status: "LIVE",
      remainingOutcomeAmount: "10000000",
      pendingMatchedOutcomeAmount: "0",
      availableForMatching: "10000000",
      isPartiallyFilled: false,
      priceUnits: 610000,
      createdTradeIds: [],
      rested: true,
    });
    broadcastBookUpdate();
    return;
  }

  if (request.method === "POST" && path.endsWith("/cancel")) {
    await readBody(request);
    const orderHash = path.split("/")[3] ?? "0x";
    sendJson(response, {
      orderHash,
      status: "CANCELLED",
      cancelledAvailableOutcomeAmount: "10000000",
      pendingMatchedOutcomeAmount: "0",
    });
    broadcastBookUpdate();
    return;
  }

  sendJson(response, { error: { message: "Demo route not found." } }, 404);
});

const webSocketServer = new WebSocketServer({ noServer: true });
const sockets = new Set<WebSocket>();

server.on("upgrade", (request, socket, head) => {
  if ((request.url ?? "").split("?")[0] !== "/v1/ws") {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

webSocketServer.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("message", () => {
    socket.send(JSON.stringify({ type: "book_snapshot" }));
    socket.send(JSON.stringify({ type: "best_bid_ask" }));
  });
  socket.on("close", () => sockets.delete(socket));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Demo CLOB API listening on http://127.0.0.1:${port}`);
});

function applyCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function healthDto(): unknown {
  return {
    status: "ok",
    service: "clob-backend",
    timestamp: new Date().toISOString(),
    chainId: 5042002,
    contracts: {
      loanPositionToken: addresses.loanPositionToken,
      outcomeExchange: addresses.outcomeExchange,
      usdc: addresses.usdc,
    },
    executorEnabled: false,
    confirmationDepth: "1",
    sync: {
      status: "ok",
      cursorName: "outcome-exchange-events",
      latestBlock: "18420",
      safeHeadBlock: "18419",
      lastIndexedBlock: "18418",
      lagBlocks: "1",
    },
  };
}

function marketsDto(): unknown {
  return {
    markets: [
      {
        outcomeToken: addresses.outcomeToken,
        marketId,
        clobEnabled: true,
        defaultTickUnits: "10000",
        edgeTickUnits: "1000",
        lowerEdgePriceUnits: "100000",
        upperEdgePriceUnits: "900000",
        minOrderOutcomeAmount: "1000000",
        maxOrderOutcomeAmount: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        yesBestBid: { priceUnits: 590000, totalRemainingOutcomeAmount: "220000000" },
        yesBestAsk: { priceUnits: 610000, totalRemainingOutcomeAmount: "180000000" },
        confirmedUsdcVolume: "1450000000",
        loan: {
          loanId: "1",
          borrower: "0x0000000000000000000000000000000000001001",
          principal: "1000000000",
          repaymentAmount: "1050000000",
          state: "ACTIVE",
          activationDeadline: "1780003600",
          repaymentDeadline: "1782595600",
        },
      },
    ],
  };
}

function loansDto(): unknown {
  return {
    loans: [
      {
        loanId: "1",
        borrower: "0x0000000000000000000000000000000000001001",
        principal: "1000000000",
        repaymentAmount: "1050000000",
        loanWithdrawFreezeDeadline: "1780000000",
        activationDeadline: "1780003600",
        repaymentDeadline: "1782595600",
        fundedAmount: "1000000000",
        creditedAmount: "420000000",
        repaymentSatisfiedAt: "0",
        feeClaimedAmount: "0",
        state: "ACTIVE",
        interestBps: "500",
        feeBps: "50",
        feeRecipient: "0x0000000000000000000000000000000000002001",
        collateralBps: "10000",
        borrowerCollateralAmount: "1000000000",
        borrowerCollateralDepositedAmount: "1000000000",
        marketId,
      },
      {
        loanId: "2",
        borrower: "0x0000000000000000000000000000000000001002",
        principal: "750000000",
        repaymentAmount: "787500000",
        loanWithdrawFreezeDeadline: "1780400000",
        activationDeadline: "1780500000",
        repaymentDeadline: "1783000000",
        fundedAmount: "530000000",
        creditedAmount: "0",
        repaymentSatisfiedAt: "0",
        feeClaimedAmount: "0",
        state: "FUNDING",
        interestBps: "500",
        feeBps: "50",
        feeRecipient: "0x0000000000000000000000000000000000002001",
        collateralBps: "10000",
        borrowerCollateralAmount: "787500000",
        borrowerCollateralDepositedAmount: "787500000",
        marketId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ],
    nextCursor: null,
  };
}

function bookDto(outcome: "YES" | "NO"): unknown {
  const yesBook = {
    bids: [
      { priceUnits: 590000, totalRemainingOutcomeAmount: "220000000" },
      { priceUnits: 570000, totalRemainingOutcomeAmount: "160000000" },
      { priceUnits: 540000, totalRemainingOutcomeAmount: "90000000" },
    ],
    asks: [
      { priceUnits: 610000, totalRemainingOutcomeAmount: "180000000" },
      { priceUnits: 640000, totalRemainingOutcomeAmount: "125000000" },
      { priceUnits: 680000, totalRemainingOutcomeAmount: "70000000" },
    ],
  };
  const noBook = {
    bids: [
      { priceUnits: 370000, totalRemainingOutcomeAmount: "90000000" },
      { priceUnits: 350000, totalRemainingOutcomeAmount: "130000000" },
    ],
    asks: [
      { priceUnits: 410000, totalRemainingOutcomeAmount: "110000000" },
      { priceUnits: 440000, totalRemainingOutcomeAmount: "80000000" },
    ],
  };

  return {
    outcomeToken: addresses.outcomeToken,
    marketId,
    outcome,
    sequence: "42",
    ...(outcome === "YES" ? yesBook : noBook),
    timestamp: new Date().toISOString(),
  };
}

function tradesDto(outcome: "YES" | "NO"): unknown {
  return {
    trades: [
      {
        tradeId: "3",
        outcomeToken: addresses.outcomeToken,
        marketId,
        outcome,
        totalOutcomeAmount: "25000000",
        totalUsdcAmount: outcome === "YES" ? "15000000" : "9750000",
        status: "CONFIRMED",
        txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        createdAt: "2026-07-23T11:30:00.000Z",
        confirmedAt: "2026-07-23T11:30:04.000Z",
      },
    ],
    nextCursor: null,
  };
}

type DemoOrderDto = ReturnType<typeof orderDto>;

function ordersDto(status: string | null): unknown {
  return {
    orders: [
      orderDto({
        orderHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        side: "SELL",
        outcome: "YES",
        priceUnits: 610000,
        remainingOutcomeAmount: "180000000",
        status: status === "CANCELLED" ? "CANCELLED" : "LIVE",
      }),
      orderDto({
        orderHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        side: "BUY",
        outcome: "YES",
        priceUnits: 590000,
        remainingOutcomeAmount: "220000000",
        status: "LIVE",
      }),
    ].filter((order) => status === null || order.status === status),
    nextCursor: null,
  };
}

function orderDto(input: {
  orderHash: string;
  side: "BUY" | "SELL";
  outcome: "YES" | "NO";
  priceUnits: number;
  remainingOutcomeAmount: string;
  status: string;
}): {
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
  timeInForce: "GTC";
  priceUnits: number;
  remainingOutcomeAmount: string;
  pendingMatchedOutcomeAmount: string;
  availableForMatching: string;
  status: string;
  isPartiallyFilled: boolean;
  acceptedSequence: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    orderHash: input.orderHash,
    order: {
      maker,
      outcomeToken: addresses.outcomeToken,
      marketId,
      outcome: input.outcome,
      side: input.side,
      outcomeAmount: input.remainingOutcomeAmount,
      usdcAmount: "109800000",
      expiration: "2099-01-01T00:00:00.000Z",
      nonce: "1",
    },
    signature: `0x${"11".repeat(65)}`,
    timeInForce: "GTC",
    priceUnits: input.priceUnits,
    remainingOutcomeAmount: input.remainingOutcomeAmount,
    pendingMatchedOutcomeAmount: "0",
    availableForMatching: input.remainingOutcomeAmount,
    status: input.status,
    isPartiallyFilled: false,
    acceptedSequence: "1",
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
  };
}

function reservationsDto(account: string): unknown {
  return {
    maker: account,
    reservations: [
      {
        assetType: "ERC20",
        assetAddress: addresses.usdc,
        tokenId: "0",
        reservedAmount: "109800000",
        updatedAt: "2026-07-23T10:01:00.000Z",
      },
    ],
  };
}

function loanPositionsDto(): unknown {
  return {
    positions: [
      {
        positionId: "1",
        loanId: "1",
        principalAmount: "600000000",
        claimedAmount: "0",
        claimableAmount: "0",
        balance: "1",
        split: false,
      },
    ],
    nextCursor: null,
  };
}

async function readBody(request: IncomingMessage): Promise<void> {
  for await (const _ of request) {
    // Drain request body.
  }
}

function broadcastBookUpdate(): void {
  for (const socket of sockets) {
    socket.send(JSON.stringify({ type: "book_delta" }));
    socket.send(JSON.stringify({ type: "best_bid_ask" }));
  }
}
