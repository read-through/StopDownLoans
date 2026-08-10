import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, type Address, type Hex } from "viem";
import {
  assertContractBytecodeHashes,
  loadContractBytecodeHashes,
} from "../../../src/clob/chain/contractBytecode.js";

const addresses = {
  loanPositionToken: "0x0000000000000000000000000000000000000001" as Address,
  outcomeToken: "0x0000000000000000000000000000000000000002" as Address,
  outcomeExchange: "0x0000000000000000000000000000000000000003" as Address,
};
const bytecodes: Record<Address, Hex> = {
  [addresses.loanPositionToken]: "0x6001",
  [addresses.outcomeToken]: "0x6002",
  [addresses.outcomeExchange]: "0x6003",
};
const expected = {
  loanPositionToken: keccak256(bytecodes[addresses.loanPositionToken]),
  outcomeToken: keccak256(bytecodes[addresses.outcomeToken]),
  outcomeExchange: keccak256(bytecodes[addresses.outcomeExchange]),
};

describe("contract bytecode validation", () => {
  it("accepts the configured deployment bytecode", async () => {
    await assertContractBytecodeHashes({
      publicClient: { getBytecode: async ({ address }) => bytecodes[address] },
      contracts: addresses,
      expected,
    });
  });

  it("rejects a stale contract implementation", async () => {
    await assert.rejects(
      assertContractBytecodeHashes({
        publicClient: { getBytecode: async ({ address }) => bytecodes[address] },
        contracts: addresses,
        expected: { ...expected, loanPositionToken: keccak256("0xdead") },
      }),
      /Contract bytecode mismatch for loanPositionToken/
    );
  });

  it("loads required hashes from the environment", () => {
    assert.deepEqual(
      loadContractBytecodeHashes({
        LOAN_POSITION_TOKEN_BYTECODE_HASH: expected.loanPositionToken,
        OUTCOME_TOKEN_BYTECODE_HASH: expected.outcomeToken,
        OUTCOME_EXCHANGE_BYTECODE_HASH: expected.outcomeExchange,
      }),
      expected
    );
  });
});
