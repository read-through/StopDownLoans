import { useEffect, useMemo, useState } from "react";
import type { WalletBalances } from "../../chainReads";
import { approveUsdcOutcomeToken, depositBorrowerCollateral } from "../../chainWrites";
import type { LoanDetail } from "../../types";
import type { WalletAccount } from "../../wallet";
import { getInjectedWalletProvider } from "../../wallet";
import { errorMessage, formatUsdc, shortHex } from "../../lib/format";
import { parseUsdcInput } from "../../lib/parsing";
import { getBorrowerCollateralPreflightError } from "../../lib/preflight";
import { ArrowRight } from "lucide-react";

export function BorrowerCollateralForm(props: {
  loan: LoanDetail;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onBorrowerCollateralDeposited: () => void;
}) {
  const required = BigInt(props.loan.borrowerCollateralAmountRaw);
  const deposited = BigInt(props.loan.borrowerCollateralDepositedAmountRaw);
  const remaining = required > deposited ? required - deposited : 0n;
  const [amount, setAmount] = useState(() => formatUsdc(remaining));
  const [status, setStatus] = useState<"idle" | "approving" | "depositing" | "deposited" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const parsedAmount = useMemo(() => parseUsdcInput(amount), [amount]);
  const collateralError = getBorrowerCollateralPreflightError({
    amount: parsedAmount.value,
    balances: props.walletBalances,
    loan: props.loan,
  });
  const needsApproval =
    parsedAmount.value !== null &&
    props.walletBalances?.outcomeAllowance !== null &&
    props.walletBalances?.outcomeAllowance !== undefined &&
    props.walletBalances.outcomeAllowance < parsedAmount.value;
  const isBorrower =
    props.walletAccount !== null && props.walletAccount.address.toLowerCase() === props.loan.borrower.toLowerCase();
  const canDeposit =
    isBorrower &&
    props.walletOnExpectedChain &&
    props.walletBalances !== null &&
    parsedAmount.value !== null &&
    collateralError === null &&
    status !== "approving" &&
    status !== "depositing";

  useEffect(() => {
    setAmount(formatUsdc(remaining));
  }, [props.loan.loanId, remaining]);

  useEffect(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, [props.loan.loanId]);

  const approve = () => {
    if (props.walletAccount === null || parsedAmount.value === null) {
      return;
    }

    const provider = getInjectedWalletProvider();
    if (provider === null) {
      setStatus("error");
      setError("No injected wallet provider found.");
      return;
    }

    setStatus("approving");
    setError(null);
    setTxHash(null);

    approveUsdcOutcomeToken({
      provider,
      account: props.walletAccount,
      amount: parsedAmount.value,
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("idle");
        props.onBorrowerCollateralDeposited();
      })
      .catch((approveError: unknown) => {
        setError(errorMessage(approveError, "Failed to approve borrower collateral"));
        setStatus("error");
      });
  };

  const deposit = () => {
    if (props.walletAccount === null || parsedAmount.value === null) {
      return;
    }

    const provider = getInjectedWalletProvider();
    if (provider === null) {
      setStatus("error");
      setError("No injected wallet provider found.");
      return;
    }

    setStatus("depositing");
    setError(null);
    setTxHash(null);

    depositBorrowerCollateral({
      provider,
      account: props.walletAccount,
      marketId: props.loan.marketId,
      amount: parsedAmount.value,
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("deposited");
        props.onBorrowerCollateralDeposited();
      })
      .catch((depositError: unknown) => {
        setError(errorMessage(depositError, "Failed to deposit borrower collateral"));
        setStatus("error");
      });
  };

  return (
    <section className="loanFundingForm" aria-label="Deposit borrower collateral">
      <div className="ticketHeader">
        <div>
          <h3>Borrower collateral</h3>
          <p>Required before the loan can activate and mint borrower YES collateral.</p>
        </div>
      </div>
      <div className="ticketGrid">
        <label>
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="ticketNote">
        Deposited {formatUsdc(deposited)} / {formatUsdc(required)} USDC
      </div>
      {parsedAmount.error !== null && <div className="ticketNote errorState">{parsedAmount.error}</div>}
      {collateralError !== null && <div className="ticketNote errorState">{collateralError}</div>}
      {props.walletAccount === null && <div className="ticketNote">Connect borrower wallet to deposit collateral.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus === "error" && (
        <div className="ticketNote errorState">{props.walletBalancesError ?? "Unable to load wallet balances and allowances."}</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus !== "error" && props.walletBalances === null && (
        <div className="ticketNote">Loading wallet balances and allowances.</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && !isBorrower && (
        <div className="ticketNote">Only borrower {shortHex(props.loan.borrower)} can deposit borrower collateral.</div>
      )}
      {needsApproval && (
        <button className="ghostButton" disabled={status === "approving"} onClick={approve} type="button">
          {status === "approving" ? "Approving" : "Approve USDC for collateral"}
        </button>
      )}
      <button className="primaryButton" disabled={!canDeposit} onClick={deposit} type="button">
        {status === "depositing" ? "Depositing" : "Deposit collateral"}
        <ArrowRight size={17} />
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
