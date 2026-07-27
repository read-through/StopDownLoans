import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClobError } from "../../../src/clob/errors.js";
import { parseCancelOrderRequest, parseSubmitOrderRequest } from "../../../src/clob/api/parsers.js";

describe("api request parsers", () => {
  it("parses submit order requests into domain values", () => {
    const parsed = parseSubmitOrderRequest({
      order: {
        maker: "0x0000000000000000000000000000000000000001",
        outcomeToken: "0x0000000000000000000000000000000000000002",
        marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "YES",
        side: "BUY",
        outcomeAmount: "100000000",
        usdcAmount: "65000000",
        expiration: "2026-07-21T13:00:00.000Z",
        nonce: "12",
      },
      signature: "0x1234",
      timeInForce: "GTC",
      priceUnits: 650000,
    });

    assert.equal(parsed.order.outcomeAmount, 100_000_000n);
    assert.equal(parsed.order.usdcAmount, 65_000_000n);
    assert.equal(parsed.order.nonce, 12n);
    assert.equal(parsed.priceUnits, 650000n);
    assert.equal(parsed.order.expiration.toISOString(), "2026-07-21T13:00:00.000Z");
  });

  it("parses cancel order requests into domain values", () => {
    const parsed = parseCancelOrderRequest({
      cancel: {
        maker: "0x0000000000000000000000000000000000000001",
        orderHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        expiration: "2026-07-21T13:00:00.000Z",
        nonce: "77",
      },
      signature: "0x1234",
    });

    assert.equal(parsed.cancel.orderHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(parsed.cancel.nonce, 77n);
    assert.equal(parsed.signature, "0x1234");
  });

  it("rejects unsafe numeric amounts", () => {
    assert.throws(
      () =>
        parseSubmitOrderRequest({
          order: {
            maker: "0x0000000000000000000000000000000000000001",
            outcomeToken: "0x0000000000000000000000000000000000000002",
            marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            outcome: "YES",
            side: "BUY",
            outcomeAmount: Number.MAX_SAFE_INTEGER + 1,
            usdcAmount: "65000000",
            expiration: "2026-07-21T13:00:00.000Z",
            nonce: "12",
          },
          signature: "0x1234",
          timeInForce: "GTC",
          priceUnits: 650000,
        }),
      (error) => error instanceof ClobError && error.code === "INVALID_ORDER"
    );
  });
});
