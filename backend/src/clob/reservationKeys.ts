import type { ReservationKey } from "./db/reservations.js";
import type { ClobOrder, Hex } from "./types.js";

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
