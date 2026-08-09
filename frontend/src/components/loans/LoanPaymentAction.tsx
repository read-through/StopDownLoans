import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WalletBalances } from "../../chainReads";
import {
  approveUsdcLoanContract,
  depositToLoan,
  markLoanDefaulted,
  redeemDefaultCollateral,
  settleRepaidLoan,
} from "../../chainWrites";
import { errorMessage, formatUsdc, shortHex } from "../../lib/format";
import { parseUsdcInput } from "../../lib/parsing";
import {
  getLoanPaymentDepositPreflightError,
  getMarkDefaultedPreflightError,
  getRedeemDefaultCollateralPreflightError,
  getSettleRepaidPreflightError,
} from "../../lib/preflight";
import type { LoanDetail } from "../../types";
import type { WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";

export function LoanPaymentAction(props: {
  loan: LoanDetail;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onLoanPaymentChanged: () => void;
}) {
  const repayment = BigInt(props.loan.repaymentAmountRaw);
  const credited = BigInt(props.loan.creditedAmountRaw);
  const remaining = repayment > credited ? repayment - credited : 0n;
  const [amount, setAmount] = useState(() => formatUsdc(remaining > 0n ? remaining : repayment));
  const [status, setStatus] = useState<
    | "idle"
    | "approving"
    | "depositing"
    | "settling"
    | "defaulting"
    | "redeeming"
    | "settled"
    | "defaulted"
    | "redeemed"
    | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const parsedAmount = useMemo(() => parseUsdcInput(amount), [amount]);
  const depositError = getLoanPaymentDepositPreflightError({
    amount: parsedAmount.value,
    balances: props.walletBalances,
    loan: props.loan,
  });
  const settleError = getSettleRepaidPreflightError(props.loan);
  const defaultError = getMarkDefaultedPreflightError(props.loan);
  const redeemDefaultError = getRedeemDefaultCollateralPreflightError(props.loan);
  const needsApproval =
    parsedAmount.value !== null &&
    props.walletBalances?.loanAllowance !== null &&
    props.walletBalances?.loanAllowance !== undefined &&
    props.walletBalances.loanAllowance < parsedAmount.value;
  const canDeposit =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    props.walletBalances !== null &&
    parsedAmount.value !== null &&
    depositError === null &&
    status !== "approving" &&
    status !== "depositing" &&
    status !== "settling" &&
    status !== "defaulting" &&
    status !== "redeeming";
  const canSettle =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    settleError === null &&
    status !== "approving" &&
    status !== "depositing" &&
    status !== "settling" &&
    status !== "defaulting" &&
    status !== "redeeming";
  const canMarkDefaulted =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    defaultError === null &&
    status !== "approving" &&
    status !== "depositing" &&
    status !== "settling" &&
    status !== "defaulting" &&
    status !== "redeeming";
  const canRedeemDefaultCollateral =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    redeemDefaultError === null &&
    status !== "approving" &&
    status !== "depositing" &&
    status !== "settling" &&
    status !== "defaulting" &&
    status !== "redeeming";

  useEffect(() => {
    setAmount(formatUsdc(remaining > 0n ? remaining : repayment));
  }, [props.loan.loanId, remaining, repayment]);

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
        props.onLoanPaymentChanged();
      })
      .catch((approveError: unknown) => {
        setError(errorMessage(approveError, "Failed to approve loan payment"));
        setStatus("error");
      });
  };

  const deposit = () => {
    if (props.walletAccount === null || parsedAmount.value === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("depositing");
    setError(null);
    setTxHash(null);

    depositToLoan({
      provider,
      account: props.walletAccount,
      loanId: BigInt(props.loan.loanId),
      amount: parsedAmount.value,
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("idle");
        props.onLoanPaymentChanged();
      })
      .catch((depositError_: unknown) => {
        setError(errorMessage(depositError_, "Failed to deposit loan payment"));
        setStatus("error");
      });
  };

  const settle = () => {
    if (props.walletAccount === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("settling");
    setError(null);
    setTxHash(null);

    settleRepaidLoan({
      provider,
      account: props.walletAccount,
      loanId: BigInt(props.loan.loanId),
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("settled");
        props.onLoanPaymentChanged();
      })
      .catch((settleError_: unknown) => {
        setError(errorMessage(settleError_, "Failed to settle repaid loan"));
        setStatus("error");
      });
  };

  const markDefaulted = () => {
    if (props.walletAccount === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("defaulting");
    setError(null);
    setTxHash(null);

    markLoanDefaulted({
      provider,
      account: props.walletAccount,
      loanId: BigInt(props.loan.loanId),
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("defaulted");
        props.onLoanPaymentChanged();
      })
      .catch((defaultError_: unknown) => {
        setError(errorMessage(defaultError_, "Failed to mark loan defaulted"));
        setStatus("error");
      });
  };

  const redeemDefault = () => {
    if (props.walletAccount === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("redeeming");
    setError(null);
    setTxHash(null);

    redeemDefaultCollateral({
      provider,
      account: props.walletAccount,
      loanId: BigInt(props.loan.loanId),
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("redeemed");
        props.onLoanPaymentChanged();
      })
      .catch((redeemError: unknown) => {
        setError(errorMessage(redeemError, "Failed to redeem default collateral"));
        setStatus("error");
      });
  };

  return (
    <section className="loanFundingForm" aria-label="Deposit loan repayment">
      <div className="ticketHeader">
        <div>
          <h3>Repayment and recovery</h3>
          <p>Deposit USDC into the loan payout pool and settle as repaid when target is reached.</p>
        </div>
      </div>
      <div className="ticketGrid">
        <label>
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="ticketNote">
        Credited {formatUsdc(credited)} / {formatUsdc(repayment)} USDC
      </div>
      {parsedAmount.error !== null && <div className="ticketNote errorState">{parsedAmount.error}</div>}
      {depositError !== null && <div className="ticketNote errorState">{depositError}</div>}
      {props.walletAccount === null && <div className="ticketNote">Connect wallet to deposit payment.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus === "error" && (
        <div className="ticketNote errorState">{props.walletBalancesError ?? "Unable to load wallet balances and allowances."}</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus !== "error" && props.walletBalances === null && (
        <div className="ticketNote">Loading wallet balances and allowances.</div>
      )}
      {needsApproval && (
        <button className="ghostButton" disabled={status === "approving"} onClick={approve} type="button">
          {status === "approving" ? "Approving" : "Approve USDC for repayment"}
        </button>
      )}
      <button className="primaryButton" disabled={!canDeposit} onClick={deposit} type="button">
        {status === "depositing" ? "Depositing" : "Deposit payment"}
        <ArrowRight size={17} />
      </button>
      {settleError === null ? (
        <div className="ticketNote">Repayment target is met. Loan can be settled as repaid.</div>
      ) : (
        <div className="ticketNote">{settleError}</div>
      )}
      <button className="ghostButton" disabled={!canSettle} onClick={settle} type="button">
        {status === "settling" ? "Settling" : "Settle repaid"}
      </button>
      {defaultError === null ? (
        <div className="ticketNote">Repayment deadline passed without full repayment. Loan can be marked defaulted.</div>
      ) : (
        <div className="ticketNote">{defaultError}</div>
      )}
      <button className="ghostButton dangerButton" disabled={!canMarkDefaulted} onClick={markDefaulted} type="button">
        {status === "defaulting" ? "Marking default" : "Mark defaulted"}
      </button>
      {redeemDefaultError === null ? (
        <div className="ticketNote">Default collateral can be redeemed into the lender payout pool.</div>
      ) : (
        <div className="ticketNote">{redeemDefaultError}</div>
      )}
      <button className="ghostButton" disabled={!canRedeemDefaultCollateral} onClick={redeemDefault} type="button">
        {status === "redeeming" ? "Redeeming" : "Redeem default collateral"}
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
