import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCircleContractExecutionChallenge,
  createCircleTypedDataChallenge,
  getCircleContractExecutionStatus,
  initializeCircleArcEoaWallet,
  listCircleArcEoaWallets,
  requestCircleSocialDeviceToken,
} from "../../src/circle-wallet/client.js";
import type { CircleWalletConfig } from "../../src/circle-wallet/config.js";

describe("Circle Wallet API client", () => {
  it("keeps the API key in the authorization header and validates the response", async () => {
    const captured: { request?: { url: string; init?: RequestInit } } = {};
    const result = await requestCircleSocialDeviceToken(
      config(),
      "browser-device",
      (async (url, init) => {
        captured.request = { url: String(url), init };
        return Response.json({
          data: { deviceToken: "device-token", deviceEncryptionKey: "device-encryption-key" },
        });
      }) as typeof fetch,
    );

    assert.deepEqual(result, {
      deviceToken: "device-token",
      deviceEncryptionKey: "device-encryption-key",
    });
    assert.ok(captured.request !== undefined);
    assert.equal(captured.request.url, "https://api.circle.test/v1/w3s/users/social/token");
    assert.equal((captured.request.init?.headers as Record<string, string>).authorization, "Bearer circle-secret");
    const body = JSON.parse(String(captured.request.init?.body));
    assert.equal(body.deviceId, "browser-device");
    assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/);
  });

  it("initializes only an ARC Testnet EOA wallet", async () => {
    let body: Record<string, unknown> = {};
    const result = await initializeCircleArcEoaWallet(
      config(),
      "user-token-value",
      (async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({ data: { challengeId: "challenge-id" } });
      }) as typeof fetch,
    );

    assert.deepEqual(result, { challengeId: "challenge-id" });
    assert.equal(body.accountType, "EOA");
    assert.deepEqual(body.blockchains, ["ARC-TESTNET"]);
  });

  it("filters listed wallets to valid ARC Testnet EOAs", async () => {
    const wallets = await listCircleArcEoaWallets(
      config(),
      "user-token-value",
      (async () =>
        Response.json({
          data: {
            wallets: [
              {
                id: "arc-wallet",
                address: "0x0000000000000000000000000000000000000001",
                blockchain: "ARC-TESTNET",
                accountType: "EOA",
                state: "LIVE",
              },
              {
                id: "wrong-wallet",
                address: "0x0000000000000000000000000000000000000002",
                blockchain: "ETH-SEPOLIA",
                accountType: "EOA",
                state: "LIVE",
              },
            ],
          },
        })) as typeof fetch,
    );

    assert.deepEqual(wallets, [
      {
        id: "arc-wallet",
        address: "0x0000000000000000000000000000000000000001",
        blockchain: "ARC-TESTNET",
        accountType: "EOA",
        state: "LIVE",
      },
    ]);
  });

  it("creates a medium-fee contract execution challenge", async () => {
    let requestBody: Record<string, unknown> = {};
    const result = await createCircleContractExecutionChallenge(
      config(),
      "user-token-value",
      {
        walletId: "00000000-0000-4000-8000-000000000001",
        contractAddress: "0x0000000000000000000000000000000000000003",
        callData: "0x12345678",
      },
      (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({ data: { challengeId: "challenge-id" } });
      }) as typeof fetch,
    );

    assert.deepEqual(result, { challengeId: "challenge-id" });
    assert.equal(requestBody.walletId, "00000000-0000-4000-8000-000000000001");
    assert.equal(requestBody.contractAddress, "0x0000000000000000000000000000000000000003");
    assert.equal(requestBody.callData, "0x12345678");
    assert.equal(requestBody.feeLevel, "MEDIUM");
  });

  it("creates a typed-data signing challenge", async () => {
    let requestBody: Record<string, unknown> = {};
    const result = await createCircleTypedDataChallenge(
      config(),
      "user-token-value",
      {
        walletId: "00000000-0000-4000-8000-000000000001",
        typedData: '{"primaryType":"Order"}',
        memo: "Place StopDown limit order",
      },
      (async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({ data: { challengeId: "typed-challenge" } });
      }) as typeof fetch,
    );

    assert.deepEqual(result, { challengeId: "typed-challenge" });
    assert.equal(requestBody.data, '{"primaryType":"Order"}');
    assert.equal(requestBody.memo, "Place StopDown limit order");
  });

  it("resolves a Circle challenge to its ARC transaction status", async () => {
    const result = await getCircleContractExecutionStatus(
      config(),
      "user-token-value",
      "00000000-0000-4000-8000-000000000010",
      (async (url) => {
        if (String(url).includes("/challenges/")) {
          return Response.json({
            data: {
              challenge: {
                status: "COMPLETED",
                correlationIds: ["00000000-0000-4000-8000-000000000011"],
              },
            },
          });
        }
        return Response.json({
          data: {
            transaction: {
              state: "COMPLETE",
              txHash: `0x${"ab".repeat(32)}`,
            },
          },
        });
      }) as typeof fetch,
    );

    assert.deepEqual(result, {
      challengeStatus: "COMPLETED",
      transactionId: "00000000-0000-4000-8000-000000000011",
      transactionState: "COMPLETE",
      txHash: `0x${"ab".repeat(32)}`,
      error: null,
    });
  });
});

function config(): CircleWalletConfig {
  return {
    apiKey: "circle-secret",
    appId: "app-id",
    googleClientId: "google-client",
    googleRedirectUri: "https://stopdown.example/callback",
    apiBaseUrl: "https://api.circle.test",
    socialRateLimit: 5,
    socialRateWindowMs: 60_000,
    actionRateLimit: 30,
    actionRateWindowMs: 60_000,
    trustProxy: false,
  };
}
