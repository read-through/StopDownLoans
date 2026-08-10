import { keccak256, type Address, type Hex } from "viem";

export type ContractBytecodeHashes = {
  loanPositionToken: Hex;
  outcomeToken: Hex;
  outcomeExchange: Hex;
};

type BytecodeReader = {
  getBytecode: (params: { address: Address }) => Promise<Hex | undefined>;
};

export function loadContractBytecodeHashes(env: NodeJS.ProcessEnv = process.env): ContractBytecodeHashes {
  return {
    loanPositionToken: requireHash(env, "LOAN_POSITION_TOKEN_BYTECODE_HASH"),
    outcomeToken: requireHash(env, "OUTCOME_TOKEN_BYTECODE_HASH"),
    outcomeExchange: requireHash(env, "OUTCOME_EXCHANGE_BYTECODE_HASH"),
  };
}

export async function assertContractBytecodeHashes(input: {
  publicClient: BytecodeReader;
  contracts: {
    loanPositionToken: Address;
    outcomeToken: Address;
    outcomeExchange: Address;
  };
  expected: ContractBytecodeHashes;
}): Promise<void> {
  for (const [name, address] of Object.entries(input.contracts) as Array<
    [keyof ContractBytecodeHashes, Address]
  >) {
    const bytecode = await input.publicClient.getBytecode({ address });
    if (bytecode === undefined || bytecode === "0x") {
      throw new Error(`No contract bytecode found for ${name} at ${address}.`);
    }

    const actual = keccak256(bytecode);
    if (actual.toLowerCase() !== input.expected[name].toLowerCase()) {
      throw new Error(
        `Contract bytecode mismatch for ${name} at ${address}: expected ${input.expected[name]}, got ${actual}.`
      );
    }
  }
}

function requireHash(env: NodeJS.ProcessEnv, key: string): Hex {
  const value = env[key];
  if (value === undefined || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${key} must be a 32-byte hex hash.`);
  }
  return value as Hex;
}
