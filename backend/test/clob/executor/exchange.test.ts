import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { submitMatchOrders } from "../../../src/clob/executor/exchange.js";
import type { MatchOrdersArgs } from "../../../src/clob/executor/calldata.js";
import type { Hex } from "../../../src/clob/types.js";

describe("submitMatchOrders", () => {
  it("uses the local executor account for wallet submission after simulation", async () => {
    const localExecutor = "0x1111111111111111111111111111111111111111";
    const operatorAddress = "0x2222222222222222222222222222222222222222";
    let simulatedAccount: unknown;
    let submittedAccount: unknown;

    const publicClient = {
      async simulateContract(request: { account: unknown }) {
        simulatedAccount = request.account;
        return {
          request: {
            address: "0x3333333333333333333333333333333333333333",
            abi: [],
            functionName: "matchOrders",
            args: [],
            account: operatorAddress,
          },
        };
      },
    };
    const walletClient = {
      account: localExecutor,
      async writeContract(request: { account: unknown }) {
        submittedAccount = request.account;
        return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
      },
    };

    const txHash = await submitMatchOrders({
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      outcomeExchange: "0x3333333333333333333333333333333333333333",
      operator: operatorAddress,
      args: emptyMatchOrdersArgs(),
    });

    assert.equal(txHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(simulatedAccount, operatorAddress);
    assert.equal(submittedAccount, localExecutor);
  });
});

function emptyMatchOrdersArgs(): MatchOrdersArgs {
  return {
    takerOrder: {
      maker: "0x4444444444444444444444444444444444444444",
      outcomeToken: "0x5555555555555555555555555555555555555555",
      marketId: "0x6666666666666666666666666666666666666666666666666666666666666666",
      outcome: 0,
      side: 0,
      outcomeAmount: 1n,
      usdcAmount: 1n,
      expiration: 1n,
      nonce: 1n,
    },
    takerSignature: "0x77",
    makerOrders: [],
    makerSignatures: [],
    makerFillAmounts: [],
  };
}
