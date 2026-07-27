import { createPublicClient, createWalletClient, http, webSocket, type Chain, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "../types.js";

export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
  },
} as const satisfies Chain;

export function createArcPublicClient(options: {
  rpcUrl?: string;
  useWebSocket?: boolean;
} = {}): PublicClient {
  const rpcUrl = options.rpcUrl ?? arcTestnet.rpcUrls.default.http[0];
  const transport = options.useWebSocket ? webSocket(rpcUrl) : http(rpcUrl);

  return createPublicClient({
    chain: arcTestnet,
    transport,
  });
}

export function createArcWalletClient(options: {
  privateKey: Hex;
  rpcUrl?: string;
}): WalletClient {
  const account = privateKeyToAccount(options.privateKey);

  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(options.rpcUrl ?? arcTestnet.rpcUrls.default.http[0]),
  });
}
