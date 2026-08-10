import { network } from "hardhat";
import { getAddress, type Address } from "viem";

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

console.log(`Deploying StopDown contracts to chain ${await publicClient.getChainId()}`);
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

printEnv({
  loanPositionToken: loanPositionToken.address,
  outcomeToken: outcomeToken.address,
  outcomeExchange: outcomeExchange.address,
  collateralToken,
});

function printEnv(addresses: {
  loanPositionToken: Address;
  outcomeToken: Address;
  outcomeExchange: Address;
  collateralToken: Address;
}): void {
  console.log("");
  console.log("Backend env:");
  console.log(`ARC_CHAIN_ID=5042002`);
  console.log(`ARC_RPC_URL=${process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"}`);
  console.log(`LOAN_POSITION_TOKEN_ADDRESS=${addresses.loanPositionToken}`);
  console.log(`OUTCOME_TOKEN_ADDRESS=${addresses.outcomeToken}`);
  console.log(`USDC_ADDRESS=${addresses.collateralToken}`);
  console.log(`OUTCOME_EXCHANGE_ADDRESS=${addresses.outcomeExchange}`);
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
