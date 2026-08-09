import { randomUUID } from "node:crypto";
import type { CircleWalletConfig } from "./config.js";
import { PlatformHttpError } from "../platform/httpError.js";

export type CircleSocialDeviceToken = {
  deviceToken: string;
  deviceEncryptionKey: string;
};

export type CircleWalletView = {
  id: string;
  address: string;
  blockchain: "ARC-TESTNET";
  accountType: "EOA";
  state: string;
};

export type CircleContractExecution = {
  walletId: string;
  contractAddress: string;
  callData: string;
};

export type CircleContractExecutionStatus = {
  challengeStatus: string;
  transactionId: string | null;
  transactionState: string | null;
  txHash: string | null;
  error: string | null;
};

export async function requestCircleSocialDeviceToken(
  config: CircleWalletConfig,
  deviceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CircleSocialDeviceToken> {
  const response = await fetchImpl(`${config.apiBaseUrl}/v1/w3s/users/social/token`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "x-request-id": randomUUID(),
    },
    body: JSON.stringify({ idempotencyKey: randomUUID(), deviceId }),
  });

  const body = await readJson(response);
  if (!response.ok) {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", `Circle API rejected social login setup (${response.status}).`);
  }

  const data = getRecord(body, "data");
  const deviceToken = getString(data, "deviceToken");
  const deviceEncryptionKey = getString(data, "deviceEncryptionKey");
  return { deviceToken, deviceEncryptionKey };
}

export async function initializeCircleArcEoaWallet(
  config: CircleWalletConfig,
  userToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ challengeId: string }> {
  const response = await circleFetch(config, "/v1/w3s/user/initialize", userToken, fetchImpl, {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      accountType: "EOA",
      blockchains: ["ARC-TESTNET"],
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const circleCode = readCircleErrorCode(body);
    if (circleCode === 155106) {
      throw new PlatformHttpError(409, "CIRCLE_USER_ALREADY_INITIALIZED", "Circle user is already initialized.");
    }
    throwCircleApiError(response.status);
  }
  return { challengeId: getString(getRecord(body, "data"), "challengeId") };
}

export async function listCircleArcEoaWallets(
  config: CircleWalletConfig,
  userToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CircleWalletView[]> {
  const response = await circleFetch(
    config,
    "/v1/w3s/wallets?blockchain=ARC-TESTNET&pageSize=10",
    userToken,
    fetchImpl,
  );
  const body = await readJson(response);
  if (!response.ok) throwCircleApiError(response.status);
  const data = getRecord(body, "data");
  const wallets = data.wallets;
  if (!Array.isArray(wallets)) {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", "Circle API returned an invalid response.");
  }
  return wallets.map(parseWallet).filter((wallet): wallet is CircleWalletView => wallet !== null);
}

export async function createCircleContractExecutionChallenge(
  config: CircleWalletConfig,
  userToken: string,
  transaction: CircleContractExecution,
  fetchImpl: typeof fetch = fetch,
): Promise<{ challengeId: string }> {
  const response = await circleFetch(
    config,
    "/v1/w3s/user/transactions/contractExecution",
    userToken,
    fetchImpl,
    {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        walletId: transaction.walletId,
        contractAddress: transaction.contractAddress,
        callData: transaction.callData,
        feeLevel: "MEDIUM",
        refId: "stopdown-protocol-action",
      }),
    },
  );
  const body = await readJson(response);
  if (!response.ok) throwCircleApiError(response.status);
  return { challengeId: getString(getRecord(body, "data"), "challengeId") };
}

export async function createCircleTypedDataChallenge(
  config: CircleWalletConfig,
  userToken: string,
  input: { walletId: string; typedData: string; memo: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ challengeId: string }> {
  const response = await circleFetch(
    config,
    "/v1/w3s/user/sign/typedData",
    userToken,
    fetchImpl,
    {
      method: "POST",
      body: JSON.stringify({
        walletId: input.walletId,
        data: input.typedData,
        memo: input.memo,
      }),
    },
  );
  const body = await readJson(response);
  if (!response.ok) throwCircleApiError(response.status);
  return { challengeId: getString(getRecord(body, "data"), "challengeId") };
}

export async function getCircleContractExecutionStatus(
  config: CircleWalletConfig,
  userToken: string,
  challengeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CircleContractExecutionStatus> {
  const challengeResponse = await circleFetch(
    config,
    `/v1/w3s/user/challenges/${challengeId}`,
    userToken,
    fetchImpl,
  );
  const challengeBody = await readJson(challengeResponse);
  if (!challengeResponse.ok) throwCircleApiError(challengeResponse.status);
  const challenge = getRecord(getRecord(challengeBody, "data"), "challenge");
  const challengeStatus = getString(challenge, "status");
  const challengeError = getOptionalString(challenge, "errorMessage");
  const correlationIds = challenge.correlationIds;
  const transactionId = Array.isArray(correlationIds) && typeof correlationIds[0] === "string"
    ? correlationIds[0]
    : null;

  if (transactionId === null) {
    return {
      challengeStatus,
      transactionId: null,
      transactionState: null,
      txHash: null,
      error: challengeError,
    };
  }

  const transactionResponse = await circleFetch(
    config,
    `/v1/w3s/transactions/${transactionId}`,
    userToken,
    fetchImpl,
  );
  const transactionBody = await readJson(transactionResponse);
  if (!transactionResponse.ok) throwCircleApiError(transactionResponse.status);
  const transaction = getRecord(getRecord(transactionBody, "data"), "transaction");
  return {
    challengeStatus,
    transactionId,
    transactionState: getString(transaction, "state"),
    txHash: getOptionalString(transaction, "txHash"),
    error: getOptionalString(transaction, "errorDetails") ?? getOptionalString(transaction, "errorReason"),
  };
}

async function circleFetch(
  config: CircleWalletConfig,
  path: string,
  userToken: string,
  fetchImpl: typeof fetch,
  init: RequestInit = {},
): Promise<Response> {
  return fetchImpl(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "x-request-id": randomUUID(),
      "x-user-token": userToken,
      ...init.headers,
    },
  });
}

function parseWallet(value: unknown): CircleWalletView | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const wallet = value as Record<string, unknown>;
  if (wallet.blockchain !== "ARC-TESTNET" || wallet.accountType !== "EOA") return null;
  const id = wallet.id;
  const address = wallet.address;
  const state = wallet.state;
  if (
    typeof id !== "string" ||
    typeof address !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(address) ||
    typeof state !== "string"
  ) {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", "Circle API returned an invalid wallet.");
  }
  return { id, address, blockchain: "ARC-TESTNET", accountType: "EOA", state };
}

function readCircleErrorCode(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  return typeof code === "number" ? code : null;
}

function throwCircleApiError(status: number): never {
  throw new PlatformHttpError(502, "CIRCLE_API_ERROR", `Circle API rejected the wallet request (${status}).`);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", "Circle API returned invalid JSON.");
  }
}

function getRecord(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", "Circle API returned an invalid response.");
  }
  const nested = (value as Record<string, unknown>)[key];
  if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", "Circle API returned an invalid response.");
  }
  return nested as Record<string, unknown>;
}

function getString(value: Record<string, unknown>, key: string): string {
  const nested = value[key];
  if (typeof nested !== "string" || nested === "") {
    throw new PlatformHttpError(502, "CIRCLE_API_ERROR", "Circle API returned an invalid response.");
  }
  return nested;
}

function getOptionalString(value: Record<string, unknown>, key: string): string | null {
  const nested = value[key];
  return typeof nested === "string" && nested !== "" ? nested : null;
}
