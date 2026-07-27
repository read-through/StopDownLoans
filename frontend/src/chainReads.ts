import type { EthereumProvider } from "./wallet";

export type OutcomeMarketState = "Proto" | "Active" | "Cancelled" | "Resolved";
export type WinningOutcome = "None" | "YES" | "NO";

export type ContractAddresses = {
  loanPositionToken: string | null;
  outcomeExchange: string | null;
  outcomeToken: string | null;
  usdc: string | null;
};

export type WalletBalances = {
  usdcBalance: bigint;
  loanAllowance: bigint | null;
  exchangeAllowance: bigint | null;
  outcomeAllowance: bigint | null;
  outcomeExchangeApproved: boolean | null;
  selectedMarket: {
    yesBalance: bigint;
    noBalance: bigint;
    marketState: OutcomeMarketState;
    pairMintable: bigint;
    unmintedPairDeposit: bigint;
    winningOutcome: WinningOutcome;
  } | null;
};

const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";
const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";
const ERC1155_BALANCE_OF_SELECTOR = "0x00fdd58e";
const GET_MARKET_VIEW_SELECTOR = "0xc64198d3";
const GET_PAIR_MINTABLE_SELECTOR = "0xc89d359b";
const GET_UNMINTED_PAIR_DEPOSIT_SELECTOR = "0x2fd1fa3b";
const GET_YES_TOKEN_ID_SELECTOR = "0x1d466787";
const GET_NO_TOKEN_ID_SELECTOR = "0xc1fa004e";

export async function readWalletBalances(params: {
  provider: EthereumProvider;
  account: string;
  contracts: ContractAddresses;
  selectedMarketId: string | null;
}): Promise<WalletBalances> {
  const { provider, account, contracts, selectedMarketId } = params;
  if (contracts.usdc === null) {
    throw new Error("VITE_USDC_ADDRESS is not configured.");
  }

  const [usdcBalance, loanAllowance, exchangeAllowance, outcomeAllowance, outcomeExchangeApproved, selectedMarket] = await Promise.all([
    readErc20Balance(provider, contracts.usdc, account),
    contracts.loanPositionToken === null
      ? Promise.resolve(null)
      : readErc20Allowance(provider, contracts.usdc, account, contracts.loanPositionToken),
    contracts.outcomeExchange === null
      ? Promise.resolve(null)
      : readErc20Allowance(provider, contracts.usdc, account, contracts.outcomeExchange),
    contracts.outcomeToken === null
      ? Promise.resolve(null)
      : readErc20Allowance(provider, contracts.usdc, account, contracts.outcomeToken),
    contracts.outcomeToken === null || contracts.outcomeExchange === null
      ? Promise.resolve(null)
      : readErc1155ApprovalForAll(provider, contracts.outcomeToken, account, contracts.outcomeExchange),
    contracts.outcomeToken === null || selectedMarketId === null
      ? Promise.resolve(null)
      : readSelectedMarketBalances(provider, contracts.outcomeToken, account, selectedMarketId),
  ]);

  return {
    usdcBalance,
    loanAllowance,
    exchangeAllowance,
    outcomeAllowance,
    outcomeExchangeApproved,
    selectedMarket,
  };
}

async function readSelectedMarketBalances(
  provider: EthereumProvider,
  outcomeToken: string,
  account: string,
  marketId: string
): Promise<WalletBalances["selectedMarket"]> {
  const [yesTokenId, noTokenId] = await Promise.all([
    readUint256(provider, outcomeToken, `${GET_YES_TOKEN_ID_SELECTOR}${strip0x(marketId)}`),
    readUint256(provider, outcomeToken, `${GET_NO_TOKEN_ID_SELECTOR}${strip0x(marketId)}`),
  ]);

  const [yesBalance, noBalance, marketView, pairMintable, unmintedPairDeposit] = await Promise.all([
    readErc1155Balance(provider, outcomeToken, account, yesTokenId),
    readErc1155Balance(provider, outcomeToken, account, noTokenId),
    readMarketView(provider, outcomeToken, marketId),
    readUint256OrZero(
      provider,
      outcomeToken,
      `${GET_PAIR_MINTABLE_SELECTOR}${strip0x(marketId)}${encodeAddress(account)}`
    ),
    readUint256OrZero(
      provider,
      outcomeToken,
      `${GET_UNMINTED_PAIR_DEPOSIT_SELECTOR}${strip0x(marketId)}${encodeAddress(account)}`
    ),
  ]);

  return {
    yesBalance,
    noBalance,
    marketState: marketView.marketState,
    pairMintable,
    unmintedPairDeposit,
    winningOutcome: marketView.winningOutcome,
  };
}

async function readMarketView(
  provider: EthereumProvider,
  outcomeToken: string,
  marketId: string
): Promise<{
  marketState: OutcomeMarketState;
  winningOutcome: WinningOutcome;
}> {
  const result = await readHexData(provider, outcomeToken, `${GET_MARKET_VIEW_SELECTOR}${strip0x(marketId)}`);
  const winningOutcome = BigInt(`0x${readWord(result, 4)}`);
  const marketState = BigInt(`0x${readWord(result, 5)}`);

  return {
    marketState: marketState === 0n ? "Proto" : marketState === 1n ? "Active" : marketState === 2n ? "Cancelled" : "Resolved",
    winningOutcome: winningOutcome === 1n ? "YES" : winningOutcome === 2n ? "NO" : "None",
  };
}

function readErc20Balance(provider: EthereumProvider, token: string, account: string): Promise<bigint> {
  return readUint256(provider, token, `${ERC20_BALANCE_OF_SELECTOR}${encodeAddress(account)}`);
}

function readErc20Allowance(
  provider: EthereumProvider,
  token: string,
  owner: string,
  spender: string
): Promise<bigint> {
  return readUint256(provider, token, `${ERC20_ALLOWANCE_SELECTOR}${encodeAddress(owner)}${encodeAddress(spender)}`);
}

function readErc1155Balance(
  provider: EthereumProvider,
  token: string,
  account: string,
  tokenId: bigint
): Promise<bigint> {
  return readUint256(provider, token, `${ERC1155_BALANCE_OF_SELECTOR}${encodeAddress(account)}${encodeUint256(tokenId)}`);
}

async function readErc1155ApprovalForAll(
  provider: EthereumProvider,
  token: string,
  account: string,
  operator: string
): Promise<boolean> {
  const result = await readUint256(provider, token, `0xe985e9c5${encodeAddress(account)}${encodeAddress(operator)}`);
  return result !== 0n;
}

async function readUint256(provider: EthereumProvider, to: string, data: string): Promise<bigint> {
  const result = await readHexData(provider, to, data);
  return BigInt(result);
}

async function readHexData(provider: EthereumProvider, to: string, data: string): Promise<string> {
  const result = await provider.request({
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });

  if (typeof result !== "string" || !/^0x[a-fA-F0-9]*$/.test(result)) {
    throw new Error("eth_call returned invalid hex data.");
  }

  return result;
}

async function readUint256OrZero(provider: EthereumProvider, to: string, data: string): Promise<bigint> {
  try {
    return await readUint256(provider, to, data);
  } catch {
    return 0n;
  }
}

function encodeAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM address.");
  }

  return strip0x(address).padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  if (value < 0n) {
    throw new Error("uint256 cannot be negative.");
  }

  return value.toString(16).padStart(64, "0");
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function readWord(hexData: string, index: number): string {
  const start = 2 + index * 64;
  const word = hexData.slice(start, start + 64);
  if (word.length !== 64) {
    throw new Error("eth_call returned too little data.");
  }

  return word;
}
