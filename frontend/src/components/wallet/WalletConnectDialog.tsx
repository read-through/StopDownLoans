import { CircleUserRound, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  CircleFrontendError,
  fetchCircleConfig,
  fetchCircleWallets,
  initializeCircleWallet,
  requestCircleSocialToken,
  type CirclePublicConfig,
} from "../../circle-wallet/api";
import type { CircleConnectedWallet, CircleWalletSession } from "../../circle-wallet/types";
import { createCircleWalletProvider } from "../../circle-wallet/provider";
import type { EthereumProvider, WalletStatus } from "../../wallet";

type LoginResult = CircleWalletSession & { refreshToken?: string };
type CircleSdk = W3SSdk;
type Bootstrap = {
  deviceToken: string;
  deviceEncryptionKey: string;
  appId: string;
  googleClientId: string;
  googleRedirectUri: string;
};

const bootstrapKey = "stopdown.circle.oauth-bootstrap";

export function WalletConnectDialog(props: {
  injectedError: string | null;
  injectedStatus: WalletStatus;
  onClose: () => void;
  onInjectedWallet: () => void;
  onCircleWallet: (wallet: CircleConnectedWallet, provider: EthereumProvider) => void;
}) {
  const sdkRef = useRef<CircleSdk | null>(null);
  const configRef = useRef<CirclePublicConfig | null>(null);
  const [circleEnabled, setCircleEnabled] = useState(false);
  const [status, setStatus] = useState("Checking Circle Wallet availability...");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void setupCircleSdk().catch((setupError: unknown) => {
      if (!cancelled) {
        setCircleEnabled(false);
        setStatus("Circle Wallet unavailable");
        setError(message(setupError));
      }
    });
    return () => {
      cancelled = true;
    };

    async function setupCircleSdk() {
      const config = await fetchCircleConfig();
      if (cancelled) return;
      configRef.current = config;
      if (!config.enabled) {
        setStatus("Circle Wallet is not configured for this deployment");
        return;
      }

      const [{ W3SSdk }, { SocialLoginProvider: _provider }] = await Promise.all([
        import("@circle-fin/w3s-pw-web-sdk"),
        import("@circle-fin/w3s-pw-web-sdk/dist/src/types"),
      ]);
      if (cancelled) return;
      const bootstrap = readBootstrap();
      const sdk = new W3SSdk(
        {
          appSettings: { appId: config.appId },
          loginConfigs: bootstrap === null ? undefined : toLoginConfigs(bootstrap),
        },
        (loginError, result) => {
          if (loginError || result === undefined) {
            setBusy(false);
            setError(loginError?.message ?? "Google login did not return a Circle session.");
            return;
          }
          void finishLogin(sdk, result as LoginResult);
        },
      );
      sdkRef.current = sdk;
      setCircleEnabled(true);
      setStatus("Continue with Google using a Circle user-controlled wallet");
      void _provider;
    }
  }, []);

  const startGoogleLogin = async () => {
    const sdk = sdkRef.current;
    const config = configRef.current;
    if (sdk === null || config === null || !config.enabled) return;
    setBusy(true);
    setError(null);
    setStatus("Preparing secure Google login...");
    try {
      const deviceId = await sdk.getDeviceId();
      const token = await requestCircleSocialToken(deviceId);
      const bootstrap: Bootstrap = {
        ...token,
        appId: config.appId,
        googleClientId: config.googleClientId,
        googleRedirectUri: config.googleRedirectUri,
      };
      sessionStorage.setItem(bootstrapKey, JSON.stringify(bootstrap));
      sdk.updateConfigs(
        { appSettings: { appId: config.appId }, loginConfigs: toLoginConfigs(bootstrap) },
        (loginError, result) => {
          if (loginError || result === undefined) {
            setBusy(false);
            setError(loginError?.message ?? "Google login did not return a Circle session.");
            return;
          }
          void finishLogin(sdk, result as LoginResult);
        },
      );
      const { SocialLoginProvider } = await import("@circle-fin/w3s-pw-web-sdk/dist/src/types");
      await sdk.performLogin(SocialLoginProvider.GOOGLE);
    } catch (loginError) {
      setBusy(false);
      setError(message(loginError));
    }
  };

  const finishLogin = async (sdk: CircleSdk, result: LoginResult) => {
    sessionStorage.removeItem(bootstrapKey);
    const session = { userToken: result.userToken, encryptionKey: result.encryptionKey };
    sdk.setAuthentication(session);
    setBusy(true);
    setError(null);
    setStatus("Creating or loading your ARC wallet...");
    try {
      try {
        const { challengeId } = await initializeCircleWallet(session.userToken);
        await executeChallenge(sdk, challengeId);
      } catch (initializeError) {
        if (!(initializeError instanceof CircleFrontendError) || initializeError.code !== "CIRCLE_USER_ALREADY_INITIALIZED") {
          throw initializeError;
        }
      }
      const wallet = await waitForArcWallet(session.userToken);
      props.onCircleWallet(wallet, createCircleWalletProvider({ sdk, wallet, session }));
      props.onClose();
    } catch (walletError) {
      setBusy(false);
      setError(message(walletError));
    }
  };

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="walletDialog" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="walletDialogHeader">
          <div>
            <h2 id="wallet-dialog-title">Connect wallet</h2>
            <p>Choose how you want to sign ARC transactions.</p>
          </div>
          <button className="iconButton" type="button" aria-label="Close wallet dialog" onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="walletOptions">
          <button
            className="walletOption"
            type="button"
            onClick={props.onInjectedWallet}
            disabled={busy || props.injectedStatus === "connecting"}
          >
            <Wallet size={20} />
            <span>
              <strong>Browser wallet</strong>
              <small>{props.injectedStatus === "connecting" ? "Waiting for wallet approval" : "MetaMask, Rabby, or another injected EVM wallet"}</small>
            </span>
          </button>
          <button className="walletOption" type="button" onClick={startGoogleLogin} disabled={!circleEnabled || busy}>
            <CircleUserRound size={20} />
            <span><strong>Continue with Google</strong><small>{busy ? "Circle confirmation in progress" : status}</small></span>
          </button>
        </div>
        {props.injectedError !== null && <div className="walletDialogError">{props.injectedError}</div>}
        {error !== null && <div className="walletDialogError">{error}</div>}
      </section>
    </div>
  );
}

function toLoginConfigs(bootstrap: Bootstrap) {
  return {
    deviceToken: bootstrap.deviceToken,
    deviceEncryptionKey: bootstrap.deviceEncryptionKey,
    google: {
      clientId: bootstrap.googleClientId,
      redirectUri: bootstrap.googleRedirectUri,
      selectAccountPrompt: true,
    },
  };
}

function readBootstrap(): Bootstrap | null {
  const raw = sessionStorage.getItem(bootstrapKey);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Bootstrap;
  } catch {
    sessionStorage.removeItem(bootstrapKey);
    return null;
  }
}

function executeChallenge(sdk: CircleSdk, challengeId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitForArcWallet(userToken: string): Promise<CircleConnectedWallet> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { wallets } = await fetchCircleWallets(userToken);
    const wallet = wallets.find((candidate) => candidate.state === "LIVE");
    if (wallet !== undefined) return { id: wallet.id, address: wallet.address };
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Circle created the wallet, but ARC wallet indexing is still pending.");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Circle Wallet failed.";
}
