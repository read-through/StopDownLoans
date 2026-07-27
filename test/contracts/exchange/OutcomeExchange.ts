import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { buildMatchOrdersArgs } from "../../../backend/src/clob/executor/calldata.js";
import { hashContractOrder } from "../../../backend/src/clob/orderSigning.js";
import type { ClobOrder, Hex, SignedOrderInput, TradeFill } from "../../../backend/src/clob/types.js";

const { viem, networkHelpers } = await network.create();

const units = (amount: bigint) => amount * 1_000_000n;

const orderTypes = {
  Order: [
    { name: "maker", type: "address" },
    { name: "outcomeToken", type: "address" },
    { name: "marketId", type: "bytes32" },
    { name: "outcome", type: "uint8" },
    { name: "side", type: "uint8" },
    { name: "outcomeAmount", type: "uint256" },
    { name: "usdcAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" }
  ]
} as const;

describe("OutcomeExchange", function () {
  async function deployExchangeFixture() {
    const [admin, sellerA, sellerB, buyer, operator, outsider] = await viem.getWalletClients();
    const collateralToken = await viem.deployContract("MockUSDC");
    const outcomeToken = await viem.deployContract("OutcomeToken", [
      admin.account.address,
      collateralToken.address,
      ""
    ]);
    const exchange = await viem.deployContract("OutcomeExchange", [
      collateralToken.address,
      admin.account.address
    ]);
    const now = await networkHelpers.time.latest();
    const marketId = `0x${"ab".repeat(32)}` as `0x${string}`;
    const collateralAmount = units(1000n);

    await outcomeToken.write.createProtoMarket([
      1n,
      sellerA.account.address,
      collateralAmount,
      marketId
    ], { account: admin.account });

    await collateralToken.write.mint([sellerA.account.address, collateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, collateralAmount], { account: sellerA.account });
    await outcomeToken.write.depositBorrowerCollateral([marketId, collateralAmount], { account: sellerA.account });
    await outcomeToken.write.activateMarket([marketId], { account: admin.account });

    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);
    await outcomeToken.write.safeTransferFrom([
      sellerA.account.address,
      sellerB.account.address,
      yesTokenId,
      units(300n),
      "0x"
    ], { account: sellerA.account });
    await exchange.write.setOperator([operator.account.address, true], { account: admin.account });

    return {
      collateralToken,
      outcomeToken,
      exchange,
      admin,
      sellerA,
      sellerB,
      buyer,
      operator,
      outsider,
      marketId,
      yesTokenId,
      now
    };
  }

  async function signOrder(exchange: any, signer: any, order: any) {
    const chainId = await viem.getPublicClient().then((client) => client.getChainId());

    return signer.signTypedData({
      domain: {
        name: "StopDownOutcomeExchange",
        version: "1",
        chainId,
        verifyingContract: exchange.address
      },
      types: orderTypes,
      primaryType: "Order",
      message: order
    });
  }

  function toBackendOrder(order: any): SignedOrderInput {
    return {
      maker: order.maker,
      outcomeToken: order.outcomeToken,
      marketId: order.marketId,
      outcome: order.outcome === 0 ? "YES" : "NO",
      side: order.side === 0 ? "BUY" : "SELL",
      outcomeAmount: order.outcomeAmount,
      usdcAmount: order.usdcAmount,
      expiration: new Date(Number(order.expiration) * 1000),
      nonce: order.nonce
    };
  }

  function toClobOrder(order: any, signature: Hex): ClobOrder {
    const backendOrder = toBackendOrder(order);

    return {
      ...backendOrder,
      orderHash: hashContractOrder(backendOrder),
      signature,
      timeInForce: "GTC",
      remainingOutcomeAmount: backendOrder.outcomeAmount,
      pendingMatchedOutcomeAmount: 0n,
      status: "LIVE",
      acceptedSequence: 1n,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };
  }

  function tradeFill(overrides: {
    takerOrderHash: Hex;
    makerOrderHash: Hex;
    makerFillAmount: bigint;
    makerUsdcAmount: bigint;
  }): TradeFill {
    return {
      tradeFillId: 1n,
      tradeId: 1n,
      takerOrderHash: overrides.takerOrderHash,
      makerOrderHash: overrides.makerOrderHash,
      makerFillAmount: overrides.makerFillAmount,
      makerUsdcAmount: overrides.makerUsdcAmount,
      makerPriceNumerator: overrides.makerUsdcAmount,
      makerPriceDenominator: overrides.makerFillAmount,
      createdAt: new Date(0)
    };
  }

  it("uses the same order hash on-chain and in the backend", async function () {
    const { outcomeToken, exchange, buyer, marketId, now } = await deployExchangeFixture();
    const order = {
      maker: buyer.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 0,
      outcomeAmount: units(150n),
      usdcAmount: units(105n),
      expiration: BigInt(now + networkHelpers.time.duration.days(1)),
      nonce: 1n
    };

    assert.equal(await exchange.read.hashOrder([order]), hashContractOrder(toBackendOrder(order)));
  });

  it("executes matchOrders with calldata built by the backend", async function () {
    const { collateralToken, outcomeToken, exchange, sellerA, buyer, operator, marketId, yesTokenId, now } =
      await deployExchangeFixture();
    const expiration = BigInt(now + networkHelpers.time.duration.days(1));
    const takerOrder = {
      maker: buyer.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 0,
      outcomeAmount: units(100n),
      usdcAmount: units(70n),
      expiration,
      nonce: 21n
    };
    const makerOrder = {
      maker: sellerA.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 1,
      outcomeAmount: units(100n),
      usdcAmount: units(60n),
      expiration,
      nonce: 22n
    };
    const taker = toClobOrder(takerOrder, await signOrder(exchange, buyer, takerOrder));
    const maker = toClobOrder(makerOrder, await signOrder(exchange, sellerA, makerOrder));
    const args = buildMatchOrdersArgs({
      taker,
      makers: [maker],
      fills: [
        tradeFill({
          takerOrderHash: taker.orderHash,
          makerOrderHash: maker.orderHash,
          makerFillAmount: units(40n),
          makerUsdcAmount: units(24n)
        })
      ]
    });

    await collateralToken.write.mint([buyer.account.address, units(70n)]);
    await collateralToken.write.approve([exchange.address, units(70n)], { account: buyer.account });
    await outcomeToken.write.setApprovalForAll([exchange.address, true], { account: sellerA.account });

    await exchange.write.matchOrders([
      args.takerOrder,
      args.takerSignature,
      args.makerOrders,
      args.makerSignatures,
      args.makerFillAmounts
    ], { account: operator.account });

    assert.equal(await exchange.read.filledAmounts([taker.orderHash]), units(40n));
    assert.equal(await exchange.read.filledAmounts([maker.orderHash]), units(40n));
    assert.equal(await outcomeToken.read.balanceOf([buyer.account.address, yesTokenId]), units(40n));
    assert.equal(await collateralToken.read.balanceOf([sellerA.account.address]), units(24n));
  });

  it("lets an operator match one signed taker against multiple signed makers", async function () {
    const { collateralToken, outcomeToken, exchange, sellerA, sellerB, buyer, operator, marketId, yesTokenId, now } =
      await deployExchangeFixture();
    const expiration = BigInt(now + networkHelpers.time.duration.days(1));
    const takerOrder = {
      maker: buyer.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 0,
      outcomeAmount: units(150n),
      usdcAmount: units(105n),
      expiration,
      nonce: 1n
    };
    const makerOrderA = {
      maker: sellerA.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 1,
      outcomeAmount: units(40n),
      usdcAmount: units(24n),
      expiration,
      nonce: 2n
    };
    const makerOrderB = {
      maker: sellerB.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 1,
      outcomeAmount: units(100n),
      usdcAmount: units(65n),
      expiration,
      nonce: 3n
    };
    const takerSignature = await signOrder(exchange, buyer, takerOrder);
    const makerSignatureA = await signOrder(exchange, sellerA, makerOrderA);
    const makerSignatureB = await signOrder(exchange, sellerB, makerOrderB);
    const takerHash = await exchange.read.hashOrder([takerOrder]);
    const makerHashA = await exchange.read.hashOrder([makerOrderA]);
    const makerHashB = await exchange.read.hashOrder([makerOrderB]);

    await collateralToken.write.mint([buyer.account.address, units(100n)]);
    await collateralToken.write.approve([exchange.address, units(100n)], { account: buyer.account });
    await outcomeToken.write.setApprovalForAll([exchange.address, true], { account: sellerA.account });
    await outcomeToken.write.setApprovalForAll([exchange.address, true], { account: sellerB.account });

    await exchange.write.matchOrders([
      takerOrder,
      takerSignature,
      [makerOrderA, makerOrderB],
      [makerSignatureA, makerSignatureB],
      [units(40n), units(60n)]
    ], { account: operator.account });

    assert.equal(await exchange.read.filledAmounts([takerHash]), units(100n));
    assert.equal(await exchange.read.filledAmounts([makerHashA]), units(40n));
    assert.equal(await exchange.read.filledAmounts([makerHashB]), units(60n));
    assert.equal(await outcomeToken.read.balanceOf([buyer.account.address, yesTokenId]), units(100n));
    assert.equal(await collateralToken.read.balanceOf([sellerA.account.address]), units(24n));
    assert.equal(await collateralToken.read.balanceOf([sellerB.account.address]), units(39n));
    assert.equal(await collateralToken.read.balanceOf([buyer.account.address]), units(37n));
    assert.equal(await collateralToken.read.balanceOf([operator.account.address]), 0n);

    await exchange.write.matchOrders([
      takerOrder,
      takerSignature,
      [makerOrderB],
      [makerSignatureB],
      [units(40n)]
    ], { account: operator.account });

    assert.equal(await exchange.read.filledAmounts([takerHash]), units(140n));
    assert.equal(await exchange.read.filledAmounts([makerHashB]), units(100n));
    assert.equal(await outcomeToken.read.balanceOf([buyer.account.address, yesTokenId]), units(140n));
    assert.equal(await collateralToken.read.balanceOf([sellerB.account.address]), units(65n));
    assert.equal(await collateralToken.read.balanceOf([buyer.account.address]), units(11n));
  });

  it("matches a signed taker sell against a resting buy at the maker price", async function () {
    const { collateralToken, outcomeToken, exchange, sellerA, buyer, operator, marketId, yesTokenId, now } =
      await deployExchangeFixture();
    const expiration = BigInt(now + networkHelpers.time.duration.days(1));
    const takerOrder = {
      maker: sellerA.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 1,
      outcomeAmount: units(100n),
      usdcAmount: units(55n),
      expiration,
      nonce: 4n
    };
    const makerOrder = {
      maker: buyer.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 0,
      outcomeAmount: units(100n),
      usdcAmount: units(60n),
      expiration,
      nonce: 5n
    };

    await collateralToken.write.mint([buyer.account.address, units(60n)]);
    await collateralToken.write.approve([exchange.address, units(60n)], { account: buyer.account });
    await outcomeToken.write.setApprovalForAll([exchange.address, true], { account: sellerA.account });

    await exchange.write.matchOrders([
      takerOrder,
      await signOrder(exchange, sellerA, takerOrder),
      [makerOrder],
      [await signOrder(exchange, buyer, makerOrder)],
      [units(40n)]
    ], { account: operator.account });

    assert.equal(await outcomeToken.read.balanceOf([buyer.account.address, yesTokenId]), units(40n));
    assert.equal(await collateralToken.read.balanceOf([sellerA.account.address]), units(24n));
    assert.equal(await collateralToken.read.balanceOf([buyer.account.address]), units(36n));
  });

  it("restricts matching to owner-authorized operators", async function () {
    const { exchange, admin, operator, outsider } = await deployExchangeFixture();
    const emptyOrder = {
      maker: outsider.account.address,
      outcomeToken: exchange.address,
      marketId: `0x${"00".repeat(32)}` as `0x${string}`,
      outcome: 0,
      side: 0,
      outcomeAmount: 1n,
      usdcAmount: 1n,
      expiration: 1n,
      nonce: 1n
    };

    assert.equal(await exchange.read.operators([operator.account.address]), true);
    await exchange.write.setOperator([operator.account.address, false], { account: admin.account });
    assert.equal(await exchange.read.operators([operator.account.address]), false);

    await assert.rejects(
      exchange.write.matchOrders([emptyOrder, "0x", [], [], []], { account: operator.account })
    );

    await assert.rejects(
      exchange.write.setOperator([outsider.account.address, true], { account: outsider.account })
    );
  });

  it("rejects prices that do not cross", async function () {
    const { outcomeToken, exchange, sellerA, buyer, operator, marketId, now } = await deployExchangeFixture();
    const expiration = BigInt(now + networkHelpers.time.duration.days(1));
    const takerOrder = {
      maker: buyer.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 0,
      outcomeAmount: units(100n),
      usdcAmount: units(55n),
      expiration,
      nonce: 6n
    };
    const makerOrder = {
      maker: sellerA.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 1,
      outcomeAmount: units(100n),
      usdcAmount: units(60n),
      expiration,
      nonce: 7n
    };

    await assert.rejects(
      exchange.write.matchOrders([
        takerOrder,
        await signOrder(exchange, buyer, takerOrder),
        [makerOrder],
        [await signOrder(exchange, sellerA, makerOrder)],
        [units(10n)]
      ], { account: operator.account })
    );
  });

  it("rejects orders for resolved markets", async function () {
    const { outcomeToken, exchange, admin, sellerA, buyer, operator, marketId, now } =
      await deployExchangeFixture();
    const expiration = BigInt(now + networkHelpers.time.duration.days(1));
    const takerOrder = {
      maker: buyer.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 0,
      outcomeAmount: units(100n),
      usdcAmount: units(60n),
      expiration,
      nonce: 8n
    };
    const makerOrder = {
      maker: sellerA.account.address,
      outcomeToken: outcomeToken.address,
      marketId,
      outcome: 0,
      side: 1,
      outcomeAmount: units(100n),
      usdcAmount: units(60n),
      expiration,
      nonce: 9n
    };
    const takerSignature = await signOrder(exchange, buyer, takerOrder);
    const makerSignature = await signOrder(exchange, sellerA, makerOrder);

    await outcomeToken.write.resolveMarket([marketId, 1], { account: admin.account });
    await assert.rejects(
      exchange.write.matchOrders([
        takerOrder,
        takerSignature,
        [makerOrder],
        [makerSignature],
        [units(10n)]
      ], { account: operator.account })
    );
  });
});
