import { network } from "hardhat";
import { getAddress, parseEventLogs, type Address } from "viem";

type LoanCreatedArgs = {
  loanId: bigint;
  marketId: `0x${string}`;
};

type LoanView = {
  borrower: Address;
  repaymentAmount: bigint;
  borrowerCollateralAmount: bigint;
  marketId: `0x${string}`;
};

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [borrower] = await viem.getWalletClients();
const borrowerAddress = getAddress(borrower.account.address);
const loanPositionTokenAddress = readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS");
const outcomeTokenAddress = readAddressEnv("OUTCOME_TOKEN_ADDRESS");
const principal = readUintEnv("LOAN_PRINCIPAL");
const interestBps = readUintEnv("LOAN_INTEREST_BPS");
const loanWithdrawFreezeDeadline = readUintEnv("LOAN_WITHDRAW_FREEZE_DEADLINE");
const activationDeadline = readUintEnv("LOAN_ACTIVATION_DEADLINE");
const repaymentDeadline = readUintEnv("LOAN_REPAYMENT_DEADLINE");

console.log(`Creating ARC demo loan on chain ${await publicClient.getChainId()}`);
console.log(`Borrower signer: ${borrowerAddress}`);
console.log(`LoanPositionToken: ${loanPositionTokenAddress}`);
console.log(`OutcomeToken: ${outcomeTokenAddress}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const outcomeToken = await viem.getContractAt("OutcomeToken", outcomeTokenAddress);

const txHash = await loanPositionToken.write.createLoan([
  principal,
  interestBps,
  loanWithdrawFreezeDeadline,
  activationDeadline,
  repaymentDeadline,
]);
console.log(`createLoan tx: ${txHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") {
  throw new Error(`createLoan transaction failed: ${txHash}`);
}

const [loanCreated] = parseEventLogs({
  abi: loanPositionToken.abi,
  eventName: "LoanCreated",
  logs: receipt.logs,
}) as Array<{ args: LoanCreatedArgs }>;

if (loanCreated === undefined) {
  throw new Error("LoanCreated event was not found in createLoan receipt.");
}

const loanId = loanCreated.args.loanId;
const marketId = loanCreated.args.marketId;
const loanView = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
const market = await outcomeToken.read.markets([marketId]) as readonly [bigint, Address, bigint, number, number];

assertEqualAddress("loan borrower", loanView.borrower, borrowerAddress);
assertEqual("loan marketId", loanView.marketId, marketId);
assertEqual("market loanId", market[0], loanId);
assertEqualAddress("market borrower", market[1], borrowerAddress);

console.log("");
console.log("Demo loan created:");
console.log(`LOAN_ID=${loanId.toString()}`);
console.log(`MARKET_ID=${marketId}`);
console.log(`BORROWER_COLLATERAL_AMOUNT=${loanView.borrowerCollateralAmount.toString()}`);
console.log(`REPAYMENT_AMOUNT=${loanView.repaymentAmount.toString()}`);
console.log("");
console.log("Create backend CLOB market config:");
console.log(
  [
    "npm.cmd run market-config:upsert --",
    `--outcome-token ${outcomeTokenAddress}`,
    `--market-id ${marketId}`,
    "--default-tick-units 1000",
    "--edge-tick-units 100",
    "--lower-edge-price-units 100000",
    "--upper-edge-price-units 900000",
  ].join(" ")
);

function readAddressEnv(key: string): Address {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  return getAddress(value);
}

function readUintEnv(key: string): bigint {
  const value = process.env[key];
  if (value === undefined || value.trim() === "" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${key} must be a non-negative integer string.`);
  }

  return BigInt(value);
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertEqualAddress(label: string, actual: unknown, expected: Address): void {
  const normalizedActual = getAddress(String(actual));
  if (normalizedActual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${normalizedActual}`);
  }
}
