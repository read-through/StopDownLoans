import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import WebSocket from "ws";
import { BookFeedPublisher } from "../../../src/clob/api/bookFeedPublisher.js";
import { attachClobWebSocketFeed } from "../../../src/clob/api/webSocketFeed.js";

describe("attachClobWebSocketFeed", () => {
  it("subscribes and sends an initial book snapshot plus best bid and ask", async () => {
    const server = createServer();
    const publisher = new BookFeedPublisher({
      dbClient: {} as never,
      now: () => new Date("2026-07-21T12:00:00.000Z"),
      loadBookSnapshot: async (_client, params) => ({
        outcomeToken: params.outcomeToken,
        marketId: params.marketId,
        outcome: params.outcome,
        sequence: params.sequence.toString(),
        bids: [{ priceUnits: 640000, totalRemainingOutcomeAmount: "100000000" }],
        asks: [{ priceUnits: 650000, totalRemainingOutcomeAmount: "120000000" }],
        timestamp: params.timestamp.toISOString(),
      }),
    });
    const feed = attachClobWebSocketFeed(server, {
      publisher,
    });
    const { url, closeServer } = await listen(server);

    const socket = new WebSocket(`${url}/v1/ws`);
    await once(socket, "open");
    const messages = collectMessages(socket, 2);
    socket.send(
      JSON.stringify({
        type: "subscribe",
        outcomeToken: "0x000000000000000000000000000000000000dEaD",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
      })
    );

    const [snapshot, best] = await messages;

    assert.equal(snapshot.type, "book_snapshot");
    assert.equal(snapshot.outcomeToken, "0x000000000000000000000000000000000000dEaD");
    assert.equal(snapshot.sequence, "1");
    assert.deepEqual(snapshot.bids, [
      { priceUnits: 640000, totalRemainingOutcomeAmount: "100000000" },
    ]);
    assert.equal(best.type, "best_bid_ask");
    assert.equal(best.sequence, "2");
    assert.deepEqual(best.bestAsk, {
      priceUnits: 650000,
      totalRemainingOutcomeAmount: "120000000",
    });

    socket.close();
    await once(socket, "close");
    await feed.close();
    await closeServer();
  });

  it("returns JSON errors for invalid messages", async () => {
    const server = createServer();
    const feed = attachClobWebSocketFeed(server, {
      publisher: new BookFeedPublisher(),
    });
    const { url, closeServer } = await listen(server);

    const socket = new WebSocket(`${url}/v1/ws`);
    await once(socket, "open");
    socket.send("not-json");

    const [raw] = (await once(socket, "message")) as [Buffer];
    assert.deepEqual(JSON.parse(raw.toString("utf8")), {
      type: "error",
      error: {
        code: "INTERNAL_ERROR",
        message: "WebSocket message must be valid JSON.",
      },
    });

    socket.close();
    await once(socket, "close");
    await feed.close();
    await closeServer();
  });
});

async function listen(server: ReturnType<typeof createServer>): Promise<{
  url: string;
  closeServer: () => Promise<void>;
}> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Expected TCP server address.");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    closeServer: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

function collectMessages(socket: WebSocket, count: number): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve) => {
    const messages: Array<Record<string, unknown>> = [];
    socket.on("message", (raw) => {
      const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      messages.push(parsed);
      if (messages.length === count) {
        resolve(messages);
      }
    });
  });
}
