import { network } from "hardhat";
import { getAddress, type Address } from "viem";

type DeploymentEnv = {
  loanPositionToken: Address;
  outcomeToken: Address;
  outcomeExchange: Address;
  collateralToken: Address;
  expectedOwner: Address | undefined;
  expectedOperator: Address | undefined;
};

const { viem } = await network.create({
  network: "arcTestnet",
});

const publicClient = await viem.getPublicClient();
const deployment = readDeploymentEnv();

console.log(`Verifying StopDown deployment on chain ${await publicClient.getChainId()}`);

const loanPositionToken = await viem.getContractAt("LoanPositionToken", deployment.loanPositionToken);
const outcomeToken = await viem.getContractAt("OutcomeToken", deployment.outcomeToken);
const outcomeExchange = await viem.getContractAt("OutcomeExchange", deployment.outcomeExchange);

await assertEqualAddress("LoanPositionToken.outcomeToken", await loanPositionToken.read.outcomeToken(), deployment.outcomeToken);
await assertEqualAddress("LoanPositionToken.usdc", await loanPositionToken.read.usdc(), deployment.collateralToken);
await assertEqualAddress(
  "OutcomeToken.loanPositionToken",
  await outcomeToken.read.loanPositionToken(),
  deployment.loanPositionToken
);
await assertEqualAddress("OutcomeToken.collateralToken", await outcomeToken.read.collateralToken(), deployment.collateralToken);
await assertEqualAddress("OutcomeExchange.usdc", await outcomeExchange.read.usdc(), deployment.collateralToken);

if (deployment.expectedOwner !== undefined) {
  await assertEqualAddress("LoanPositionToken.owner", await loanPositionToken.read.owner(), deployment.expectedOwner);
  await assertEqualAddress("OutcomeExchange.owner", await outcomeExchange.read.owner(), deployment.expectedOwner);
}

if (deployment.expectedOperator !== undefined) {
  const allowed = await outcomeExchange.read.operators([deployment.expectedOperator]);
  if (allowed !== true) {
    throw new Error(`OutcomeExchange.operators(${deployment.expectedOperator}) expected true, got false`);
  }
  console.log(`OK OutcomeExchange.operators(${deployment.expectedOperator}) = true`);
}

console.log("ARC deployment verification OK");

function readDeploymentEnv(): DeploymentEnv {
  return {
    loanPositionToken: readAddressEnv("LOAN_POSITION_TOKEN_ADDRESS"),
    outcomeToken: readAddressEnv("OUTCOME_TOKEN_ADDRESS"),
    outcomeExchange: readAddressEnv("OUTCOME_EXCHANGE_ADDRESS"),
    collateralToken: readAddressEnv("USDC_ADDRESS"),
    expectedOwner: readOptionalAddressEnv("EXPECTED_OWNER_ADDRESS"),
    expectedOperator: readOptionalAddressEnv("EXPECTED_OPERATOR_ADDRESS"),
  };
}

function readAddressEnv(key: string): Address {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  return getAddress(value);
}

function readOptionalAddressEnv(key: string): Address | undefined {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return getAddress(value);
}

async function assertEqualAddress(label: string, actual: unknown, expected: Address): Promise<void> {
  const normalizedActual = getAddress(String(actual));
  if (normalizedActual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${normalizedActual}`);
  }

  console.log(`OK ${label} = ${expected}`);
}
