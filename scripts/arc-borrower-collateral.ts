import { network } from "hardhat";
import { getAddress, type Address } from "viem";

type LoanView = {
  borrower: Address;
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
const loanId = readUintEnv("LOAN_ID");

console.log(`Depositing ARC borrower collateral on chain ${await publicClient.getChainId()}`);
console.log(`Borrower signer: ${borrowerAddress}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const outcomeToken = await viem.getContractAt("OutcomeToken", outcomeTokenAddress);
const loanView = await loanPositionToken.read.getLoanView([loanId]) as LoanView;

assertEqualAddress("loan borrower", loanView.borrower, borrowerAddress);

const approveTx = await (await viem.getContractAt("IArcUsdc", await loanPositionToken.read.usdc() as Address))
  .write.approve([outcomeTokenAddress, loanView.borrowerCollateralAmount]);
console.log(`USDC approve tx: ${approveTx}`);
await publicClient.waitForTransactionReceipt({ hash: approveTx });

const depositTx = await outcomeToken.write.depositBorrowerCollateral([
  loanView.marketId,
  loanView.borrowerCollateralAmount,
]);
console.log(`depositBorrowerCollateral tx: ${depositTx}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
if (receipt.status !== "success") {
  throw new Error(`depositBorrowerCollateral failed: ${depositTx}`);
}

console.log("");
console.log("Borrower collateral deposited:");
console.log(`LOAN_ID=${loanId.toString()}`);
console.log(`MARKET_ID=${loanView.marketId}`);
console.log(`BORROWER_COLLATERAL_AMOUNT=${loanView.borrowerCollateralAmount.toString()}`);

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

function assertEqualAddress(label: string, actual: unknown, expected: Address): void {
  const normalizedActual = getAddress(String(actual));
  if (normalizedActual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${normalizedActual}`);
  }
}
