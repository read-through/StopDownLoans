import { useEffect, useMemo, useState } from "react";
import type { WalletBalances } from "../../chainReads";
import { approveUsdcLoanContract, fundLoan } from "../../chainWrites";
import type { LoanDetail } from "../../types";
import type { WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";
import { errorMessage, formatUsdc, shortHex } from "../../lib/format";
import { parseUsdcInput } from "../../lib/parsing";
import { getFundingPreflightError } from "../../lib/preflight";
import { ArrowRight } from "lucide-react";

export function LoanFundingForm(props: {
  loan: LoanDetail;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onLoanFunded: () => void;
}) {
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState<"idle" | "approving" | "funding" | "funded" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const parsedAmount = useMemo(() => parseUsdcInput(amount), [amount]);
  const fundingError = getFundingPreflightError({
    amount: parsedAmount.value,
    balances: props.walletBalances,
    loan: props.loan,
  });
  const needsApproval =
    parsedAmount.value !== null &&
    props.walletBalances?.loanAllowance !== null &&
    props.walletBalances?.loanAllowance !== undefined &&
    props.walletBalances.loanAllowance < parsedAmount.value;
  const canFund =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    props.walletBalances !== null &&
    parsedAmount.value !== null &&
    fundingError === null &&
    status !== "approving" &&
    status !== "funding";

  useEffect(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, [props.loan.loanId]);

  const approve = () => {
    if (props.walletAccount === null || parsedAmount.value === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("approving");
    setError(null);
    setTxHash(null);

    approveUsdcLoanContract({
      provider,
      account: props.walletAccount,
      amount: parsedAmount.value,
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("idle");
        props.onLoanFunded();
      })
      .catch((approveError: unknown) => {
        setError(errorMessage(approveError, "Failed to approve loan funding"));
        setStatus("error");
      });
  };

  const fund = () => {
    if (props.walletAccount === null || parsedAmount.value === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("funding");
    setError(null);
    setTxHash(null);

    fundLoan({
      provider,
      account: props.walletAccount,
      loanId: BigInt(props.loan.loanId),
      amount: parsedAmount.value,
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("funded");
        props.onLoanFunded();
      })
      .catch((fundError: unknown) => {
        setError(errorMessage(fundError, "Failed to fund loan"));
        setStatus("error");
      });
  };

  return (
    <section className="loanFundingForm" aria-label="Fund selected loan">
      <div className="ticketHeader">
        <div>
          <h3>Fund loan</h3>
          <p>Receive a transferable lender position after funding.</p>
        </div>
      </div>
      <div className="ticketGrid">
        <label>
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      {parsedAmount.value !== null && (
        <div className="ticketNote">Requires {formatUsdc(parsedAmount.value)} USDC</div>
      )}
      {parsedAmount.error !== null && <div className="ticketNote errorState">{parsedAmount.error}</div>}
      {fundingError !== null && <div className="ticketNote errorState">{fundingError}</div>}
      {props.walletAccount === null && <div className="ticketNote">Connect wallet to fund this loan.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus === "error" && (
        <div className="ticketNote errorState">{props.walletBalancesError ?? "Unable to load wallet balances and allowances."}</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus !== "error" && props.walletBalances === null && (
        <div className="ticketNote">Loading wallet balances and allowances.</div>
      )}
      {needsApproval && (
        <button className="ghostButton" disabled={status === "approving"} onClick={approve} type="button">
          {status === "approving" ? "Approving" : "Approve USDC for loan"}
        </button>
      )}
      <button className="primaryButton" disabled={!canFund} onClick={fund} type="button">
        {status === "funding" ? "Funding" : "Fund"}
        <ArrowRight size={17} />
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
