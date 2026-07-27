import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeMarketConfigsCursor,
  decodeOrdersCursor,
  decodeTradesCursor,
  encodeCursor,
} from "../../../src/clob/api/cursors.js";

describe("api cursors", () => {
  it("round-trips orders cursor", () => {
    const cursor = encodeCursor({
      createdAt: "2026-07-21T12:00:00.000Z",
      acceptedSequence: "42",
    });

    assert.deepEqual(decodeOrdersCursor(cursor), {
      createdAt: "2026-07-21T12:00:00.000Z",
      acceptedSequence: "42",
    });
  });

  it("round-trips trades cursor", () => {
    const cursor = encodeCursor({
      createdAt: "2026-07-21T12:00:00.000Z",
      tradeId: "123",
    });

    assert.deepEqual(decodeTradesCursor(cursor), {
      createdAt: "2026-07-21T12:00:00.000Z",
      tradeId: "123",
    });
  });

  it("round-trips market configs cursor", () => {
    const cursor = encodeCursor({
      updatedAt: "2026-07-21T12:00:00.000Z",
      outcomeToken: "0x0000000000000000000000000000000000000001",
      marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    assert.deepEqual(decodeMarketConfigsCursor(cursor), {
      updatedAt: "2026-07-21T12:00:00.000Z",
      outcomeToken: "0x0000000000000000000000000000000000000001",
      marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  it("rejects malformed cursors", () => {
    assert.throws(() => decodeOrdersCursor("not-base64"));
  });
});
