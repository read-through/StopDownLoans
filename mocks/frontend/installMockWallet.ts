import { enableMockWallet } from "../../frontend/src/config";
import type { EthereumProvider } from "../../frontend/src/wallet";
import { mockWalletProvider } from "./mockWallet";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function installMockWallet(): void {
  if (!enableMockWallet) {
    return;
  }

  window.ethereum = mockWalletProvider;
}
