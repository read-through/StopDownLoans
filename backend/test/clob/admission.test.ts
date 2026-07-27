import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ClobError } from "../../src/clob/errors.js";
import { orderTypes, OUTCOME_EXCHANGE_EIP712_NAME, OUTCOME_EXCHANGE_EIP712_VERSION } from "../../src/clob/orderSigning.js";
import type { Hex, MarketConfig, Reservation, SignedOrderInput, SubmitOrderInput } from "../../src/clob/types.js";
import {
  validateOrderAdmission,
  type AdmissionChainReader,
  type AdmissionReservationKey,
  type AdmissionStore,
} from "../../src/clob/admission.js";

const maker = privateKeyToAccount(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);

const domain = {
  chainId: 5042002,
  verifyingContract: "0x3333333333333333333333333333333333333333" as Hex,
};
const usdc = "0x4444444444444444444444444444444444444444" as Hex;

const marketConfig: MarketConfig = {
  outcomeToken: "0x1111111111111111111111111111111111111111",
  marketId: "0x2222222222222222222222222222222222222222222222222222222222222222",
  clobEnabled: true,
  defaultTickUnits: 10_000n,
  edgeTickUnits: 1_000n,
  lowerEdgePriceUnits: 100_000n,
  upperEdgePriceUnits: 900_000n,
  minOrderOutcomeAmount: null,
  maxOrderOutcomeAmount: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("validateOrderAdmission", () => {
  it("accepts a valid BUY order and returns its USDC reservation", async () => {
    const submit = await createSubmitOrder({ side: "BUY" });
    const result = await validateOrderAdmission(createInput(submit));

    assert.equal(result.reservationKey.assetType, "ERC20");
    assert.equal(result.reservationKey.assetAddress, usdc);
    assert.equal(result.reservationKey.tokenId, 0n);
    assert.equal(result.reservationAmount, 65_000_000n);
  });

  it("rejects duplicate backend orders", async () => {
    const submit = await createSubmitOrder({ side: "BUY" });
    const input = createInput(submit, {
      store: {
        existingOrder: {} as never,
      },
    });

    await assertClobRejects(
      () => validateOrderAdmission(input),
      "DUPLICATE_ORDER"
    );
  });

  it("rejects BUY orders when existing reservations consume available USDC", async () => {
    const submit = await createSubmitOrder({ side: "BUY" });
    const input = createInput(submit, {
      store: {
        reservationAmount: 50_000_000n,
      },
    });

    await assertClobRejects(
      () => validateOrderAdmission(input),
      "INSUFFICIENT_AVAILABLE_BALANCE"
    );
  });

  it("accepts a valid SELL order and returns its ERC-1155 reservation", async () => {
    const submit = await createSubmitOrder({ side: "SELL" });
    const result = await validateOrderAdmission(createInput(submit));

    assert.equal(result.reservationKey.assetType, "ERC1155");
    assert.equal(result.reservationKey.assetAddress, submit.order.outcomeToken);
    assert.equal(result.reservationKey.tokenId, 777n);
    assert.equal(result.reservationAmount, 100_000_000n);
  });

  it("rejects SELL orders without ERC-1155 approval", async () => {
    const submit = await createSubmitOrder({ side: "SELL" });
    const input = createInput(submit, {
      chain: {
        erc1155Approved: false,
      },
    });

    await assertClobRejects(
      () => validateOrderAdmission(input),
      "INSUFFICIENT_BALANCE_OR_ALLOWANCE"
    );
  });

  it("rejects expired orders", async () => {
    const submit = await createSubmitOrder({
      side: "BUY",
      expiration: new Date(1_800_000_000_000),
    });
    const input = createInput(submit, {
      now: new Date(1_800_000_001_000),
    });

    await assertClobRejects(
      () => validateOrderAdmission(input),
      "ORDER_EXPIRED"
    );
  });
});

async function createSubmitOrder(overrides: {
  side: SignedOrderInput["side"];
  expiration?: Date;
}): Promise<SubmitOrderInput> {
  const order: SignedOrderInput = {
    maker: maker.address,
    outcomeToken: marketConfig.outcomeToken,
    marketId: marketConfig.marketId,
    outcome: "YES",
    side: overrides.side,
    outcomeAmount: 100_000_000n,
    usdcAmount: 65_000_000n,
    expiration: overrides.expiration ?? new Date(1_800_000_000_000),
    nonce: 12n,
  };
  const signature = await maker.signTypedData({
    domain: {
      name: OUTCOME_EXCHANGE_EIP712_NAME,
      version: OUTCOME_EXCHANGE_EIP712_VERSION,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    types: orderTypes,
    primaryType: "Order",
    message: {
      maker: order.maker,
      outcomeToken: order.outcomeToken,
      marketId: order.marketId,
      outcome: 0,
      side: overrides.side === "BUY" ? 0 : 1,
      outcomeAmount: order.outcomeAmount,
      usdcAmount: order.usdcAmount,
      expiration: BigInt(Math.floor(order.expiration.getTime() / 1000)),
      nonce: order.nonce,
    },
  });

  return {
    order,
    signature,
    timeInForce: "GTC",
    priceUnits: 650_000n,
  };
}

function createInput(
  submit: SubmitOrderInput,
  overrides: {
    now?: Date;
    store?: {
      existingOrder?: Awaited<ReturnType<AdmissionStore["getExistingOrder"]>>;
      reservationAmount?: bigint;
    };
    chain?: {
      erc1155Approved?: boolean;
    };
  } = {}
) {
  const store: AdmissionStore = {
    async getExistingOrder() {
      return overrides.store?.existingOrder ?? null;
    },
    async getMarketConfig() {
      return marketConfig;
    },
    async getReservation(key: AdmissionReservationKey) {
      if (overrides.store?.reservationAmount === undefined) {
        return null;
      }

      return {
        maker: key.maker,
        assetType: key.assetType,
        assetAddress: key.assetAddress,
        tokenId: key.tokenId,
        reservedAmount: overrides.store.reservationAmount,
        updatedAt: new Date(0),
      } satisfies Reservation;
    },
  };
  const chain: AdmissionChainReader = {
    async isOutcomeMarketActive() {
      return true;
    },
    async getOutcomeTokenId() {
      return 777n;
    },
    async getFilledAmount() {
      return 0n;
    },
    async getErc20Balance() {
      return 100_000_000n;
    },
    async getErc20Allowance() {
      return 100_000_000n;
    },
    async getErc1155Balance() {
      return 100_000_000n;
    },
    async isErc1155ApprovedForAll() {
      return overrides.chain?.erc1155Approved ?? true;
    },
  };

  return {
    submit,
    domain,
    usdc,
    outcomeExchange: domain.verifyingContract,
    now: overrides.now ?? new Date(1_700_000_000_000),
    store,
    chain,
  };
}

async function assertClobRejects(
  fn: () => Promise<unknown>,
  code: ClobError["code"]
): Promise<void> {
  await assert.rejects(
    fn,
    (error) => error instanceof ClobError && error.code === code
  );
}
