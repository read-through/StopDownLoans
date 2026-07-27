import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ClobError } from "../../src/clob/errors.js";
import {
  assertValidCancelOrderSignature,
  assertValidOrderSignature,
  cancelOrderTypes,
  hashContractOrder,
  hashCancelOrder,
  hashSignedOrder,
  orderTypes,
  OUTCOME_EXCHANGE_EIP712_NAME,
  OUTCOME_EXCHANGE_EIP712_VERSION,
  recoverCancelOrderMaker,
  recoverSignedOrderMaker,
  type OutcomeExchangeDomain,
} from "../../src/clob/orderSigning.js";
import type { CancelOrderInput, SignedOrderInput } from "../../src/clob/types.js";

const maker = privateKeyToAccount(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);
const other = privateKeyToAccount(
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
);

const domain: OutcomeExchangeDomain = {
  chainId: 5042002,
  verifyingContract: "0x3333333333333333333333333333333333333333",
};

const order: SignedOrderInput = {
  maker: maker.address,
  outcomeToken: "0x1111111111111111111111111111111111111111",
  marketId: "0x2222222222222222222222222222222222222222222222222222222222222222",
  outcome: "YES",
  side: "BUY",
  outcomeAmount: 100_000_000n,
  usdcAmount: 65_000_000n,
  expiration: new Date(1_800_000_000_000),
  nonce: 12n,
};

const cancel: CancelOrderInput = {
  maker: maker.address,
  orderHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
  expiration: new Date(1_800_000_000_000),
  nonce: 77n,
};

describe("orderSigning", () => {
  it("hashes the same order deterministically", () => {
    assert.equal(hashSignedOrder(order, domain), hashSignedOrder(order, domain));
  });

  it("separates contract order hash from EIP-712 signature digest", () => {
    assert.equal(hashContractOrder(order), hashContractOrder(order));
    assert.notEqual(hashContractOrder(order), hashSignedOrder(order, domain));
  });

  it("recovers the maker from a valid EIP-712 order signature", async () => {
    const signature = await maker.signTypedData({
      domain: typedDataDomain(),
      types: orderTypes,
      primaryType: "Order",
      message: typedDataMessage(),
    });

    assert.equal(await recoverSignedOrderMaker(order, signature, domain), maker.address);
    await assert.doesNotReject(() => assertValidOrderSignature(order, signature, domain));
  });

  it("rejects a signature from a different account", async () => {
    const signature = await other.signTypedData({
      domain: typedDataDomain(),
      types: orderTypes,
      primaryType: "Order",
      message: typedDataMessage(),
    });

    await assert.rejects(
      () => assertValidOrderSignature(order, signature, domain),
      (error) => error instanceof ClobError && error.code === "INVALID_SIGNATURE"
    );
  });

  it("recovers the maker from a valid EIP-712 cancel signature", async () => {
    const signature = await maker.signTypedData({
      domain: typedDataDomain(),
      types: cancelOrderTypes,
      primaryType: "CancelOrder",
      message: typedDataCancelMessage(),
    });

    assert.equal(hashCancelOrder(cancel, domain), hashCancelOrder(cancel, domain));
    assert.equal(await recoverCancelOrderMaker(cancel, signature, domain), maker.address);
    await assert.doesNotReject(() =>
      assertValidCancelOrderSignature(cancel, signature, domain)
    );
  });

  it("rejects a cancel signature from a different account", async () => {
    const signature = await other.signTypedData({
      domain: typedDataDomain(),
      types: cancelOrderTypes,
      primaryType: "CancelOrder",
      message: typedDataCancelMessage(),
    });

    await assert.rejects(
      () => assertValidCancelOrderSignature(cancel, signature, domain),
      (error) => error instanceof ClobError && error.code === "INVALID_SIGNATURE"
    );
  });
});

function typedDataDomain() {
  return {
    name: OUTCOME_EXCHANGE_EIP712_NAME,
    version: OUTCOME_EXCHANGE_EIP712_VERSION,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  } as const;
}

function typedDataMessage() {
  return {
    maker: order.maker,
    outcomeToken: order.outcomeToken,
    marketId: order.marketId,
    outcome: 0,
    side: 0,
    outcomeAmount: order.outcomeAmount,
    usdcAmount: order.usdcAmount,
    expiration: 1_800_000_000n,
    nonce: order.nonce,
  };
}

function typedDataCancelMessage() {
  return {
    maker: cancel.maker,
    orderHash: cancel.orderHash,
    expiration: 1_800_000_000n,
    nonce: cancel.nonce,
  };
}
