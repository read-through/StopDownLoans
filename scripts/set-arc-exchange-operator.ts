import { network } from "hardhat";
import { getAddress, type Address } from "viem";

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [owner] = await viem.getWalletClients();
const outcomeExchangeAddress = readAddressEnv("OUTCOME_EXCHANGE_ADDRESS");
const operator = readAddressEnv("EXCHANGE_OPERATOR_ADDRESS");
const allowed = readBooleanEnv("EXCHANGE_OPERATOR_ALLOWED", true);

console.log(`Configuring OutcomeExchange operator on chain ${await publicClient.getChainId()}`);
console.log(`Owner signer: ${getAddress(owner.account.address)}`);
console.log(`OutcomeExchange: ${outcomeExchangeAddress}`);
console.log(`Operator: ${operator}`);
console.log(`Allowed: ${allowed}`);

const outcomeExchange = await viem.getContractAt("OutcomeExchange", outcomeExchangeAddress);
const before = await outcomeExchange.read.operators([operator]);
console.log(`Before: ${before}`);

if (before === allowed) {
  console.log("No change required.");
  process.exit(0);
}

const txHash = await outcomeExchange.write.setOperator([operator, allowed]);
console.log(`setOperator tx: ${txHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") {
  throw new Error(`setOperator transaction failed: ${txHash}`);
}

const after = await outcomeExchange.read.operators([operator]);
if (after !== allowed) {
  throw new Error(`Operator state mismatch after transaction. Expected ${allowed}, got ${after}`);
}

console.log(`After: ${after}`);

function readAddressEnv(key: string): Address {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  return getAddress(value);
}

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${key} must be true or false.`);
}
