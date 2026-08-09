const expectedArcChainIdInput = import.meta.env.VITE_ARC_CHAIN_ID ?? "5042002";

export const expectedArcChainIdHex = toHexChainId(expectedArcChainIdInput);
export const expectedArcChainIdNumber = toChainIdNumber(expectedArcChainIdInput);
export const arcWalletChain = {
  chainId: expectedArcChainIdHex,
  chainName: import.meta.env.VITE_ARC_CHAIN_NAME ?? "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: [import.meta.env.VITE_ARC_RPC_URL ?? "https://rpc.testnet.arc.network"],
  blockExplorerUrls: [import.meta.env.VITE_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app"],
};
export const frontendContracts = {
  loanPositionToken: normalizeOptionalAddress(import.meta.env.VITE_LOAN_POSITION_TOKEN_ADDRESS),
  outcomeExchange: normalizeOptionalAddress(import.meta.env.VITE_OUTCOME_EXCHANGE_ADDRESS),
  outcomeToken: normalizeOptionalAddress(import.meta.env.VITE_OUTCOME_TOKEN_ADDRESS),
  usdc: normalizeOptionalAddress(import.meta.env.VITE_USDC_ADDRESS),
};

function toHexChainId(value: string): string {
  if (/^0x[a-fA-F0-9]+$/.test(value)) {
    return value.toLowerCase();
  }

  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("VITE_ARC_CHAIN_ID must be a decimal or hex chain id.");
  }

  return `0x${BigInt(value).toString(16)}`;
}

function toChainIdNumber(value: string): number {
  const parsed = value.startsWith("0x") ? BigInt(value) : BigInt(value);
  const numberValue = Number(parsed);
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    throw new Error("VITE_ARC_CHAIN_ID must fit into a positive safe integer.");
  }

  return numberValue;
}

function normalizeOptionalAddress(value: string | undefined): string | null {
  if (value === undefined || value.length === 0 || /^0x0{40}$/i.test(value)) {
    return null;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error("Frontend contract addresses must be 20-byte hex values.");
  }

  return value;
}
