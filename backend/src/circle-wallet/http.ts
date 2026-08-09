import type { IncomingMessage } from "node:http";
import type { DbClient } from "../clob/db/client.js";
import { PlatformHttpError } from "../platform/httpError.js";
import { consumeRateLimit } from "../platform/rateLimit.js";
import { requestCircleSocialDeviceToken } from "./client.js";
import {
  createCircleContractExecutionChallenge,
  createCircleTypedDataChallenge,
  getCircleContractExecutionStatus,
  initializeCircleArcEoaWallet,
  listCircleArcEoaWallets,
} from "./client.js";
import { getPublicCircleWalletConfig, type CircleWalletConfig } from "./config.js";

export type CircleWalletHttpServices = {
  consumeRateLimit: typeof consumeRateLimit;
  requestSocialDeviceToken: typeof requestCircleSocialDeviceToken;
  initializeArcEoaWallet: typeof initializeCircleArcEoaWallet;
  listArcEoaWallets: typeof listCircleArcEoaWallets;
  createContractExecutionChallenge: typeof createCircleContractExecutionChallenge;
  createTypedDataChallenge: typeof createCircleTypedDataChallenge;
  getContractExecutionStatus: typeof getCircleContractExecutionStatus;
};

export function getCircleWalletConfigResponse(config: CircleWalletConfig | null) {
  return getPublicCircleWalletConfig(config);
}

export async function initializeCircleWalletResponse(input: {
  config: CircleWalletConfig | null;
  body: unknown;
  services?: Partial<CircleWalletHttpServices>;
}): Promise<{ challengeId: string }> {
  const config = requireCircleConfig(input.config);
  const userToken = parseUserToken(input.body);
  const initialize = input.services?.initializeArcEoaWallet ?? initializeCircleArcEoaWallet;
  return initialize(config, userToken);
}

export async function listCircleWalletsResponse(input: {
  config: CircleWalletConfig | null;
  body: unknown;
  services?: Partial<CircleWalletHttpServices>;
}) {
  const config = requireCircleConfig(input.config);
  const userToken = parseUserToken(input.body);
  const listWallets = input.services?.listArcEoaWallets ?? listCircleArcEoaWallets;
  return { wallets: await listWallets(config, userToken) };
}

export async function createCircleContractExecutionResponse(input: {
  config: CircleWalletConfig | null;
  body: unknown;
  allowedContracts: readonly string[];
  dbClient: DbClient;
  services?: Partial<CircleWalletHttpServices>;
}): Promise<{ challengeId: string }> {
  const config = requireCircleConfig(input.config);
  const parsed = parseContractExecution(input.body, input.allowedContracts);
  await requireCircleActionCapacity(input.dbClient, config, parsed.userToken, input.services);
  const createChallenge =
    input.services?.createContractExecutionChallenge ?? createCircleContractExecutionChallenge;
  return createChallenge(config, parsed.userToken, {
    walletId: parsed.walletId,
    contractAddress: parsed.contractAddress,
    callData: parsed.callData,
  });
}

export async function createCircleTypedDataResponse(input: {
  config: CircleWalletConfig | null;
  body: unknown;
  expectedChainId: number;
  expectedVerifyingContract: string;
  dbClient: DbClient;
  services?: Partial<CircleWalletHttpServices>;
}): Promise<{ challengeId: string }> {
  const config = requireCircleConfig(input.config);
  const parsed = parseTypedData(input.body, input.expectedChainId, input.expectedVerifyingContract);
  await requireCircleActionCapacity(input.dbClient, config, parsed.userToken, input.services);
  const createChallenge = input.services?.createTypedDataChallenge ?? createCircleTypedDataChallenge;
  return createChallenge(config, parsed.userToken, {
    walletId: parsed.walletId,
    typedData: JSON.stringify(parsed.typedData),
    memo: parsed.primaryType === "Order" ? "Place StopDown limit order" : "Cancel StopDown limit order",
  });
}

export async function getCircleContractExecutionStatusResponse(input: {
  config: CircleWalletConfig | null;
  body: unknown;
  services?: Partial<CircleWalletHttpServices>;
}) {
  const config = requireCircleConfig(input.config);
  const parsed = parseChallengeStatus(input.body);
  const getStatus = input.services?.getContractExecutionStatus ?? getCircleContractExecutionStatus;
  return getStatus(config, parsed.userToken, parsed.challengeId);
}

export async function createCircleSocialTokenResponse(input: {
  config: CircleWalletConfig | null;
  request: IncomingMessage;
  body: unknown;
  dbClient: DbClient;
  services?: Partial<CircleWalletHttpServices>;
}): Promise<{ deviceToken: string; deviceEncryptionKey: string }> {
  if (input.config === null) {
    throw new PlatformHttpError(503, "CIRCLE_WALLET_DISABLED", "Circle Wallet is not configured.");
  }

  const deviceId = parseDeviceId(input.body);
  const limiter = input.services?.consumeRateLimit ?? consumeRateLimit;
  const limit = await limiter(input.dbClient, {
    scope: "circle-social-token",
    subject: getRequestSubject(input.request, input.config.trustProxy),
    limit: input.config.socialRateLimit,
    windowMs: input.config.socialRateWindowMs,
  });
  if (!limit.allowed) {
    throw new PlatformHttpError(429, "RATE_LIMITED", "Too many Circle Social Login attempts.");
  }

  const requestToken = input.services?.requestSocialDeviceToken ?? requestCircleSocialDeviceToken;
  return requestToken(input.config, deviceId);
}

