import { network } from "hardhat";
import { getAddress, type Address } from "viem";

type LoanView = {
  borrower: Address;
  repaymentAmount: bigint;
  state: number;
  marketId: `0x${string}`;
};

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [payer] = await viem.getWalletClients();
const payerAddress = getAddress(payer.account.address);
const loanPositionTokenAddress = readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS");
const loanId = readUintEnv("LOAN_ID");

console.log(`Repaying ARC demo loan on chain ${await publicClient.getChainId()}`);
console.log(`Payer signer: ${payerAddress}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const loanView = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
const usdc = await viem.getContractAt("IArcUsdc", await loanPositionToken.read.usdc() as Address);

const approveTx = await usdc.write.approve([loanPositionTokenAddress, loanView.repaymentAmount]);
console.log(`USDC approve tx: ${approveTx}`);
await publicClient.waitForTransactionReceipt({ hash: approveTx });

const depositTx = await loanPositionToken.write.depositToLoan([loanId, loanView.repaymentAmount]);
console.log(`depositToLoan tx: ${depositTx}`);
let receipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
if (receipt.status !== "success") {
  throw new Error(`depositToLoan failed: ${depositTx}`);
}

const settleTx = await loanPositionToken.write.settleRepaid([loanId]);
console.log(`settleRepaid tx: ${settleTx}`);
receipt = await publicClient.waitForTransactionReceipt({ hash: settleTx });
if (receipt.status !== "success") {
  throw new Error(`settleRepaid failed: ${settleTx}`);
}

const settledLoanView = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
console.log("");
console.log("Loan repaid:");
console.log(`LOAN_ID=${loanId.toString()}`);
console.log(`MARKET_ID=${settledLoanView.marketId}`);
console.log(`REPAYMENT_AMOUNT=${settledLoanView.repaymentAmount.toString()}`);
console.log(`LOAN_STATE=${settledLoanView.state.toString()} (4 = Repaid)`);

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
