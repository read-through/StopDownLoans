import { useState } from "react";
import type { ApiLoanPosition } from "../../api";
import { claimLoanPosition } from "../../chainWrites";
import type { WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";
import { errorMessage, formatUsdc, shortHex } from "../../lib/format";

export function LoanPositionsPanel(props: {
  positions: ApiLoanPosition[];
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  account: WalletAccount;
  nextCursor: string | null;
  pageStatus: "idle" | "loading" | "error";
  pageError: string | null;
  onLoadMore: () => void;
  onLoanPositionClaimed: () => void;
}) {
  const [claimingPositionId, setClaimingPositionId] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const claimPosition = (position: ApiLoanPosition) => {
    const provider = getWalletProvider(props.account);
    if (provider === null) {
      setClaimError("No connected wallet provider found.");
      return;
    }

    setClaimingPositionId(position.positionId);
    setClaimTxHash(null);
    setClaimError(null);

    claimLoanPosition({
      provider,
      account: props.account,
      positionId: BigInt(position.positionId),
    })
      .then((hash) => {
        setClaimTxHash(hash);
        props.onLoanPositionClaimed();
      })
      .catch((error_: unknown) => {
        setClaimError(errorMessage(error_, "Failed to claim lender position"));
      })
      .finally(() => {
        setClaimingPositionId(null);
      });
  };

  if (props.status === "loading" || props.status === "idle") {
    return <div className="walletRequiredState">Loading lender positions...</div>;
  }

  if (props.status === "error") {
    return <div className="walletRequiredState errorActionState">{props.error ?? "Unable to load lender positions."}</div>;
  }

  if (props.positions.length === 0) {
    return <div className="walletRequiredState">No lender positions for this account.</div>;
  }

  return (
    <div className="loanPositionList">
      {claimError !== null && <div className="walletRequiredState errorActionState">{claimError}</div>}
      {claimTxHash !== null && <div className="walletRequiredState">Claim transaction {shortHex(claimTxHash)}</div>}
      {props.positions.map((position) => (
        <div className="loanPositionItem" key={position.positionId}>
          <div>
            <div className="actionLabel">Position #{position.positionId} / loan #{position.loanId}</div>
            <div className="actionDetail">
              {formatUsdc(BigInt(position.balance))} position balance
            </div>
          </div>
          <div className="positionMetrics">
            <span>{formatUsdc(BigInt(position.principalAmount))} principal</span>
            <span>{formatUsdc(BigInt(position.claimedAmount))} claimed</span>
            <span>{formatUsdc(BigInt(position.claimableAmount))} claimable</span>
          </div>
          <button
            className="smallActionButton smallNeutralButton"
            disabled={claimingPositionId === position.positionId || BigInt(position.claimableAmount) === 0n}
            onClick={() => claimPosition(position)}
            type="button"
          >
            {claimingPositionId === position.positionId ? "Claiming" : "Claim"}
          </button>
        </div>
      ))}
      {props.nextCursor !== null && (
        <div className="tableFooter">
          <button
            className="ghostButton"
            disabled={props.pageStatus === "loading"}
            onClick={props.onLoadMore}
            type="button"
          >
            {props.pageStatus === "loading" ? "Loading positions" : "Load more positions"}
          </button>
          {props.pageStatus === "error" && props.pageError !== null && (
            <span className="footerError">{props.pageError}</span>
          )}
        </div>
      )}
    </div>
  );
}
