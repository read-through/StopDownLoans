import type { CancelOrderPayload, SubmitOrderPayload } from "./api";
import { expectedArcChainIdNumber, frontendContracts } from "./config";
import type { EthereumProvider, WalletAccount } from "./wallet";

type OrderSide = "BUY" | "SELL";
type Outcome = "YES" | "NO";
type TimeInForce = "GTC" | "FAK";

export type OrderAmountPreview = {
  priceUnits: bigint;
  outcomeAmount: bigint;
  usdcAmount: bigint;
};

export function previewOrderAmounts(params: {
  price: string;
  outcomeAmount: string;
}): OrderAmountPreview {
  const priceUnits = parseDecimalUnits(params.price, "price");
  const outcomeAmount = parseDecimalUnits(params.outcomeAmount, "outcome amount");
  return {
    priceUnits,
    outcomeAmount,
    usdcAmount: getExactUsdcAmount(priceUnits, outcomeAmount),
  };
}

export function buildUnsignedOrder(params: {
  account: WalletAccount;
  outcomeToken: string;
  marketId: string;
  outcome: Outcome;
  side: OrderSide;
  price: string;
  outcomeAmount: string;
  timeInForce: TimeInForce;
  expirationMinutes: string;
}): Omit<SubmitOrderPayload, "signature"> {
  const preview = previewOrderAmounts(params);
  const expiration = new Date(Date.now() + parsePositiveInteger(params.expirationMinutes, "expiration minutes") * 60_000);
  const apiPriceUnits = Number(preview.priceUnits);
  if (!Number.isSafeInteger(apiPriceUnits)) {
    throw new Error("price is too large.");
  }

  return {
    order: {
      maker: params.account.address,
      outcomeToken: params.outcomeToken,
      marketId: params.marketId,
      outcome: params.outcome,
      side: params.side,
      outcomeAmount: preview.outcomeAmount.toString(),
      usdcAmount: preview.usdcAmount.toString(),
      expiration: expiration.toISOString(),
      nonce: makeNonce().toString(),
    },
    timeInForce: params.timeInForce,
    priceUnits: apiPriceUnits,
  };
}

export async function signOrder(
  provider: EthereumProvider,
  unsignedOrder: Omit<SubmitOrderPayload, "signature">
): Promise<SubmitOrderPayload> {
  if (frontendContracts.outcomeExchange === null) {
    throw new Error("VITE_OUTCOME_EXCHANGE_ADDRESS is not configured.");
  }

  const typedData = {
    domain: {
      name: "StopDownOutcomeExchange",
      version: "1",
      chainId: expectedArcChainIdNumber,
      verifyingContract: frontendContracts.outcomeExchange,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
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
    },
    primaryType: "Order",
    message: {
      ...unsignedOrder.order,
      outcome: unsignedOrder.order.outcome === "YES" ? 0 : 1,
      side: unsignedOrder.order.side === "BUY" ? 0 : 1,
      expiration: Math.floor(new Date(unsignedOrder.order.expiration).getTime() / 1000).toString(),
    },
  };

  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [unsignedOrder.order.maker, JSON.stringify(typedData)],
  });

  if (typeof signature !== "string" || !/^0x[a-fA-F0-9]+$/.test(signature)) {
    throw new Error("Wallet returned an invalid signature.");
  }

  return {
    ...unsignedOrder,
    signature,
  };
}

export function buildUnsignedCancel(params: {
  account: WalletAccount;
  orderHash: string;
}): Omit<CancelOrderPayload, "signature"> {
  return {
    cancel: {
      maker: params.account.address,
      orderHash: params.orderHash,
      expiration: new Date(Date.now() + 5 * 60_000).toISOString(),
      nonce: makeNonce().toString(),
    },
  };
}

export async function signCancelOrder(
  provider: EthereumProvider,
  unsignedCancel: Omit<CancelOrderPayload, "signature">
): Promise<CancelOrderPayload> {
  if (frontendContracts.outcomeExchange === null) {
    throw new Error("VITE_OUTCOME_EXCHANGE_ADDRESS is not configured.");
  }

  const typedData = {
    domain: {
      name: "StopDownOutcomeExchange",
      version: "1",
      chainId: expectedArcChainIdNumber,
      verifyingContract: frontendContracts.outcomeExchange,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      CancelOrder: [
        { name: "maker", type: "address" },
        { name: "orderHash", type: "bytes32" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "CancelOrder",
    message: {
      ...unsignedCancel.cancel,
      expiration: Math.floor(new Date(unsignedCancel.cancel.expiration).getTime() / 1000).toString(),
    },
  };

  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [unsignedCancel.cancel.maker, JSON.stringify(typedData)],
  });

  if (typeof signature !== "string" || !/^0x[a-fA-F0-9]+$/.test(signature)) {
    throw new Error("Wallet returned an invalid signature.");
  }

  return {
    ...unsignedCancel,
    signature,
  };
}

function parseDecimalUnits(value: string, fieldName: string): bigint {
  const trimmed = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a positive decimal with at most 6 decimals.`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const parsed = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (parsed <= 0n) {
    throw new Error(`${fieldName} must be positive.`);
  }

  return parsed;
}

function getExactUsdcAmount(priceUnits: bigint, outcomeAmount: bigint): bigint {
  const product = priceUnits * outcomeAmount;
  if (product % 1_000_000n !== 0n) {
    throw new Error("price * outcome amount must resolve to exact USDC units.");
  }

  return product / 1_000_000n;
}

function parsePositiveInteger(value: string, fieldName: string): number {
  if (!/^[1-9][0-9]*$/.test(value.trim())) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${fieldName} is too large.`);
  }

  return parsed;
}

function makeNonce(): bigint {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return BigInt(Date.now()) * 2n ** 64n + (BigInt(random[0]) << 32n) + BigInt(random[1]);
}
