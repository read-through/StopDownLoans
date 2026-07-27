import { network } from "hardhat";
import { getAddress, type Address } from "viem";

type LoanView = {
  state: number;
  marketId: `0x${string}`;
};

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [caller] = await viem.getWalletClients();
const loanPositionTokenAddress = readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS");
const loanId = readUintEnv("LOAN_ID");

console.log(`Activating ARC demo loan on chain ${await publicClient.getChainId()}`);
console.log(`Caller signer: ${getAddress(caller.account.address)}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const txHash = await loanPositionToken.write.activate([loanId]);
console.log(`activate tx: ${txHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") {
  throw new Error(`activate failed: ${txHash}`);
}

const loanView = await loanPositionToken.read.getLoanView([loanId]) as LoanView;
console.log("");
console.log("Loan activated:");
console.log(`LOAN_ID=${loanId.toString()}`);
console.log(`MARKET_ID=${loanView.marketId}`);
console.log(`LOAN_STATE=${loanView.state.toString()} (2 = Active)`);

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
