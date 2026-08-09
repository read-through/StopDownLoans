import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPublicCircleWalletConfig, loadCircleWalletConfig } from "../../src/circle-wallet/config.js";

describe("Circle Wallet config", () => {
  it("stays disabled when no Circle values are configured", () => {
    assert.equal(loadCircleWalletConfig({}), null);
    assert.deepEqual(getPublicCircleWalletConfig(null), { enabled: false });
  });

  it("rejects partial secret configuration", () => {
    assert.throws(
      () => loadCircleWalletConfig({ CIRCLE_API_KEY: "secret" }),
      /Incomplete Circle Wallet configuration/,
    );
  });

  it("returns only public browser configuration", () => {
    const config = loadCircleWalletConfig({
      CIRCLE_API_KEY: "secret",
      CIRCLE_APP_ID: "app-id",
      CIRCLE_GOOGLE_CLIENT_ID: "google-client",
      CIRCLE_GOOGLE_REDIRECT_URI: "https://stopdown.example/circle-callback",
      CIRCLE_TRUST_PROXY: "true",
    });

    assert.ok(config !== null);
    assert.equal(config.socialRateLimit, 5);
    assert.equal(config.socialRateWindowMs, 60_000);
    assert.equal(config.actionRateLimit, 30);
    assert.equal(config.actionRateWindowMs, 60_000);
    assert.equal(config.trustProxy, true);
    assert.deepEqual(getPublicCircleWalletConfig(config), {
      enabled: true,
      appId: "app-id",
      googleClientId: "google-client",
      googleRedirectUri: "https://stopdown.example/circle-callback",
    });
  });
});
