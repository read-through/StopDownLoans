import type { LoanFilter, LoanOpportunity } from "../../types";
import { shortHex } from "../../lib/format";
import { Progress } from "../shared/Progress";
import { StateBadge } from "../shared/StateBadge";

export function LoanRows(props: {
  loans: LoanOpportunity[];
  status: "loading" | "loaded" | "error";
  error: string | null;
  filter: LoanFilter;
  selectedLoanId: string | null;
  onSelectLoan: (loanId: string) => void;
}) {
  if (props.status === "loading") {
    return <div className="tableMessage">Loading loans from backend...</div>;
  }

  if (props.status === "error") {
    return <div className="tableMessage errorState">Backend is not available: {props.error}</div>;
  }

  if (props.loans.length === 0) {
    return (
      <div className="tableMessage">
        {props.filter === "All" ? "No loans created yet." : `No ${props.filter.toLowerCase()} loans.`}
      </div>
    );
  }

  return (
    <>
      {props.loans.map((loan) => (
        <button
          className={props.selectedLoanId === loan.loanId ? "tableRow loanTableRow selectedLoanRow" : "tableRow loanTableRow"}
          key={loan.loanId}
          onClick={() => props.onSelectLoan(loan.loanId)}
          type="button"
        >
          <span>#{loan.loanId}</span>
          <span>{loan.borrower}</span>
          <span>{loan.principal}</span>
          <span>{loan.rate}</span>
          <span>
            <Progress label="Loan funding" value={loan.fundedPct} />
            <span className="fundingRemainder">{loan.remainingFunding} left</span>
          </span>
          <span>
            <span className={loan.marketIndexed ? "marketLinkPill marketIndexedPill" : "marketLinkPill"}>
              {loan.marketIndexed ? "Indexed" : "Pending"}
            </span>
          </span>
          <span>{loan.nextDeadline}</span>
          <span>
            <StateBadge state={loan.state} />
          </span>
        </button>
      ))}
    </>
  );
}
