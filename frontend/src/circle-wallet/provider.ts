import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { arcWalletChain, expectedArcChainIdHex } from "../config";
import type { EthereumProvider } from "../wallet";
import {
  createCircleContractExecutionChallenge,
  createCircleTypedDataChallenge,
  fetchCircleContractExecutionStatus,
} from "./api";
import type { CircleConnectedWallet, CircleWalletSession } from "./types";

export function createCircleWalletProvider(input: {
  sdk: W3SSdk;
  wallet: CircleConnectedWallet;
  session: CircleWalletSession;
}): EthereumProvider {
  return {
    request: async ({ method, params = [] }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [input.wallet.address];
      if (method === "eth_chainId") return expectedArcChainIdHex;
      if (method === "eth_sendTransaction") return sendTransaction(input, params);
      if (method === "eth_signTypedData_v4") return signTypedData(input, params);
      return forwardRpc(method, params);
    },
  };
}

async function sendTransaction(
  input: { sdk: W3SSdk; wallet: CircleConnectedWallet; session: CircleWalletSession },
  params: unknown[],
): Promise<string> {
  const transaction = readTransaction(params[0]);
  if (transaction.from.toLowerCase() !== input.wallet.address.toLowerCase()) {
    throw new Error("Circle transaction sender does not match the connected wallet.");
  }
  const { challengeId } = await createCircleContractExecutionChallenge({
    userToken: input.session.userToken,
    walletId: input.wallet.id,
    contractAddress: transaction.to,
    callData: transaction.data,
  });
  await executeChallenge(input.sdk, challengeId);
  return waitForTransaction(input.session.userToken, challengeId);
}

async function signTypedData(
  input: { sdk: W3SSdk; wallet: CircleConnectedWallet; session: CircleWalletSession },
  params: unknown[],
): Promise<string> {
  const [address, encoded] = params;
  if (typeof address !== "string" || address.toLowerCase() !== input.wallet.address.toLowerCase()) {
    throw new Error("Circle signature account does not match the connected wallet.");
  }
  if (typeof encoded !== "string") throw new Error("EIP-712 payload is invalid.");
  const typedData = JSON.parse(encoded) as unknown;
  const { challengeId } = await createCircleTypedDataChallenge({
    userToken: input.session.userToken,
    walletId: input.wallet.id,
    typedData,
  });
  const result = await executeChallenge(input.sdk, challengeId);
  const signature = readSignature(result);
  if (signature === null) throw new Error("Circle did not return an EIP-712 signature.");
  return signature;
}

function executeChallenge(sdk: W3SSdk, challengeId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error, result) => {
      if (error) reject(new Error(error.message));
      else if (result === undefined) reject(new Error("Circle challenge returned no result."));
      else resolve(result);
    });
  });
}

async function waitForTransaction(userToken: string, challengeId: string): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    const status = await fetchCircleContractExecutionStatus({ userToken, challengeId });
    if (status.transactionState === "CONFIRMED" || status.transactionState === "COMPLETE") {
      if (status.txHash === null || !/^0x[a-fA-F0-9]{64}$/.test(status.txHash)) {
        throw new Error("Circle confirmed the transaction without a valid ARC transaction hash.");
      }
      return status.txHash;
    }
    if (["FAILED", "CANCELLED", "DENIED"].includes(status.transactionState ?? "")) {
      throw new Error(status.error ?? `Circle transaction ${status.transactionState?.toLowerCase()}.`);
    }
    if (["FAILED", "EXPIRED"].includes(status.challengeStatus)) {
      throw new Error(status.error ?? `Circle challenge ${status.challengeStatus.toLowerCase()}.`);
    }
    await delay(1_500);
  }
  throw new Error("Circle transaction was not confirmed within two minutes.");
}

async function forwardRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(arcWalletChain.rpcUrls[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (!response.ok || payload.error !== undefined) {
    throw new Error(payload.error?.message ?? `ARC RPC request failed (${response.status}).`);
  }
  return payload.result;
}

function readTransaction(value: unknown): { from: string; to: string; data: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Transaction request is invalid.");
  }
  const { from, to, data } = value as Record<string, unknown>;
  if (typeof from !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(from)) throw new Error("Transaction sender is invalid.");
  if (typeof to !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error("Transaction target is invalid.");
  if (typeof data !== "string" || !/^0x(?:[a-fA-F0-9]{2})+$/.test(data)) throw new Error("Transaction data is invalid.");
  return { from, to, data };
}

function readSignature(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const signature = (data as Record<string, unknown>).signature;
  return typeof signature === "string" && /^0x[a-fA-F0-9]+$/.test(signature) ? signature : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
