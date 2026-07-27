import { BadgeDollarSign, RefreshCcw } from "lucide-react";
import type { WalletBalances } from "../chainReads";
import type { LoanDetail, LoanFilter, LoanOpportunity } from "../types";
import type { WalletAccount } from "../wallet";
import { LoanDetailPanel } from "../components/loans/LoanDetailPanel";
import { LoanFilterControl } from "../components/loans/LoanFilterControl";
import { LoanRows } from "../components/loans/LoanRows";
import { PanelHeader } from "../components/shared/PanelHeader";

export function LoansScreen(props: {
  filteredLoanOpportunities: LoanOpportunity[];
  loanOpportunities: LoanOpportunity[];
  loansStatus: "loading" | "loaded" | "error";
  loansError: string | null;
  loanFilter: LoanFilter;
  onLoanFilterChange: (value: LoanFilter) => void;
  selectedLoanId: string | null;
  onSelectLoan: (loanId: string) => void;
  showDetail: boolean;
  onBackToList: () => void;
  loanNextCursor: string | null;
  loanPageStatus: "idle" | "loading" | "error";
  loanPageError: string | null;
  onLoadMoreLoans: () => void;
  selectedLoanDetail: LoanDetail | null;
  selectedLoanMarketKey: string | null;
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
  if (props.showDetail) {
    return (
      <section className="panel screenPanel entityDetailScreen" id="loans" aria-label="Selected loan">
        <PanelHeader
          title="Loan Detail"
          action={props.selectedLoanDetail === null ? "Choose loan" : `Loan #${props.selectedLoanDetail.loanId}`}
          icon={<BadgeDollarSign size={17} />}
        />
        <button className="ghostButton backButton" onClick={props.onBackToList} type="button">
          Back to all loans
        </button>
        <LoanDetailPanel
          loan={props.selectedLoanDetail}
          status={props.loansStatus}
          marketKey={props.selectedLoanMarketKey}
          walletAccount={props.walletAccount}
          walletOnExpectedChain={props.walletOnExpectedChain}
          walletBalances={props.walletBalances}
          walletBalancesStatus={props.walletBalancesStatus}
          walletBalancesError={props.walletBalancesError}
          onOpenMarket={props.onOpenMarket}
          onLoanFunded={props.onLoanFunded}
          onBorrowerCollateralDeposited={props.onBorrowerCollateralDeposited}
          onLoanActivated={props.onLoanActivated}
          onLoanPaymentChanged={props.onLoanPaymentChanged}
        />
      </section>
    );
  }

  return (
    <section className="panel screenPanel entityListScreen" id="loans" aria-label="All loans">
      <PanelHeader
        title="All Loans"
        action={`${props.filteredLoanOpportunities.length} shown`}
        icon={<RefreshCcw size={17} />}
      />
      <LoanFilterControl
        value={props.loanFilter}
        loans={props.loanOpportunities}
        onChange={props.onLoanFilterChange}
      />
      <div className="table">
        <div className="tableRow tableHead">
          <span>Loan</span>
          <span>Borrower</span>
          <span>Principal</span>
          <span>Rate</span>
          <span>Funding</span>
          <span>Market</span>
          <span>Next deadline</span>
          <span>Status</span>
        </div>
        <LoanRows
          loans={props.filteredLoanOpportunities}
          status={props.loansStatus}
          error={props.loansError}
          filter={props.loanFilter}
          selectedLoanId={props.selectedLoanId}
          onSelectLoan={props.onSelectLoan}
        />
      </div>
      {props.loansStatus === "loaded" && props.loanNextCursor !== null && (
        <div className="tableFooter">
          <button
            className="ghostButton"
            disabled={props.loanPageStatus === "loading"}
            onClick={props.onLoadMoreLoans}
            type="button"
          >
            {props.loanPageStatus === "loading" ? "Loading loans" : "Load more loans"}
          </button>
          {props.loanPageStatus === "error" && props.loanPageError !== null && (
            <span className="footerError">{props.loanPageError}</span>
          )}
        </div>
      )}
    </section>
  );
}
