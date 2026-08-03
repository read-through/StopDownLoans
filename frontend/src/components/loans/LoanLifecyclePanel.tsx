import { CircleCheck, Clock3, Landmark, LineChart } from "lucide-react";
import type { LoanDetail } from "../../types";

function getActionCopy(loan: LoanDetail): { title: string; text: string } {
  if (loan.state === "Funding") {
    return {
      title: "Next action: fund or deposit collateral",
      text: "Lenders can fund principal, while the borrower must complete collateral before activation.",
    };
  }

  if (loan.state === "Funded") {
    return {
      title: "Next action: activate after freeze",
      text: "Once collateral is present and the withdraw freeze has passed, activation sends principal and opens the market.",
    };
  }

  if (loan.state === "Active") {
    return {
      title: "Next action: repay or trade risk",
      text: "Borrower can repay before deadline; traders can trade the linked YES/NO market while the loan is live.",
    };
  }

  if (loan.state === "Repaid") {
    return {
      title: "Resolved: YES wins",
      text: "Lenders claim repayment from the loan contract and YES holders redeem winning outcome tokens.",
    };
  }

  if (loan.state === "Defaulted") {
    return {
      title: "Resolved: NO wins",
      text: "Loan-held NO recovery enters the lender claim surface and NO holders redeem winning outcome tokens.",
    };
  }

  return {
    title: "Cancelled before activation",
    text: "Funding and pre-activation deposits can be unwound because the loan did not become active.",
  };
}

export function LoanLifecyclePanel(props: { loan: LoanDetail; marketAvailable: boolean }) {
  const action = getActionCopy(props.loan);

  return (
    <section className="loanLifecyclePanel" aria-label="Loan lifecycle orientation">
      <div className="loanLifecycleLead">
        <span>Loan-linked market</span>
        <h3>{action.title}</h3>
        <p>{action.text}</p>
      </div>
      <div className="loanLifecycleSteps">
        <div className="loanLifecycleStep">
          <Landmark size={17} />
          <span>Funding</span>
          <strong>{props.loan.fundedAmount} / {props.loan.principal}</strong>
        </div>
        <div className="loanLifecycleStep">
          <CircleCheck size={17} />
          <span>Borrower collateral</span>
          <strong>{props.loan.borrowerCollateralDepositedAmount} / {props.loan.borrowerCollateralAmount}</strong>
        </div>
        <div className="loanLifecycleStep">
          <LineChart size={17} />
          <span>Market</span>
          <strong>{props.marketAvailable ? "Indexed and linked" : "Waiting for CLOB config"}</strong>
        </div>
        <div className="loanLifecycleStep">
          <Clock3 size={17} />
          <span>Repayment deadline</span>
          <strong>{props.loan.repaymentDeadline}</strong>
        </div>
      </div>
    </section>
  );
}
