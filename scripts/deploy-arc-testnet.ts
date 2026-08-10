import { network } from "hardhat";
import { readFile, writeFile } from "node:fs/promises";
import { getAddress, keccak256, type Address, type Hex } from "viem";

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const deployerAddress = getAddress(deployer.account.address);
const collateralToken = getAddress(process.env.COLLATERAL_TOKEN_ADDRESS ?? ARC_TESTNET_USDC);
const erc1155MetadataUri = process.env.ERC1155_METADATA_URI ?? "";
const platformFeeBps = 0n;
const chainId = await publicClient.getChainId();
const deployerGasBalance = await publicClient.getBalance({ address: deployerAddress });
const collateralBytecode = await publicClient.getBytecode({ address: collateralToken });

if (chainId !== 5_042_002) {
  throw new Error(`Expected ARC Testnet chain 5042002, got ${chainId}.`);
}
if (collateralBytecode === undefined || collateralBytecode === "0x") {
  throw new Error(`No ARC USDC bytecode found at ${collateralToken}.`);
}
if (deployerGasBalance === 0n) {
  throw new Error(`Fund ${deployerAddress} with ARC Testnet USDC before deployment.`);
}

console.log(`Deploying StopDown contracts to chain ${chainId}`);
console.log(`Deployer: ${deployerAddress}`);
console.log(`Collateral token: ${collateralToken}`);

const loanPositionToken = await viem.deployContract("LoanPositionToken", [
  collateralToken,
  deployerAddress,
  platformFeeBps,
  deployerAddress,
  erc1155MetadataUri,
]);
console.log(`LoanPositionToken: ${loanPositionToken.address}`);

const outcomeToken = await viem.deployContract("OutcomeToken", [
  loanPositionToken.address,
  collateralToken,
  erc1155MetadataUri,
]);
console.log(`OutcomeToken: ${outcomeToken.address}`);

const outcomeExchange = await viem.deployContract("OutcomeExchange", [
  collateralToken,
  deployerAddress,
]);
console.log(`OutcomeExchange: ${outcomeExchange.address}`);

await loanPositionToken.write.setOutcomeToken([outcomeToken.address]);
console.log("LoanPositionToken outcome token configured");

await outcomeExchange.write.setOperator([deployerAddress, true]);
console.log("Deployer authorized as OutcomeExchange operator");

const bytecodeHashes = {
  loanPositionToken: await runtimeBytecodeHash(loanPositionToken.address),
  outcomeToken: await runtimeBytecodeHash(outcomeToken.address),
  outcomeExchange: await runtimeBytecodeHash(outcomeExchange.address),
};

await persistDeploymentEnv({
  loanPositionToken: loanPositionToken.address,
  outcomeToken: outcomeToken.address,
  outcomeExchange: outcomeExchange.address,
  collateralToken,
}, bytecodeHashes);
console.log("Saved deployment addresses and bytecode hashes to config/env/arc-deploy.env");

printEnv({
  loanPositionToken: loanPositionToken.address,
  outcomeToken: outcomeToken.address,
  outcomeExchange: outcomeExchange.address,
  collateralToken,
}, bytecodeHashes);

function printEnv(addresses: {
  loanPositionToken: Address;
  outcomeToken: Address;
  outcomeExchange: Address;
  collateralToken: Address;
}, bytecodeHashes: {
  loanPositionToken: Hex;
  outcomeToken: Hex;
  outcomeExchange: Hex;
}): void {
  console.log("");
  console.log("Backend env:");
  console.log(`ARC_CHAIN_ID=5042002`);
  console.log(`ARC_RPC_URL=${process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"}`);
  console.log(`LOAN_POSITION_TOKEN_ADDRESS=${addresses.loanPositionToken}`);
  console.log(`OUTCOME_TOKEN_ADDRESS=${addresses.outcomeToken}`);
  console.log(`USDC_ADDRESS=${addresses.collateralToken}`);
  console.log(`OUTCOME_EXCHANGE_ADDRESS=${addresses.outcomeExchange}`);
  console.log(`LOAN_POSITION_TOKEN_BYTECODE_HASH=${bytecodeHashes.loanPositionToken}`);
  console.log(`OUTCOME_TOKEN_BYTECODE_HASH=${bytecodeHashes.outcomeToken}`);
  console.log(`OUTCOME_EXCHANGE_BYTECODE_HASH=${bytecodeHashes.outcomeExchange}`);
  console.log("");
  console.log("Frontend env:");
  console.log(`VITE_ARC_CHAIN_ID=5042002`);
  console.log(`VITE_CLOB_API_URL=http://127.0.0.1:3000`);
  console.log(`VITE_CLOB_WS_URL=ws://127.0.0.1:3000/v1/ws`);
  console.log(`VITE_LOAN_POSITION_TOKEN_ADDRESS=${addresses.loanPositionToken}`);
  console.log(`VITE_OUTCOME_TOKEN_ADDRESS=${addresses.outcomeToken}`);
  console.log(`VITE_OUTCOME_EXCHANGE_ADDRESS=${addresses.outcomeExchange}`);
  console.log(`VITE_USDC_ADDRESS=${addresses.collateralToken}`);
}

async function runtimeBytecodeHash(address: Address): Promise<Hex> {
  const bytecode = await publicClient.getBytecode({ address });
  if (bytecode === undefined || bytecode === "0x") {
    throw new Error(`Deployment at ${address} has no runtime bytecode.`);
  }
  return keccak256(bytecode);
}

async function persistDeploymentEnv(addresses: {
  loanPositionToken: Address;
  outcomeToken: Address;
  outcomeExchange: Address;
  collateralToken: Address;
}, bytecodeHashes: {
  loanPositionToken: Hex;
  outcomeToken: Hex;
  outcomeExchange: Hex;
}): Promise<void> {
  const envPath = "config/env/arc-deploy.env";
  let contents = await readFile(envPath, "utf8");
  const values: Record<string, string> = {
    LOAN_POSITION_TOKEN_ADDRESS: addresses.loanPositionToken,
    OUTCOME_TOKEN_ADDRESS: addresses.outcomeToken,
    OUTCOME_EXCHANGE_ADDRESS: addresses.outcomeExchange,
    LOAN_POSITION_TOKEN_BYTECODE_HASH: bytecodeHashes.loanPositionToken,
    OUTCOME_TOKEN_BYTECODE_HASH: bytecodeHashes.outcomeToken,
    OUTCOME_EXCHANGE_BYTECODE_HASH: bytecodeHashes.outcomeExchange,
    USDC_ADDRESS: addresses.collateralToken,
    EXPECTED_OWNER_ADDRESS: deployerAddress,
    EXPECTED_OPERATOR_ADDRESS: deployerAddress,
  };

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    contents = pattern.test(contents)
      ? contents.replace(pattern, line)
      : `${contents.trimEnd()}\n${line}\n`;
  }

  await writeFile(envPath, contents, "utf8");
}
