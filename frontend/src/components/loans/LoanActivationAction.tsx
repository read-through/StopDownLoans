import { useEffect, useState } from "react";
import { activateLoan } from "../../chainWrites";
import type { LoanDetail } from "../../types";
import type { WalletAccount } from "../../wallet";
import { getInjectedWalletProvider } from "../../wallet";
import { errorMessage, shortHex } from "../../lib/format";
import { getLoanActivationPreflightError } from "../../lib/preflight";
import { ArrowRight } from "lucide-react";

export function LoanActivationAction(props: {
  loan: LoanDetail;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  onLoanActivated: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "activating" | "activated" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const activationError = getLoanActivationPreflightError(props.loan);
  const canActivate =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    activationError === null &&
    status !== "activating";

  useEffect(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, [props.loan.loanId]);

  const activate = () => {
    if (props.walletAccount === null) {
      return;
    }

    const provider = getInjectedWalletProvider();
    if (provider === null) {
      setStatus("error");
      setError("No injected wallet provider found.");
      return;
    }

    setStatus("activating");
    setError(null);
    setTxHash(null);

    activateLoan({
      provider,
      account: props.walletAccount,
      loanId: BigInt(props.loan.loanId),
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("activated");
        props.onLoanActivated();
      })
      .catch((activateError: unknown) => {
        setError(errorMessage(activateError, "Failed to activate loan"));
        setStatus("error");
      });
  };

  return (
    <section className="loanFundingForm" aria-label="Activate funded loan">
      <div className="ticketHeader">
        <div>
          <h3>Activate loan</h3>
          <p>Release principal to borrower and activate the YES/NO market atomically.</p>
        </div>
      </div>
      {activationError === null ? (
        <div className="ticketNote">Loan is ready for activation.</div>
      ) : (
        <div className="ticketNote">{activationError}</div>
      )}
      {props.walletAccount === null && <div className="ticketNote">Connect wallet to activate this loan.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      <button className="primaryButton" disabled={!canActivate} onClick={activate} type="button">
        {status === "activating" ? "Activating" : "Activate"}
        <ArrowRight size={17} />
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
