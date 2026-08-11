import { encodeAbiParameters, keccak256 } from "viem";
import type { ReservationKey } from "./db/reservations.js";
import type { ClobOrder, Hex, Outcome } from "./types.js";

export function buildOrderReservationKey(
  order: Pick<ClobOrder, "maker" | "side" | "outcomeToken">,
  params: {
    usdc: Hex;
    outcomeTokenId: bigint;
  }
): ReservationKey {
  if (order.side === "BUY") {
    return {
      maker: order.maker,
      assetType: "ERC20",
      assetAddress: params.usdc,
      tokenId: 0n,
    };
  }

  return {
    maker: order.maker,
    assetType: "ERC1155",
    assetAddress: order.outcomeToken,
    tokenId: params.outcomeTokenId,
  };
}

export function deriveOutcomeTokenId(marketId: Hex, outcome: Outcome): bigint {
  const encoded = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint8" }],
    [marketId, outcome === "YES" ? 1 : 2]
  );

  return BigInt(keccak256(encoded));
}
