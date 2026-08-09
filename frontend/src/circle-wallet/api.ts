import { clobApiUrl } from "../api";

export type CirclePublicConfig =
  | { enabled: false }
  | { enabled: true; appId: string; googleClientId: string; googleRedirectUri: string };

export type CircleWallet = {
  id: string;
  address: string;
  blockchain: "ARC-TESTNET";
  accountType: "EOA";
  state: string;
};

export class CircleFrontendError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CircleFrontendError";
  }
}

export async function fetchCircleConfig(): Promise<CirclePublicConfig> {
  return circleRequest("/v1/wallet/circle/config");
}

export async function requestCircleSocialToken(deviceId: string) {
  return circleRequest<{ deviceToken: string; deviceEncryptionKey: string }>(
    "/v1/wallet/circle/social/token",
    { deviceId },
  );
}

export async function initializeCircleWallet(userToken: string): Promise<{ challengeId: string }> {
  return circleRequest("/v1/wallet/circle/initialize", { userToken });
}

export async function fetchCircleWallets(userToken: string): Promise<{ wallets: CircleWallet[] }> {
  return circleRequest("/v1/wallet/circle/wallets", { userToken });
}

export function createCircleContractExecutionChallenge(input: {
  userToken: string;
  walletId: string;
  contractAddress: string;
  callData: string;
}): Promise<{ challengeId: string }> {
  return circleRequest("/v1/wallet/circle/contract-execution/challenge", input);
}

export function fetchCircleContractExecutionStatus(input: {
  userToken: string;
  challengeId: string;
}): Promise<{
  challengeStatus: string;
  transactionId: string | null;
  transactionState: string | null;
  txHash: string | null;
  error: string | null;
}> {
  return circleRequest("/v1/wallet/circle/contract-execution/status", input);
}

export function createCircleTypedDataChallenge(input: {
  userToken: string;
  walletId: string;
  typedData: unknown;
}): Promise<{ challengeId: string }> {
  return circleRequest("/v1/wallet/circle/typed-data/challenge", input);
}

async function circleRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${clobApiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string } } | null;
    throw new CircleFrontendError(
      error?.error?.code ?? "CIRCLE_REQUEST_FAILED",
      error?.error?.message ?? `Circle wallet request failed (${response.status}).`,
    );
  }
  return payload as T;
}
