import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IncomingMessage } from "node:http";
import type { DbClient } from "../../src/clob/db/client.js";
import type { CircleWalletConfig } from "../../src/circle-wallet/config.js";
import {
  createCircleContractExecutionResponse,
  createCircleSocialTokenResponse,
  createCircleTypedDataResponse,
  getCircleContractExecutionStatusResponse,
} from "../../src/circle-wallet/http.js";

describe("Circle Wallet HTTP flow", () => {
  it("consumes the PostgreSQL limit before requesting a Circle token", async () => {
    const calls: string[] = [];
    const result = await createCircleSocialTokenResponse({
      config: config(true),
      request: request("10.0.0.2", "203.0.113.8, 10.0.0.1"),
      body: { deviceId: "browser-device" },
      dbClient: {} as DbClient,
      services: {
        consumeRateLimit: async (_client, input) => {
          calls.push(`limit:${input.subject}:${input.limit}:${input.windowMs}`);
          return { allowed: true, limit: 5, remaining: 4, resetAt: new Date() };
        },
        requestSocialDeviceToken: async (_config, deviceId) => {
          calls.push(`circle:${deviceId}`);
          return { deviceToken: "token", deviceEncryptionKey: "key" };
        },
      },
    });

    assert.deepEqual(result, { deviceToken: "token", deviceEncryptionKey: "key" });
    assert.deepEqual(calls, ["limit:203.0.113.8:5:60000", "circle:browser-device"]);
  });

  it("does not trust a forwarded address unless explicitly configured", async () => {
    let subject = "";
    await createCircleSocialTokenResponse({
      config: config(false),
      request: request("10.0.0.2", "203.0.113.8"),
      body: { deviceId: "browser-device" },
      dbClient: {} as DbClient,
      services: {
        consumeRateLimit: async (_client, input) => {
          subject = input.subject;
          return { allowed: true, limit: 5, remaining: 4, resetAt: new Date() };
        },
        requestSocialDeviceToken: async () => ({ deviceToken: "token", deviceEncryptionKey: "key" }),
      },
    });

    assert.equal(subject, "10.0.0.2");
  });

  it("does not call Circle when the PostgreSQL limit is exhausted", async () => {
    let circleCalled = false;
    await assert.rejects(
      createCircleSocialTokenResponse({
        config: config(false),
        request: request("10.0.0.2"),
        body: { deviceId: "browser-device" },
        dbClient: {} as DbClient,
        services: {
          consumeRateLimit: async () => ({ allowed: false, limit: 5, remaining: 0, resetAt: new Date() }),
          requestSocialDeviceToken: async () => {
            circleCalled = true;
            return { deviceToken: "token", deviceEncryptionKey: "key" };
          },
        },
      }),
      (error: unknown) =>
        error instanceof Error && error.name === "PlatformHttpError" && error.message.includes("Too many"),
    );
    assert.equal(circleCalled, false);
  });

  it("allows contract execution only for deployment contracts", async () => {
    const result = await createCircleContractExecutionResponse({
      config: config(false),
      body: {
        userToken: "user-token-that-is-long-enough",
        walletId: "00000000-0000-4000-8000-000000000001",
        contractAddress: "0x0000000000000000000000000000000000000003",
        callData: "0x12345678",
      },
      allowedContracts: ["0x0000000000000000000000000000000000000003"],
      dbClient: {} as DbClient,
      services: {
        consumeRateLimit: async () => ({ allowed: true, limit: 30, remaining: 29, resetAt: new Date() }),
        createContractExecutionChallenge: async (_config, userToken, transaction) => {
          assert.equal(userToken, "user-token-that-is-long-enough");
          assert.equal(transaction.callData, "0x12345678");
          return { challengeId: "challenge-id" };
        },
      },
    });
    assert.deepEqual(result, { challengeId: "challenge-id" });

    await assert.rejects(
      createCircleContractExecutionResponse({
        config: config(false),
        body: {
          userToken: "user-token-that-is-long-enough",
          walletId: "00000000-0000-4000-8000-000000000001",
          contractAddress: "0x0000000000000000000000000000000000000004",
          callData: "0x12345678",
        },
        allowedContracts: ["0x0000000000000000000000000000000000000003"],
        dbClient: {} as DbClient,
      }),
      (error: unknown) => error instanceof Error && error.message.includes("not part of this StopDown deployment"),
    );
  });

  it("does not create a Circle action challenge after the PostgreSQL limit is exhausted", async () => {
    let circleCalled = false;
    await assert.rejects(
      createCircleContractExecutionResponse({
        config: config(false),
        body: {
          userToken: "user-token-that-is-long-enough",
          walletId: "00000000-0000-4000-8000-000000000001",
          contractAddress: "0x0000000000000000000000000000000000000003",
          callData: "0x12345678",
        },
        allowedContracts: ["0x0000000000000000000000000000000000000003"],
        dbClient: {} as DbClient,
        services: {
          consumeRateLimit: async () => ({ allowed: false, limit: 30, remaining: 0, resetAt: new Date() }),
          createContractExecutionChallenge: async () => {
            circleCalled = true;
            return { challengeId: "challenge-id" };
          },
        },
      }),
      (error: unknown) => error instanceof Error && error.message.includes("Too many Circle wallet actions"),
    );
    assert.equal(circleCalled, false);
  });

  it("allows only StopDown order typed data for the configured exchange", async () => {
    const typedData = stopDownTypedData();
    const result = await createCircleTypedDataResponse({
      config: config(false),
      body: {
        userToken: "user-token-that-is-long-enough",
        walletId: "00000000-0000-4000-8000-000000000001",
        typedData,
      },
      expectedChainId: 5042002,
      expectedVerifyingContract: "0x0000000000000000000000000000000000000003",
      dbClient: {} as DbClient,
      services: {
        consumeRateLimit: async () => ({ allowed: true, limit: 30, remaining: 29, resetAt: new Date() }),
        createTypedDataChallenge: async (_config, _userToken, input) => {
          assert.deepEqual(JSON.parse(input.typedData), typedData);
          assert.equal(input.memo, "Place StopDown limit order");
          return { challengeId: "typed-challenge" };
        },
      },
    });
    assert.deepEqual(result, { challengeId: "typed-challenge" });

    await assert.rejects(
      createCircleTypedDataResponse({
        config: config(false),
        body: {
          userToken: "user-token-that-is-long-enough",
          walletId: "00000000-0000-4000-8000-000000000001",
          typedData: { ...typedData, primaryType: "Permit" },
        },
        expectedChainId: 5042002,
        expectedVerifyingContract: "0x0000000000000000000000000000000000000003",
        dbClient: {} as DbClient,
      }),
      (error: unknown) => error instanceof Error && error.message.includes("Only StopDown orders"),
    );
  });

  it("forwards contract execution status without exposing the Circle API key", async () => {
    const result = await getCircleContractExecutionStatusResponse({
      config: config(false),
      body: {
        userToken: "user-token-that-is-long-enough",
        challengeId: "00000000-0000-4000-8000-000000000010",
      },
      services: {
        getContractExecutionStatus: async (_config, userToken, challengeId) => {
          assert.equal(userToken, "user-token-that-is-long-enough");
          assert.equal(challengeId, "00000000-0000-4000-8000-000000000010");
          return {
            challengeStatus: "COMPLETED",
            transactionId: "00000000-0000-4000-8000-000000000011",
            transactionState: "COMPLETE",
            txHash: `0x${"ab".repeat(32)}`,
            error: null,
          };
        },
      },
    });
    assert.equal(result.transactionState, "COMPLETE");
  });
});

function config(trustProxy: boolean): CircleWalletConfig {
  return {
    apiKey: "secret",
    appId: "app-id",
    googleClientId: "google-client",
    googleRedirectUri: "https://stopdown.example/callback",
    apiBaseUrl: "https://api.circle.test",
    socialRateLimit: 5,
    socialRateWindowMs: 60_000,
    actionRateLimit: 30,
    actionRateWindowMs: 60_000,
    trustProxy,
  };
}

function request(remoteAddress: string, forwardedFor?: string): IncomingMessage {
  return {
    headers: forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
    socket: { remoteAddress },
  } as IncomingMessage;
}

function stopDownTypedData() {
  return {
    domain: {
      name: "StopDownOutcomeExchange",
      version: "1",
      chainId: 5042002,
      verifyingContract: "0x0000000000000000000000000000000000000003",
    },
    types: { Order: [{ name: "maker", type: "address" }] },
    primaryType: "Order",
    message: { maker: "0x0000000000000000000000000000000000000004" },
  };
}
