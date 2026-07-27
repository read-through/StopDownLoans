import type { WalletBalances } from "../../chainReads";
import type { LoanDetail } from "../../types";
import type { WalletAccount } from "../../wallet";
import { formatUnixDeadline, shortHex } from "../../lib/format";
import { DetailMetric } from "../shared/DetailMetric";
import { ReadinessMetric } from "../shared/ReadinessMetric";
import { StateBadge } from "../shared/StateBadge";
import { BorrowerCollateralForm } from "./BorrowerCollateralForm";
import { LoanActivationAction } from "./LoanActivationAction";
import { LoanFundingForm } from "./LoanFundingForm";
import { LoanPaymentAction } from "./LoanPaymentAction";
import { ArrowRight } from "lucide-react";

export function LoanDetailPanel(props: {
  loan: LoanDetail | null;
  status: "loading" | "loaded" | "error";
  marketKey: string | null;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onOpenMarket: () => void;
  onLoanFunded: () => void;
  onBorrowerCollateralDeposited: () => void;
  onLoanActivated: () => void;
  onLoanPaymentChanged: () => void;
}) {
  if (props.status !== "loaded") {
    return null;
  }

  if (props.loan === null) {
    return <div className="loanDetail emptyState compactState">Select a loan to inspect funding terms.</div>;
  }

  return (
    <section className="loanDetail" aria-label="Selected loan details">
      <div className="detailHeader">
        <div>
          <h3>Loan #{props.loan.loanId}</h3>
          <p>{props.loan.borrower}</p>
        </div>
        <StateBadge state={props.loan.state} />
      </div>
      <div className="loanReadinessStrip" aria-label="Loan readiness">
        <ReadinessMetric label="Funding" value={props.loan.fundingPct} />
        <ReadinessMetric label="Collateral" value={props.loan.collateralPct} />
        <ReadinessMetric label="Repayment" value={props.loan.repaymentPct} />
      </div>
      <div className="loanDetailGrid">
        <DetailMetric label="Principal" value={props.loan.principal} />
        <DetailMetric label="Funded" value={props.loan.fundedAmount} />
        <DetailMetric label="Funding remaining" value={props.loan.fundingRemaining} />
        <DetailMetric label="Credited" value={props.loan.creditedAmount} />
        <DetailMetric label="Repayment" value={props.loan.repaymentAmount} />
        <DetailMetric label="Repayment remaining" value={props.loan.repaymentRemaining} />
        <DetailMetric label="Interest" value={props.loan.interestRate} />
        <DetailMetric label="Platform fee" value={props.loan.feeRate} />
        <DetailMetric label="Collateral ratio" value={props.loan.collateralRatio} />
        <DetailMetric label="Borrower collateral" value={props.loan.borrowerCollateralAmount} />
        <DetailMetric label="Collateral deposited" value={props.loan.borrowerCollateralDepositedAmount} />
        <DetailMetric label="Collateral remaining" value={props.loan.borrowerCollateralRemaining} />
      </div>
      <div className="loanTimeline">
        <DetailMetric label="Withdraw freeze" value={props.loan.loanWithdrawFreezeDeadline} />
        <DetailMetric label="Activation deadline" value={props.loan.activationDeadline} />
        <DetailMetric label="Repayment deadline" value={props.loan.repaymentDeadline} />
        <DetailMetric label="Market" value={shortHex(props.loan.marketId)} />
      </div>
      <div className="loanMarketAction">
        <button
          className="ghostButton"
          disabled={props.marketKey === null}
          onClick={props.onOpenMarket}
          type="button"
        >
          Open linked market
          <ArrowRight size={17} />
        </button>
        {props.marketKey === null && (
          <span>Linked market is not indexed in the CLOB config yet.</span>
        )}
      </div>
      <LoanFundingForm
        loan={props.loan}
        walletAccount={props.walletAccount}
        walletOnExpectedChain={props.walletOnExpectedChain}
        walletBalances={props.walletBalances}
        walletBalancesStatus={props.walletBalancesStatus}
        walletBalancesError={props.walletBalancesError}
        onLoanFunded={props.onLoanFunded}
      />
      <BorrowerCollateralForm
        loan={props.loan}
        walletAccount={props.walletAccount}
        walletOnExpectedChain={props.walletOnExpectedChain}
        walletBalances={props.walletBalances}
        walletBalancesStatus={props.walletBalancesStatus}
        walletBalancesError={props.walletBalancesError}
        onBorrowerCollateralDeposited={props.onBorrowerCollateralDeposited}
      />
      <LoanActivationAction
        loan={props.loan}
        walletAccount={props.walletAccount}
        walletOnExpectedChain={props.walletOnExpectedChain}
        onLoanActivated={props.onLoanActivated}
      />
      <LoanPaymentAction
        loan={props.loan}
        walletAccount={props.walletAccount}
        walletOnExpectedChain={props.walletOnExpectedChain}
        walletBalances={props.walletBalances}
        walletBalancesStatus={props.walletBalancesStatus}
        walletBalancesError={props.walletBalancesError}
        onLoanPaymentChanged={props.onLoanPaymentChanged}
      />
    </section>
  );
}
