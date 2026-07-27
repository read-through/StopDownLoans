import type { ApiReservation } from "../../api";
import { formatReservationAsset, formatUsdc, shortHex } from "../../lib/format";

export function ReservationsPanel(props: {
  reservations: ApiReservation[];
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
}) {
  if (props.status === "loading" || props.status === "idle") {
    return <div className="walletRequiredState">Loading reserved capital...</div>;
  }

  if (props.status === "error") {
    return <div className="walletRequiredState errorActionState">{props.error ?? "Unable to load reservations."}</div>;
  }

  if (props.reservations.length === 0) {
    return <div className="walletRequiredState">No CLOB reservations for this account.</div>;
  }

  return (
    <div className="reservationList" aria-label="Reserved CLOB capital">
      {props.reservations.map((reservation) => (
        <div
          className="reservationItem"
          key={`${reservation.assetType}-${reservation.assetAddress}-${reservation.tokenId}`}
        >
          <div>
            <div className="actionLabel">{formatReservationAsset(reservation)}</div>
            <div className="actionDetail">
              {shortHex(reservation.assetAddress)} / token {reservation.tokenId}
            </div>
          </div>
          <strong>{formatUsdc(BigInt(reservation.reservedAmount))}</strong>
        </div>
      ))}
    </div>
  );
}
