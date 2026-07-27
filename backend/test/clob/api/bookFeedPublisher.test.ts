import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { BookFeedPublisher, serializeBookFeedKey } from "../../../src/clob/api/bookFeedPublisher.js";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  readonly sent: string[] = [];

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

describe("serializeBookFeedKey", () => {
  it("normalizes address and market id casing", () => {
    assert.equal(
      serializeBookFeedKey({
        outcomeToken: "0x000000000000000000000000000000000000dEaD",
        marketId: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        outcome: "YES",
      }),
      serializeBookFeedKey({
        outcomeToken: "0x000000000000000000000000000000000000dead",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
      })
    );
  });

  it("publishes market-level config events to every subscribed outcome for that market", () => {
    const publisher = new BookFeedPublisher({
      now: () => new Date("2026-07-21T12:00:00.000Z"),
    });
    const yesSocket = new FakeSocket();
    const noSocket = new FakeSocket();
    const otherMarketSocket = new FakeSocket();
    const key = {
      outcomeToken: "0x0000000000000000000000000000000000000002" as const,
      marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    };

    publisher.subscribe(yesSocket as never, {
      ...key,
      outcome: "YES",
    });
    publisher.subscribe(noSocket as never, {
      ...key,
      outcome: "NO",
    });
    publisher.subscribe(otherMarketSocket as never, {
      outcomeToken: key.outcomeToken,
      marketId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      outcome: "YES",
    });

    publisher.publishMarketOpened(key);
    publisher.publishTickSizeChange({
      ...key,
      defaultTickUnits: 10_000n,
      edgeTickUnits: 1_000n,
      lowerEdgePriceUnits: 100_000n,
      upperEdgePriceUnits: 900_000n,
    });
    publisher.publishMarketClosed(key);

    assert.deepEqual(
      yesSocket.sent.map((message) => JSON.parse(message).type),
      ["market_opened", "tick_size_change", "market_closed"]
    );
    assert.deepEqual(
      noSocket.sent.map((message) => JSON.parse(message).type),
      ["market_opened", "tick_size_change", "market_closed"]
    );
    assert.deepEqual(otherMarketSocket.sent, []);
  });
});
