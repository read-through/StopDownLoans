export type WalletAccount =
  | { kind: "injected"; address: string; chainId: string; provider: EthereumProvider }
  | { kind: "circle"; address: string; chainId: string; walletId: string; provider: EthereumProvider };

export type WalletStatus = "checking" | "unavailable" | "disconnected" | "connecting" | "connected" | "error";

export type EthereumProvider = {
  request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getWalletProvider(account: WalletAccount): EthereumProvider | null {
  return account.provider;
}
