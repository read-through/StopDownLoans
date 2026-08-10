import { network } from "hardhat";
import { formatEther, getAddress } from "viem";

const EXPECTED_CHAIN_ID = 5_042_002;
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

const { viem } = await network.create({ network: "arcTestnet" });
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const deployerAddress = getAddress(deployer.account.address);
const collateralToken = getAddress(process.env.COLLATERAL_TOKEN_ADDRESS ?? ARC_TESTNET_USDC);

const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Expected ARC Testnet chain ${EXPECTED_CHAIN_ID}, got ${chainId}.`);
}

const collateralBytecode = await publicClient.getBytecode({ address: collateralToken });
if (collateralBytecode === undefined || collateralBytecode === "0x") {
  throw new Error(`No ARC USDC bytecode found at ${collateralToken}.`);
}

const gasBalance = await publicClient.getBalance({ address: deployerAddress });

console.log(`ARC deployment configuration is valid for chain ${chainId}`);
console.log(`Deployer: ${deployerAddress}`);
console.log(`ARC USDC: ${collateralToken}`);
console.log(`Native gas balance: ${formatEther(gasBalance)} USDC`);

if (gasBalance === 0n) {
  throw new Error(`Fund ${deployerAddress} with ARC Testnet USDC before deployment.`);
}

console.log("ARC deployer is ready to submit deployment transactions");
