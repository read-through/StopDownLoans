export type WalletAccount = {
  address: string;
  chainId: string | null;
};

export type WalletStatus = "checking" | "unavailable" | "disconnected" | "connecting" | "connected" | "error";

export type EthereumProvider = {
  request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type WalletChainConfig = {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function hasInjectedWallet(): boolean {
  return getInjectedWalletProvider() !== null;
}

export function getInjectedWalletProvider(): EthereumProvider | null {
  return window.ethereum ?? null;
}

export async function getConnectedWalletAccount(): Promise<WalletAccount | null> {
  const provider = getInjectedWalletProvider();
  if (provider === null) {
    return null;
  }

  const accounts = await requestAccounts(provider, "eth_accounts");
  return accountFromAccounts(provider, accounts);
}

export async function requestWalletAccount(): Promise<WalletAccount> {
  const provider = getInjectedWalletProvider();
  if (provider === null) {
    throw new Error("No injected wallet found.");
  }

  const accounts = await requestAccounts(provider, "eth_requestAccounts");
  const account = await accountFromAccounts(provider, accounts);
  if (account === null) {
    throw new Error("Wallet did not return an account.");
  }

  return account;
}

export async function switchWalletChain(chainId: string, chainConfig?: WalletChainConfig): Promise<void> {
  const provider = getInjectedWalletProvider();
  if (provider === null) {
    throw new Error("No injected wallet found.");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    if (chainConfig === undefined || !isUnknownChainError(error)) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [chainConfig],
    });
  }
}

export function subscribeWalletAccountsChanged(handler: () => void): () => void {
  const provider = getInjectedWalletProvider();
  if (provider?.on === undefined) {
    return () => {};
  }

  provider.on("accountsChanged", handler);
  provider.on("chainChanged", handler);

  return () => {
    provider.removeListener?.("accountsChanged", handler);
    provider.removeListener?.("chainChanged", handler);
  };
}

async function accountFromAccounts(
  provider: EthereumProvider,
  accounts: string[]
): Promise<WalletAccount | null> {
  const [address] = accounts;
  if (address === undefined) {
    return null;
  }

  return {
    address,
    chainId: await requestChainId(provider),
  };
}

async function requestAccounts(provider: EthereumProvider, method: string): Promise<string[]> {
  const result = await provider.request({ method });
  if (!Array.isArray(result)) {
    throw new Error(`${method} returned invalid accounts.`);
  }

  return result.filter((value): value is string => typeof value === "string");
}

async function requestChainId(provider: EthereumProvider): Promise<string | null> {
  const result = await provider.request({ method: "eth_chainId" });
  return typeof result === "string" ? result : null;
}

function isUnknownChainError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as { code: unknown }).code;
  return code === 4902 || code === "4902";
}
