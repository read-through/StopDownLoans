import { network } from "hardhat";
import {
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  parseEther,
  parseEventLogs,
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

type OrderFilledArgs = {
  orderHash: Hex;
  maker: Address;
  counterparty: Address;
  outcomeFillAmount: bigint;
  usdcFillAmount: bigint;
  totalFilledAmount: bigint;
  remainingAmount: bigint;
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
const [sellerOperator] = await viem.getWalletClients();
const sellerAddress = getAddress(sellerOperator.account.address);
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
const loanId = readUintEnv("LOAN_ID");

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const outcomeToken = await viem.getContractAt("OutcomeToken", outcomeTokenAddress);
const outcomeExchange = await viem.getContractAt("OutcomeExchange", outcomeExchangeAddress);
const usdc = await viem.getContractAt("IArcUsdc", await loanPositionToken.read.usdc() as Address);

const loan = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
if (loan.state !== 2) {
  throw new Error(`Loan ${loanId.toString()} must be Active. Current state=${loan.state.toString()}.`);
}
if (getAddress(loan.borrower) !== sellerAddress) {
  throw new Error(`This demo expects borrower/seller signer ${sellerAddress}, got ${loan.borrower}.`);
}

const market = await outcomeToken.read.getMarketView([loan.marketId]) as MarketView;
const sellOutcomeAmount = 200_000n;
const makerUsdcAmount = 120_000n;
const buyerLimitUsdcAmount = 140_000n;
const buyerUsdcFundingAmount = 500_000n;
const buyerGasFundingAmount = parseEther("0.05");
const expiration = BigInt(Math.floor(Date.now() / 1000) + 3_600);
const nonceBase = process.hrtime.bigint();

console.log("ARC active loan trade demo");
console.log(`Loan: ${loanId.toString()}`);
console.log(`Market: ${loan.marketId}`);
console.log(`Seller/borrower: ${sellerAddress}`);
console.log(`Temporary buyer: ${buyerAddress}`);

const sellerYesBefore = await outcomeToken.read.balanceOf([sellerAddress, market.yesTokenId]) as bigint;
if (sellerYesBefore < sellOutcomeAmount) {
  throw new Error(`Seller YES balance is too low: ${sellerYesBefore.toString()}.`);
}

await waitForTx(
  "fund buyer native gas",
  await sellerOperator.sendTransaction({
    to: buyerAddress,
    value: buyerGasFundingAmount,
  })
);
await waitForTx(
  "fund buyer USDC",
  await usdc.write.transfer([buyerAddress, buyerUsdcFundingAmount])
);
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

const makerSignature = await sellerOperator.signTypedData({
  domain: eip712Domain(await publicClient.getChainId(), outcomeExchangeAddress),
  types: orderTypes,
  primaryType: "Order",
  message: makerOrder,
});
const takerSignature = await buyer.signTypedData({
  domain: eip712Domain(await publicClient.getChainId(), outcomeExchangeAddress),
  types: orderTypes,
  primaryType: "Order",
  message: takerOrder,
});

const sellerUsdcBefore = await usdc.read.balanceOf([sellerAddress]) as bigint;
const buyerUsdcBefore = await usdc.read.balanceOf([buyerAddress]) as bigint;
const buyerYesBefore = await outcomeToken.read.balanceOf([buyerAddress, market.yesTokenId]) as bigint;

const matchTx = await outcomeExchange.write.matchOrders([
  takerOrder,
  takerSignature,
  [makerOrder],
  [makerSignature],
  [sellOutcomeAmount],
]);
const receipt = await waitForTx("match YES sell order against buyer", matchTx);

const sellerUsdcAfter = await usdc.read.balanceOf([sellerAddress]) as bigint;
const buyerUsdcAfter = await usdc.read.balanceOf([buyerAddress]) as bigint;
const sellerYesAfter = await outcomeToken.read.balanceOf([sellerAddress, market.yesTokenId]) as bigint;
const buyerYesAfter = await outcomeToken.read.balanceOf([buyerAddress, market.yesTokenId]) as bigint;

const fills = parseEventLogs({
  abi: outcomeExchange.abi,
  eventName: "OrderFilled",
  logs: receipt.logs,
}) as Array<{ args: OrderFilledArgs }>;

console.log("");
console.log("Trade result:");
console.log(`SELLER_USDC_DELTA=${formatUnits(sellerUsdcAfter - sellerUsdcBefore, 6)}`);
console.log(`BUYER_USDC_DELTA=${formatUnits(buyerUsdcAfter - buyerUsdcBefore, 6)}`);
console.log(`SELLER_YES_DELTA=${formatUnits(sellerYesAfter - sellerYesBefore, 6)}`);
console.log(`BUYER_YES_DELTA=${formatUnits(buyerYesAfter - buyerYesBefore, 6)}`);
console.log(`ORDER_FILLED_EVENTS=${fills.length.toString()}`);
for (const [index, fill] of fills.entries()) {
  console.log(
    `FILL_${index.toString()}=${fill.args.outcomeFillAmount.toString()} YES for ${fill.args.usdcFillAmount.toString()} USDC_BASE_UNITS`
  );
}

async function waitForTx(label: string, hash: Hex) {
  console.log(`${label} tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} failed: ${hash}`);
  }

  return receipt;
}

function eip712Domain(chainId: number, verifyingContract: Address) {
  return {
    name: "StopDownOutcomeExchange",
    version: "1",
    chainId,
    verifyingContract,
  };
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