function requireCircleConfig(config: CircleWalletConfig | null): CircleWalletConfig {
  if (config === null) {
    throw new PlatformHttpError(503, "CIRCLE_WALLET_DISABLED", "Circle Wallet is not configured.");
  }
  return config;
}

function parseUserToken(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "Request body must be an object.");
  }
  const userToken = (body as Record<string, unknown>).userToken;
  if (typeof userToken !== "string" || userToken.length < 20 || userToken.length > 16_384) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "userToken is invalid.");
  }
  return userToken;
}

function parseDeviceId(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "Request body must be an object.");
  }
  const deviceId = (body as Record<string, unknown>).deviceId;
  if (typeof deviceId !== "string" || deviceId.trim() === "" || deviceId.length > 256) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "deviceId must contain 1 to 256 characters.");
  }
  return deviceId;
}

function parseContractExecution(body: unknown, allowedContracts: readonly string[]) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "Request body must be an object.");
  }
  const record = body as Record<string, unknown>;
  const userToken = parseUserToken(body);
  const walletId = record.walletId;
  const contractAddress = record.contractAddress;
  const callData = record.callData;
  if (typeof walletId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(walletId)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "walletId is invalid.");
  }
  if (typeof contractAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "contractAddress is invalid.");
  }
  if (!allowedContracts.some((allowed) => allowed.toLowerCase() === contractAddress.toLowerCase())) {
    throw new PlatformHttpError(400, "UNSUPPORTED_CONTRACT", "Contract is not part of this StopDown deployment.");
  }
  if (typeof callData !== "string" || !/^0x(?:[a-fA-F0-9]{2})+$/.test(callData) || callData.length > 131_074) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "callData must be non-empty hex data up to 64 KiB.");
  }
  return { userToken, walletId, contractAddress, callData };
}

function parseTypedData(body: unknown, expectedChainId: number, expectedVerifyingContract: string) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "Request body must be an object.");
  }
  const record = body as Record<string, unknown>;
  const userToken = parseUserToken(body);
  const walletId = record.walletId;
  const typedData = record.typedData;
  if (typeof walletId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(walletId)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "walletId is invalid.");
  }
  if (typeof typedData !== "object" || typedData === null || Array.isArray(typedData)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "typedData must be an object.");
  }
  const value = typedData as Record<string, unknown>;
  const domain = value.domain;
  const primaryType = value.primaryType;
  if (primaryType !== "Order" && primaryType !== "CancelOrder") {
    throw new PlatformHttpError(400, "UNSUPPORTED_TYPED_DATA", "Only StopDown orders and cancellations can be signed.");
  }
  if (typeof domain !== "object" || domain === null || Array.isArray(domain)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "typedData domain is invalid.");
  }
  const domainRecord = domain as Record<string, unknown>;
  if (
    domainRecord.name !== "StopDownOutcomeExchange" ||
    domainRecord.version !== "1" ||
    Number(domainRecord.chainId) !== expectedChainId ||
    typeof domainRecord.verifyingContract !== "string" ||
    domainRecord.verifyingContract.toLowerCase() !== expectedVerifyingContract.toLowerCase()
  ) {
    throw new PlatformHttpError(400, "UNSUPPORTED_TYPED_DATA", "EIP-712 domain does not match this StopDown deployment.");
  }
  if (typeof value.types !== "object" || value.types === null || typeof value.message !== "object" || value.message === null) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "typedData types and message are required.");
  }
  if (JSON.stringify(typedData).length > 65_536) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "typedData exceeds 64 KiB.");
  }
  return { userToken, walletId, typedData, primaryType };
}

function parseChallengeStatus(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "Request body must be an object.");
  }
  const userToken = parseUserToken(body);
  const challengeId = (body as Record<string, unknown>).challengeId;
  if (typeof challengeId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(challengeId)) {
    throw new PlatformHttpError(400, "INVALID_REQUEST", "challengeId is invalid.");
  }
  return { userToken, challengeId };
}

function getRequestSubject(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstAddress = value?.split(",")[0]?.trim();
    if (firstAddress) return firstAddress;
  }
  return request.socket.remoteAddress ?? "unknown";
}

async function requireCircleActionCapacity(
  dbClient: DbClient,
  config: CircleWalletConfig,
  userToken: string,
  services?: Partial<CircleWalletHttpServices>,
): Promise<void> {
  const limiter = services?.consumeRateLimit ?? consumeRateLimit;
  const result = await limiter(dbClient, {
    scope: "circle-user-action",
    subject: userToken,
    limit: config.actionRateLimit,
    windowMs: config.actionRateWindowMs,
  });
  if (!result.allowed) {
    throw new PlatformHttpError(429, "RATE_LIMITED", "Too many Circle wallet actions.");
  }
}
