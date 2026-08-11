import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, keccak256 } from "viem";
import { buildOrderReservationKey, deriveOutcomeTokenId } from "../../src/clob/reservationKeys.js";

describe("buildOrderReservationKey", () => {
  it("uses USDC tokenId 0 for BUY orders", () => {
    assert.deepEqual(
      buildOrderReservationKey(
        {
          maker: "0x0000000000000000000000000000000000000001",
          side: "BUY",
          outcomeToken: "0x0000000000000000000000000000000000000002",
        },
        {
          usdc: "0x0000000000000000000000000000000000000003",
          outcomeTokenId: 123n,
        }
      ),
      {
        maker: "0x0000000000000000000000000000000000000001",
        assetType: "ERC20",
        assetAddress: "0x0000000000000000000000000000000000000003",
        tokenId: 0n,
      }
    );
  });

  it("uses ERC1155 outcome token id for SELL orders", () => {
    assert.deepEqual(
      buildOrderReservationKey(
        {
          maker: "0x0000000000000000000000000000000000000001",
          side: "SELL",
          outcomeToken: "0x0000000000000000000000000000000000000002",
        },
        {
          usdc: "0x0000000000000000000000000000000000000003",
          outcomeTokenId: 123n,
        }
      ),
      {
        maker: "0x0000000000000000000000000000000000000001",
        assetType: "ERC1155",
        assetAddress: "0x0000000000000000000000000000000000000002",
        tokenId: 123n,
      }
    );
  });
});

describe("deriveOutcomeTokenId", () => {
  it("matches OutcomeToken abi.encode market outcome derivation", () => {
    const marketId = `0x${"12".repeat(32)}` as const;

    assert.equal(
      deriveOutcomeTokenId(marketId, "YES"),
      BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint8" }], [marketId, 1])))
    );
    assert.equal(
      deriveOutcomeTokenId(marketId, "NO"),
      BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint8" }], [marketId, 2])))
    );
  });
});
