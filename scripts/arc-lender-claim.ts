import { network } from "hardhat";
import { getAddress, type Address } from "viem";

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [lender] = await viem.getWalletClients();
const loanPositionTokenAddress = readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS");
const positionId = readUintEnv("POSITION_ID");

console.log(`Claiming ARC lender payout on chain ${await publicClient.getChainId()}`);
console.log(`Lender signer: ${getAddress(lender.account.address)}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", loanPositionTokenAddress);
const claimable = await loanPositionToken.read.getClaimable([positionId]) as bigint;
console.log(`Claimable amount: ${claimable.toString()}`);

const txHash = await loanPositionToken.write.claim([positionId]);
console.log(`claim tx: ${txHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") {
  throw new Error(`claim failed: ${txHash}`);
}

console.log("");
console.log("Lender payout claimed:");
console.log(`POSITION_ID=${positionId.toString()}`);
console.log(`CLAIMED_AMOUNT=${claimable.toString()}`);

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
