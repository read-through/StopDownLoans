import { network } from "hardhat";
import { getAddress, parseEventLogs, type Address } from "viem";

type LoanView = {
  principal: bigint;
  fundedAmount: bigint;
  state: number;
};

type FundedArgs = {
  positionId: bigint;
  acceptedAmount: bigint;
};

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [lender] = await viem.getWalletClients();
const lenderAddress = getAddress(lender.account.address);
const loanPositionTokenAddress = readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS");
const loanId = readUintEnv("LOAN_ID");

console.log(`Funding ARC demo loan on chain ${await publicClient.getChainId()}`);
console.log(`Lender signer: ${lenderAddress}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const loanView = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
const remainingPrincipal = loanView.principal - loanView.fundedAmount;
if (remainingPrincipal <= 0n) {
  throw new Error(`Loan ${loanId.toString()} has no remaining principal to fund.`);
}

const usdc = await viem.getContractAt("MockUSDC", await loanPositionToken.read.usdc() as Address);
const approveTx = await usdc.write.approve([loanPositionTokenAddress, remainingPrincipal]);
console.log(`USDC approve tx: ${approveTx}`);
await publicClient.waitForTransactionReceipt({ hash: approveTx });

const fundTx = await loanPositionToken.write.fund([loanId, remainingPrincipal]);
console.log(`fund tx: ${fundTx}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: fundTx });
if (receipt.status !== "success") {
  throw new Error(`fund failed: ${fundTx}`);
}

const [funded] = parseEventLogs({
  abi: loanPositionToken.abi,
  eventName: "Funded",
  logs: receipt.logs,
}) as Array<{ args: FundedArgs }>;

if (funded === undefined) {
  throw new Error("Funded event was not found in fund receipt.");
}

console.log("");
console.log("Loan funded:");
console.log(`LOAN_ID=${loanId.toString()}`);
console.log(`POSITION_ID=${funded.args.positionId.toString()}`);
console.log(`FUNDED_AMOUNT=${funded.args.acceptedAmount.toString()}`);

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
