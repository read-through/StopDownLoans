import type { LoanFilter, LoanOpportunity } from "../../types";
import { countLoansForFilter } from "../../lib/mappers";

export function LoanFilterControl(props: {
  value: LoanFilter;
  loans: LoanOpportunity[];
  onChange: (value: LoanFilter) => void;
}) {
  const filters: LoanFilter[] = ["All", "Funding", "Funded", "Active", "Repaid", "Defaulted", "Cancelled"];

  return (
    <div className="loanFilterBar" aria-label="Loan state filter">
      {filters.map((filter) => (
        <button
          className={props.value === filter ? "loanFilterButton activeLoanFilter" : "loanFilterButton"}
          key={filter}
          onClick={() => props.onChange(filter)}
          type="button"
        >
          <span>{filter}</span>
          <strong>{countLoansForFilter(props.loans, filter)}</strong>
        </button>
      ))}
    </div>
  );
}
