import { network } from "hardhat";
import {
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "../backend/src/clob/chain/arc.js";

type LoanView = {
  borrower: Address;
  marketId: Hex;
  state: number;
};

type MarketView = {
  yesTokenId: bigint;
  noTokenId: bigint;
  state: number;
};

type SubmitOrderResponse = {
  orderHash: Hex;
  createdTradeIds: string[];
};

type TradeView = {
  tradeId: string;
  status: string;
  txHash: Hex | null;
};

const orderTypes = {
  Order: [
    { name: "maker", type: "address" },
    { name: "outcomeToken", type: "address" },
    { name: "marketId", type: "bytes32" },
    { name: "outcome", type: "uint8" },
    { name: "side", type: "uint8" },
    { name: "outcomeAmount", type: "uint256" },
    { name: "usdcAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();
const sellerAddress = getAddress(seller.account.address);
const buyerPrivateKey = generatePrivateKey();
const buyer = createWalletClient({
  account: privateKeyToAccount(buyerPrivateKey),
  chain: arcTestnet,
  transport: http(readStringEnv("ARC_RPC_URL")),
});
const buyerAddress = getAddress(buyer.account.address);

const loanPositionTokenAddress = readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS");
const outcomeTokenAddress = readAddressEnv("OUTCOME_TOKEN_ADDRESS");
const outcomeExchangeAddress = readAddressEnv("OUTCOME_EXCHANGE_ADDRESS");
const clobApiUrl = process.env.CLOB_API_URL ?? "http://127.0.0.1:3000";
const loanId = readUintEnv("LOAN_ID");

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const outcomeToken = await viem.getContractAt("OutcomeToken", outcomeTokenAddress);
const usdc = await viem.getContractAt("MockUSDC", await loanPositionToken.read.usdc() as Address);

const loan = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
if (loan.state !== 2) {
  throw new Error(`Loan ${loanId.toString()} must be Active. Current state=${loan.state.toString()}.`);
}
if (getAddress(loan.borrower) !== sellerAddress) {
  throw new Error(`This script expects borrower/seller signer ${sellerAddress}, got ${loan.borrower}.`);
}

const market = await outcomeToken.read.getMarketView([loan.marketId]) as MarketView;
const chainId = await publicClient.getChainId();
const latestBlock = await publicClient.getBlock();
const sellOutcomeAmount = 200_000n;
const makerUsdcAmount = 120_000n;
const buyerLimitUsdcAmount = 140_000n;
const buyerUsdcFundingAmount = 500_000n;
const buyerGasFundingAmount = parseEther("0.05");
const expiration = latestBlock.timestamp + 3_600n;
const nonceBase = process.hrtime.bigint();

console.log("ARC CLOB live trade through backend");
console.log(`Loan: ${loanId.toString()}`);
console.log(`Market: ${loan.marketId}`);
console.log(`Backend: ${clobApiUrl}`);
console.log(`Seller/borrower: ${sellerAddress}`);
console.log(`Temporary buyer: ${buyerAddress}`);

const sellerYesBefore = await outcomeToken.read.balanceOf([sellerAddress, market.yesTokenId]) as bigint;
if (sellerYesBefore < sellOutcomeAmount) {
  throw new Error(`Seller YES balance is too low: ${sellerYesBefore.toString()}.`);
}

await waitForTx("fund buyer native gas", await seller.sendTransaction({
  to: buyerAddress,
  value: buyerGasFundingAmount,
}));
await waitForTx("fund buyer USDC", await usdc.write.transfer([buyerAddress, buyerUsdcFundingAmount]));
await waitForTx(
  "seller approves OutcomeExchange for YES",
  await outcomeToken.write.setApprovalForAll([outcomeExchangeAddress, true])
);
await waitForTx(
  "buyer approves OutcomeExchange for USDC",
  await buyer.writeContract({
    address: usdc.address,
    abi: usdc.abi,
    functionName: "approve",
    args: [outcomeExchangeAddress, buyerLimitUsdcAmount],
  })
);

const makerOrder = {
  maker: sellerAddress,
  outcomeToken: outcomeTokenAddress,
  marketId: loan.marketId,
  outcome: 0,
  side: 1,
  outcomeAmount: sellOutcomeAmount,
  usdcAmount: makerUsdcAmount,
  expiration,
  nonce: nonceBase,
};
const takerOrder = {
  maker: buyerAddress,
  outcomeToken: outcomeTokenAddress,
  marketId: loan.marketId,
  outcome: 0,
  side: 0,
  outcomeAmount: sellOutcomeAmount,
  usdcAmount: buyerLimitUsdcAmount,
  expiration,
  nonce: nonceBase + 1n,
};

const makerSignature = await seller.signTypedData({
  domain: eip712Domain(chainId, outcomeExchangeAddress),
  types: orderTypes,
  primaryType: "Order",
  message: makerOrder,
});
const takerSignature = await buyer.signTypedData({
  domain: eip712Domain(chainId, outcomeExchangeAddress),
  types: orderTypes,
  primaryType: "Order",
  message: takerOrder,
});

const sellerUsdcBefore = await usdc.read.balanceOf([sellerAddress]) as bigint;
const buyerUsdcBefore = await usdc.read.balanceOf([buyerAddress]) as bigint;
const buyerYesBefore = await outcomeToken.read.balanceOf([buyerAddress, market.yesTokenId]) as bigint;

const makerSubmit = await postJson<SubmitOrderResponse>(`${clobApiUrl}/v1/orders`, {
  order: toOrderDto(makerOrder),
  signature: makerSignature,
  timeInForce: "GTC",
  priceUnits: "600000",
});
console.log(`Maker SELL accepted: ${makerSubmit.orderHash}`);

const takerSubmit = await postJson<SubmitOrderResponse>(`${clobApiUrl}/v1/orders`, {
  order: toOrderDto(takerOrder),
  signature: takerSignature,
  timeInForce: "FAK",
  priceUnits: "700000",
});
const tradeId = takerSubmit.createdTradeIds[0];
if (tradeId === undefined) {
  throw new Error("Taker BUY did not create a trade.");
}
console.log(`Taker BUY accepted: ${takerSubmit.orderHash}`);
console.log(`Trade created: ${tradeId}`);

const confirmedTrade = await waitForConfirmedTrade(tradeId, loan.marketId);
const sellerUsdcAfter = await usdc.read.balanceOf([sellerAddress]) as bigint;
const buyerUsdcAfter = await usdc.read.balanceOf([buyerAddress]) as bigint;
const buyerYesAfter = await outcomeToken.read.balanceOf([buyerAddress, market.yesTokenId]) as bigint;

console.log("");
console.log("Backend settlement result:");
console.log(`TRADE_ID=${confirmedTrade.tradeId}`);
console.log(`TRADE_STATUS=${confirmedTrade.status}`);
console.log(`TX_HASH=${confirmedTrade.txHash ?? ""}`);
console.log(`SELLER_USDC_DELTA=${formatUnits(sellerUsdcAfter - sellerUsdcBefore, 6)}`);
console.log(`BUYER_USDC_DELTA=${formatUnits(buyerUsdcAfter - buyerUsdcBefore, 6)}`);
console.log(`BUYER_YES_DELTA=${formatUnits(buyerYesAfter - buyerYesBefore, 6)}`);

async function waitForConfirmedTrade(tradeId: string, marketId: Hex): Promise<TradeView> {
  const deadline = Date.now() + 90_000;
  let lastTrade: TradeView | null = null;

  while (Date.now() < deadline) {
    const response = await getJson<{ trades: TradeView[] }>(
      `${clobApiUrl}/v1/trades?outcomeToken=${outcomeTokenAddress}&marketId=${marketId}&outcome=YES&limit=20`
    );
    lastTrade = response.trades.find((trade) => trade.tradeId === tradeId) ?? lastTrade;
    if (lastTrade?.status === "CONFIRMED") {
      return lastTrade;
    }

    await sleep(2_000);
  }

  throw new Error(`Trade ${tradeId} was not confirmed. Last status=${lastTrade?.status ?? "missing"}.`);
}

async function waitForTx(label: string, hash: Hex) {
  console.log(`${label} tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} failed: ${hash}`);
  }
}

function eip712Domain(chainId: number, verifyingContract: Address) {
  return {
    name: "StopDownOutcomeExchange",
    version: "1",
    chainId,
    verifyingContract,
  };
}

function toOrderDto(order: typeof makerOrder): Record<string, string> {
  return {
    maker: order.maker,
    outcomeToken: order.outcomeToken,
    marketId: order.marketId,
    outcome: order.outcome === 0 ? "YES" : "NO",
    side: order.side === 0 ? "BUY" : "SELL",
    outcomeAmount: order.outcomeAmount.toString(),
    usdcAmount: order.usdcAmount.toString(),
    expiration: new Date(Number(order.expiration) * 1000).toISOString(),
    nonce: order.nonce.toString(),
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as T | { error?: { message?: string } };
  if (!response.ok) {
    const message = "error" in parsed ? parsed.error?.message : undefined;
    throw new Error(`POST ${url} failed: ${message ?? JSON.stringify(parsed)}`);
  }

  return parsed as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const parsed = (await response.json()) as T | { error?: { message?: string } };
  if (!response.ok) {
    const message = "error" in parsed ? parsed.error?.message : undefined;
    throw new Error(`GET ${url} failed: ${message ?? JSON.stringify(parsed)}`);
  }

  return parsed as T;
}

function readAddressEnv(key: string): Address {
  return getAddress(readStringEnv(key));
}

function readStringEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function readUintEnv(key: string): bigint {
  const value = readStringEnv(key);
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${key} must be a non-negative integer string.`);
  }

  return BigInt(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
