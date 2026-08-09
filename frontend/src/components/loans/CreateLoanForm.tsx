import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createLoan } from "../../chainWrites";
import { errorMessage, formatBps, formatUsdc, shortHex } from "../../lib/format";
import {
  daysFromNow,
  parseBpsInput,
  parseLoanDeadlineInputs,
  parseUsdcInput,
  toDatetimeLocalInput,
} from "../../lib/parsing";
import type { WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";
import { DetailMetric } from "../shared/DetailMetric";

export function CreateLoanForm(props: {
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  onLoanCreated: () => void;
}) {
  const [principal, setPrincipal] = useState("1000");
  const [interestBps, setInterestBps] = useState("500");
  const [collateralBps, setCollateralBps] = useState("10000");
  const [loanWithdrawFreezeDeadline, setLoanWithdrawFreezeDeadline] = useState(() => toDatetimeLocalInput(daysFromNow(1)));
  const [activationDeadline, setActivationDeadline] = useState(() => toDatetimeLocalInput(daysFromNow(3)));
  const [repaymentDeadline, setRepaymentDeadline] = useState(() => toDatetimeLocalInput(daysFromNow(30)));
  const [status, setStatus] = useState<"idle" | "creating" | "created" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const parsedPrincipal = useMemo(() => parseUsdcInput(principal), [principal]);
  const parsedInterestBps = useMemo(() => parseBpsInput(interestBps), [interestBps]);
  const parsedCollateralBps = useMemo(() => parseBpsInput(collateralBps), [collateralBps]);
  const parsedDeadlines = useMemo(
    () =>
      parseLoanDeadlineInputs({
        loanWithdrawFreezeDeadline,
        activationDeadline,
        repaymentDeadline,
      }),
    [activationDeadline, loanWithdrawFreezeDeadline, repaymentDeadline]
  );
  const formError =
    parsedPrincipal.error ??
    parsedInterestBps.error ??
    parsedCollateralBps.error ??
    (parsedCollateralBps.value === 0n ? "Collateral bps must be positive." : null) ??
    parsedDeadlines.error ??
    (props.walletAccount === null ? "Connect wallet to create a loan." : null) ??
    (!props.walletOnExpectedChain ? "Switch wallet to ARC." : null);
  const canCreate =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    parsedPrincipal.value !== null &&
    parsedInterestBps.value !== null &&
    parsedCollateralBps.value !== null &&
    parsedCollateralBps.value > 0n &&
    parsedDeadlines.value !== null &&
    status !== "creating";
  const repaymentPreview =
    parsedPrincipal.value !== null && parsedInterestBps.value !== null
      ? parsedPrincipal.value + (parsedPrincipal.value * parsedInterestBps.value) / 10_000n
      : null;
  const collateralPreview =
    repaymentPreview !== null && parsedCollateralBps.value !== null
      ? (repaymentPreview * parsedCollateralBps.value) / 10_000n
      : null;

  useEffect(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, [props.walletAccount?.address, props.walletOnExpectedChain]);

  const submit = () => {
    if (
      props.walletAccount === null ||
      parsedPrincipal.value === null ||
      parsedInterestBps.value === null ||
      parsedCollateralBps.value === null ||
      parsedDeadlines.value === null
    ) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus("creating");
    setError(null);
    setTxHash(null);

    createLoan({
      provider,
      account: props.walletAccount,
      principal: parsedPrincipal.value,
      interestBps: parsedInterestBps.value,
      collateralBps: parsedCollateralBps.value,
      loanWithdrawFreezeDeadline: parsedDeadlines.value.loanWithdrawFreezeDeadline,
      activationDeadline: parsedDeadlines.value.activationDeadline,
      repaymentDeadline: parsedDeadlines.value.repaymentDeadline,
    })
      .then((hash) => {
        setTxHash(hash);
        setStatus("created");
        props.onLoanCreated();
      })
      .catch((createError: unknown) => {
        setError(errorMessage(createError, "Failed to create loan"));
        setStatus("error");
      });
  };

  return (
    <section className="createLoanForm" aria-label="Create loan request">
      <div className="ticketHeader">
        <div>
          <h3>Loan terms</h3>
          <p>The request creates one credit line and a linked repayment market that activates after funding.</p>
        </div>
      </div>
      <div className="loanCreateGrid">
        <label>
          Principal
          <input value={principal} onChange={(event) => setPrincipal(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Interest bps
          <input value={interestBps} onChange={(event) => setInterestBps(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          Collateral bps
          <input value={collateralBps} onChange={(event) => setCollateralBps(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          Withdraw freeze
          <input
            value={loanWithdrawFreezeDeadline}
            onChange={(event) => setLoanWithdrawFreezeDeadline(event.target.value)}
            type="datetime-local"
          />
        </label>
        <label>
          Activation deadline
          <input value={activationDeadline} onChange={(event) => setActivationDeadline(event.target.value)} type="datetime-local" />
        </label>
        <label>
          Repayment deadline
          <input value={repaymentDeadline} onChange={(event) => setRepaymentDeadline(event.target.value)} type="datetime-local" />
        </label>
      </div>
      {repaymentPreview !== null && collateralPreview !== null && parsedPrincipal.value !== null && parsedInterestBps.value !== null && parsedCollateralBps.value !== null && (
        <div className="loanCreationPreview" aria-label="Loan economics preview">
          <DetailMetric label="Principal requested" value={`${formatUsdc(parsedPrincipal.value)} USDC`} />
          <DetailMetric label="Interest" value={`${formatBps(parsedInterestBps.value)}%`} />
          <DetailMetric label="Collateral ratio" value={`${formatBps(parsedCollateralBps.value)}%`} />
          <DetailMetric label="Repayment target" value={`${formatUsdc(repaymentPreview)} USDC`} />
          <DetailMetric label="Required borrower collateral" value={`${formatUsdc(collateralPreview)} USDC`} />
          <div className="previewNote">
            Borrower chooses both interest and collateral ratio. The contract snapshots both values when the loan is created.
          </div>
        </div>
      )}
      {formError !== null && <div className={props.walletAccount === null ? "ticketNote" : "ticketNote errorState"}>{formError}</div>}
      <button className="primaryButton" disabled={!canCreate} onClick={submit} type="button">
        {status === "creating" ? "Creating" : "Create loan"}
        <ArrowRight size={17} />
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
