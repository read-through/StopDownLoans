import { network } from "hardhat";
import { getAddress, keccak256, type Address, type Hex } from "viem";

type DeploymentEnv = {
  loanPositionToken: Address;
  outcomeToken: Address;
  outcomeExchange: Address;
  collateralToken: Address;
  expectedOwner: Address | undefined;
  expectedOperator: Address | undefined;
  loanPositionTokenBytecodeHash: Hex;
  outcomeTokenBytecodeHash: Hex;
  outcomeExchangeBytecodeHash: Hex;
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
await assertBytecodeHash(
  "LoanPositionToken",
  deployment.loanPositionToken,
  deployment.loanPositionTokenBytecodeHash
);
await assertBytecodeHash("OutcomeToken", deployment.outcomeToken, deployment.outcomeTokenBytecodeHash);
await assertBytecodeHash(
  "OutcomeExchange",
  deployment.outcomeExchange,
  deployment.outcomeExchangeBytecodeHash
);

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
    loanPositionTokenBytecodeHash: readHashEnv("LOAN_POSITION_TOKEN_BYTECODE_HASH"),
    outcomeTokenBytecodeHash: readHashEnv("OUTCOME_TOKEN_BYTECODE_HASH"),
    outcomeExchangeBytecodeHash: readHashEnv("OUTCOME_EXCHANGE_BYTECODE_HASH"),
  };
}

function readHashEnv(key: string): Hex {
  const value = process.env[key];
  if (value === undefined || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${key} must be a 32-byte hex hash.`);
  }
  return value as Hex;
}

async function assertBytecodeHash(label: string, address: Address, expected: Hex): Promise<void> {
  const bytecode = await publicClient.getBytecode({ address });
  if (bytecode === undefined || bytecode === "0x") {
    throw new Error(`${label} at ${address} has no runtime bytecode.`);
  }
  const actual = keccak256(bytecode);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} bytecode hash expected ${expected}, got ${actual}`);
  }
  console.log(`OK ${label} bytecode hash = ${actual}`);
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
