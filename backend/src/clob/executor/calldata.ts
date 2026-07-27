import type { ClobOrder, TradeFill } from "../types.js";

export type ContractOrder = {
  maker: ClobOrder["maker"];
  outcomeToken: ClobOrder["outcomeToken"];
  marketId: ClobOrder["marketId"];
  outcome: 0 | 1;
  side: 0 | 1;
  outcomeAmount: bigint;
  usdcAmount: bigint;
  expiration: bigint;
  nonce: bigint;
};

export type MatchOrdersArgs = {
  takerOrder: ContractOrder;
  takerSignature: ClobOrder["signature"];
  makerOrders: ContractOrder[];
  makerSignatures: ClobOrder["signature"][];
  makerFillAmounts: bigint[];
};

export function buildMatchOrdersArgs(input: {
  taker: ClobOrder;
  makers: ClobOrder[];
  fills: TradeFill[];
}): MatchOrdersArgs {
  if (input.fills.length === 0) {
    throw new Error("Cannot build matchOrders args without fills.");
  }

  const makersByHash = new Map(input.makers.map((maker) => [maker.orderHash, maker]));
  const makerOrders: ContractOrder[] = [];
  const makerSignatures: ClobOrder["signature"][] = [];
  const makerFillAmounts: bigint[] = [];

  for (const fill of input.fills) {
    const maker = makersByHash.get(fill.makerOrderHash);
    if (maker === undefined) {
      throw new Error(`Missing maker order for fill: ${fill.makerOrderHash}`);
    }

    makerOrders.push(toContractOrder(maker));
    makerSignatures.push(maker.signature);
    makerFillAmounts.push(fill.makerFillAmount);
  }

  return {
    takerOrder: toContractOrder(input.taker),
    takerSignature: input.taker.signature,
    makerOrders,
    makerSignatures,
    makerFillAmounts,
  };
}

export function toContractOrder(order: ClobOrder): ContractOrder {
  return {
    maker: order.maker,
    outcomeToken: order.outcomeToken,
    marketId: order.marketId,
    outcome: order.outcome === "YES" ? 0 : 1,
    side: order.side === "BUY" ? 0 : 1,
    outcomeAmount: order.outcomeAmount,
    usdcAmount: order.usdcAmount,
    expiration: BigInt(Math.floor(order.expiration.getTime() / 1000)),
    nonce: order.nonce,
  };
}
