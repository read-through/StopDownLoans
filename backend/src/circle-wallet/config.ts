export type CircleWalletConfig = {
  apiKey: string;
  appId: string;
  googleClientId: string;
  googleRedirectUri: string;
  apiBaseUrl: string;
  socialRateLimit: number;
  socialRateWindowMs: number;
  actionRateLimit: number;
  actionRateWindowMs: number;
  trustProxy: boolean;
};

const requiredKeys = [
  "CIRCLE_API_KEY",
  "CIRCLE_APP_ID",
  "CIRCLE_GOOGLE_CLIENT_ID",
  "CIRCLE_GOOGLE_REDIRECT_URI",
] as const;

export function loadCircleWalletConfig(env: NodeJS.ProcessEnv = process.env): CircleWalletConfig | null {
  const configuredKeys = requiredKeys.filter((key) => hasValue(env[key]));
  if (configuredKeys.length === 0) {
    return null;
  }
  if (configuredKeys.length !== requiredKeys.length) {
    const missing = requiredKeys.filter((key) => !hasValue(env[key]));
    throw new Error(`Incomplete Circle Wallet configuration. Missing: ${missing.join(", ")}.`);
  }

  return {
    apiKey: env.CIRCLE_API_KEY!.trim(),
    appId: env.CIRCLE_APP_ID!.trim(),
    googleClientId: env.CIRCLE_GOOGLE_CLIENT_ID!.trim(),
    googleRedirectUri: parseUrl(env.CIRCLE_GOOGLE_REDIRECT_URI!, "CIRCLE_GOOGLE_REDIRECT_URI"),
    apiBaseUrl: parseUrl(env.CIRCLE_API_BASE_URL ?? "https://api.circle.com", "CIRCLE_API_BASE_URL"),
    socialRateLimit: parsePositiveInteger(env.CIRCLE_SOCIAL_RATE_LIMIT ?? "5", "CIRCLE_SOCIAL_RATE_LIMIT"),
    socialRateWindowMs: parsePositiveInteger(
      env.CIRCLE_SOCIAL_RATE_WINDOW_MS ?? "60000",
      "CIRCLE_SOCIAL_RATE_WINDOW_MS",
    ),
    actionRateLimit: parsePositiveInteger(env.CIRCLE_ACTION_RATE_LIMIT ?? "30", "CIRCLE_ACTION_RATE_LIMIT"),
    actionRateWindowMs: parsePositiveInteger(
      env.CIRCLE_ACTION_RATE_WINDOW_MS ?? "60000",
      "CIRCLE_ACTION_RATE_WINDOW_MS",
    ),
    trustProxy: parseBoolean(env.CIRCLE_TRUST_PROXY ?? "false", "CIRCLE_TRUST_PROXY"),
  };
}

export function getPublicCircleWalletConfig(config: CircleWalletConfig | null) {
  return config === null
    ? { enabled: false as const }
    : {
        enabled: true as const,
        appId: config.appId,
        googleClientId: config.googleClientId,
        googleRedirectUri: config.googleRedirectUri,
      };
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function parseUrl(value: string, key: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${key} must be an absolute URL.`);
  }
}

function parsePositiveInteger(value: string, key: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${key} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${key} must be a positive safe integer.`);
  }
  return parsed;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be true or false.`);
}
