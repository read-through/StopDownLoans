import { encodeAbiParameters, getAddress, keccak256, hashTypedData, recoverTypedDataAddress, stringToHex } from "viem";
import { ClobError } from "./errors.js";
import type { CancelOrderInput, Hex, SignedOrderInput } from "./types.js";

export const OUTCOME_EXCHANGE_EIP712_NAME = "StopDownOutcomeExchange";
export const OUTCOME_EXCHANGE_EIP712_VERSION = "1";
export const ORDER_TYPEHASH = keccak256(
  stringToHex(
    "Order(address maker,address outcomeToken,bytes32 marketId,uint8 outcome,uint8 side,uint256 outcomeAmount,uint256 usdcAmount,uint256 expiration,uint256 nonce)"
  )
);

export const orderTypes = {
  Order: [
    { name: "maker", type: "address" },
    { name: "outcomeToken", type: "address" },
    { name: "marketId", type: "bytes32" },
    { name: "outcome", type: "uint8" },
    { name: "side", type: "uint8" },
    { name: "outcomeAmount", type: "uint256" },
    { name: "usdcAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const cancelOrderTypes = {
  CancelOrder: [
    { name: "maker", type: "address" },
    { name: "orderHash", type: "bytes32" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type OutcomeExchangeDomain = {
  chainId: number;
  verifyingContract: Hex;
};

export function hashSignedOrder(
  order: SignedOrderInput,
  domain: OutcomeExchangeDomain
): Hex {
  return hashTypedData({
    domain: getTypedDataDomain(domain),
    types: orderTypes,
    primaryType: "Order",
    message: toTypedDataOrder(order),
  });
}

export function hashContractOrder(order: SignedOrderInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        ORDER_TYPEHASH,
        order.maker,
        order.outcomeToken,
        order.marketId,
        order.outcome === "YES" ? 0 : 1,
        order.side === "BUY" ? 0 : 1,
        order.outcomeAmount,
        order.usdcAmount,
        BigInt(Math.floor(order.expiration.getTime() / 1000)),
        order.nonce,
      ]
    )
  );
}

export async function recoverSignedOrderMaker(
  order: SignedOrderInput,
  signature: Hex,
  domain: OutcomeExchangeDomain
): Promise<Hex> {
  const recovered = await recoverTypedDataAddress({
    domain: getTypedDataDomain(domain),
    types: orderTypes,
    primaryType: "Order",
    message: toTypedDataOrder(order),
    signature,
  });

  return getAddress(recovered) as Hex;
}

export async function assertValidOrderSignature(
  order: SignedOrderInput,
  signature: Hex,
  domain: OutcomeExchangeDomain
): Promise<void> {
  const recovered = await recoverSignedOrderMaker(order, signature, domain);

  if (getAddress(recovered) !== getAddress(order.maker)) {
    throw new ClobError("INVALID_SIGNATURE", "Signature does not recover order maker.");
  }
}

export function hashCancelOrder(
  cancel: CancelOrderInput,
  domain: OutcomeExchangeDomain
): Hex {
  return hashTypedData({
    domain: getTypedDataDomain(domain),
    types: cancelOrderTypes,
    primaryType: "CancelOrder",
    message: toTypedDataCancelOrder(cancel),
  });
}

export async function recoverCancelOrderMaker(
  cancel: CancelOrderInput,
  signature: Hex,
  domain: OutcomeExchangeDomain
): Promise<Hex> {
  const recovered = await recoverTypedDataAddress({
    domain: getTypedDataDomain(domain),
    types: cancelOrderTypes,
    primaryType: "CancelOrder",
    message: toTypedDataCancelOrder(cancel),
    signature,
  });

  return getAddress(recovered) as Hex;
}

export async function assertValidCancelOrderSignature(
  cancel: CancelOrderInput,
  signature: Hex,
  domain: OutcomeExchangeDomain
): Promise<void> {
  const recovered = await recoverCancelOrderMaker(cancel, signature, domain);

  if (getAddress(recovered) !== getAddress(cancel.maker)) {
    throw new ClobError("INVALID_SIGNATURE", "Signature does not recover cancel maker.");
  }
}

function getTypedDataDomain(domain: OutcomeExchangeDomain) {
  return {
    name: OUTCOME_EXCHANGE_EIP712_NAME,
    version: OUTCOME_EXCHANGE_EIP712_VERSION,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  } as const;
}

function toTypedDataOrder(order: SignedOrderInput) {
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

function toTypedDataCancelOrder(cancel: CancelOrderInput) {
  return {
    maker: cancel.maker,
    orderHash: cancel.orderHash,
    expiration: BigInt(Math.floor(cancel.expiration.getTime() / 1000)),
    nonce: cancel.nonce,
  };
}
