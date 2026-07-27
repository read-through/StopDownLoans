import { privateKeyToAccount } from "viem/accounts";
import { expectedArcChainIdHex } from "../../frontend/src/config";
import type { EthereumProvider } from "../../frontend/src/wallet";

const MOCK_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f094538b8d04d1a531b8e93f6040f9f45e7f6b2a";
const mockAccount = privateKeyToAccount(MOCK_PRIVATE_KEY);
const minedTransactions = new Set<string>();

export const mockWalletAddress = mockAccount.address;

export const mockWalletProvider: EthereumProvider = {
  async request(params) {
    if (params.method === "eth_accounts" || params.method === "eth_requestAccounts") {
      return [mockAccount.address];
    }

    if (params.method === "eth_chainId") {
      return expectedArcChainIdHex;
    }

    if (params.method === "eth_sendTransaction") {
      const txHash = makeMockTransactionHash();
      minedTransactions.add(txHash);
      return txHash;
    }

    if (params.method === "eth_getTransactionReceipt") {
      const [txHash] = params.params ?? [];
      if (typeof txHash !== "string" || !minedTransactions.has(txHash)) {
        return null;
      }

      return {
        transactionHash: txHash,
        status: "0x1",
        blockNumber: "0x1",
      };
    }

    if (params.method === "eth_call") {
      return handleMockEthCall(params.params);
    }

    if (params.method === "eth_signTypedData_v4") {
      const [, typedDataJson] = params.params ?? [];
      if (typeof typedDataJson !== "string") {
        throw new Error("Mock wallet expected EIP-712 typed data JSON.");
      }

      const typedData = JSON.parse(typedDataJson) as {
        domain: Record<string, unknown>;
        types: Record<string, Array<{ name: string; type: string }>>;
        primaryType: string;
        message: Record<string, unknown>;
      };

      return mockAccount.signTypedData({
        domain: typedData.domain,
        types: withoutEip712Domain(typedData.types),
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
    }

    throw new Error(`Mock wallet does not implement ${params.method}.`);
  },
};

function handleMockEthCall(params: unknown[] | undefined): string {
  const [transaction] = params ?? [];
  if (typeof transaction !== "object" || transaction === null || Array.isArray(transaction)) {
    throw new Error("Mock eth_call expected a transaction object.");
  }

  const data = String((transaction as { data?: unknown }).data ?? "").toLowerCase();
  const selector = data.slice(0, 10);

  if (
    selector === "0x70a08231" ||
    selector === "0xdd62ed3e" ||
    selector === "0x00fdd58e" ||
    selector === "0xc89d359b" ||
    selector === "0x2fd1fa3b" ||
    selector === "0x1d466787" ||
    selector === "0xc1fa004e"
  ) {
    return encodeUint256(1_000_000_000n);
  }

  if (selector === "0xe985e9c5") {
    return encodeUint256(1n);
  }

  if (selector === "0xc64198d3") {
    return `0x${[
      encodeWord(1n),
      encodeAddressWord(mockAccount.address),
      encodeWord(1_050_000n),
      encodeWord(1_050_000n),
      encodeWord(0n),
      encodeWord(1n),
      encodeWord(11n),
      encodeWord(12n),
    ].join("")}`;
  }

  return encodeUint256(0n);
}

function withoutEip712Domain(types: Record<string, Array<{ name: string; type: string }>>) {
  const { EIP712Domain: _ignored, ...rest } = types;
  return rest;
}

function makeMockTransactionHash(): string {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(random, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function encodeUint256(value: bigint): string {
  return `0x${encodeWord(value)}`;
}

function encodeWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function encodeAddressWord(address: string): string {
  return address.slice(2).padStart(64, "0");
}
