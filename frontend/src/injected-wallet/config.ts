import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { arcWalletChain, expectedArcChainIdNumber } from "../config";

const arcChain = defineChain({
  id: expectedArcChainIdNumber,
  name: arcWalletChain.chainName,
  nativeCurrency: arcWalletChain.nativeCurrency,
  rpcUrls: {
    default: { http: arcWalletChain.rpcUrls },
  },
  blockExplorers: arcWalletChain.blockExplorerUrls?.[0]
    ? {
        default: {
          name: "ARC Explorer",
          url: arcWalletChain.blockExplorerUrls[0],
        },
      }
    : undefined,
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [arcChain],
  multiInjectedProviderDiscovery: true,
  transports: {
    [arcChain.id]: http(arcWalletChain.rpcUrls[0]),
  },
});
