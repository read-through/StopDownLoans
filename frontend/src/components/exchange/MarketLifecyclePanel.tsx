import { CircleDollarSign, HandCoins, Scale, ShieldCheck } from "lucide-react";
import type { Outcome, PredictionMarket } from "../../types";
import { formatUnixDeadline, formatUsdc } from "../../lib/format";

function getMarketActionCopy(market: PredictionMarket, outcome: Outcome): { title: string; text: string } {
  if (market.state === "Proto") {
    return {
      title: "Waiting for loan activation",
      text: "Collateral can be prepared, but tradable YES/NO positions become live after the loan activates.",
    };
  }

  if (market.state === "Active") {
    return {
      title: `Trading ${outcome} repayment risk`,
      text: outcome === "YES"
        ? "YES pays 1 USDC if the borrower repays on time; borrower YES sales show market demand for the credit risk."
        : "NO pays 1 USDC if repayment is missing or late; loan-held NO recovery protects lenders.",
    };
  }

  if (market.state === "Resolved") {
    return {
      title: "Market resolved",
      text: "The winning outcome token can be redeemed for 1 USDC, while the losing side redeems 0.",
    };
  }

  return {
    title: "Market cancelled",
    text: "The loan did not activate, so pre-activation deposits should be unwound instead of traded.",
  };
}

export function MarketLifecyclePanel(props: { market: PredictionMarket; selectedOutcome: Outcome }) {
  const action = getMarketActionCopy(props.market, props.selectedOutcome);
  const loan = props.market.loan;

  return (
    <section className="marketLifecyclePanel" aria-label="Market lifecycle orientation">
      <div className="marketLifecycleLead">
        <span>Loan risk market</span>
        <h3>{action.title}</h3>
        <p>{action.text}</p>
      </div>
      <div className="marketLifecycleSteps">
        <div className="marketLifecycleStep">
          <Scale size={17} />
          <span>Outcome rule</span>
          <strong>Winning YES or NO redeems 1 USDC</strong>
        </div>
        <div className="marketLifecycleStep">
          <CircleDollarSign size={17} />
          <span>Pair mint</span>
          <strong>1 USDC can mint 1 YES + 1 NO</strong>
        </div>
        <div className="marketLifecycleStep">
          <HandCoins size={17} />
          <span>Linked loan</span>
          <strong>{loan === null ? "Loan context unavailable" : `#${loan.loanId} / ${formatUsdc(BigInt(loan.repaymentAmount))} USDC due`}</strong>
        </div>
        <div className="marketLifecycleStep">
          <ShieldCheck size={17} />
          <span>Repayment deadline</span>
          <strong>{loan === null ? "Unavailable" : formatUnixDeadline(loan.repaymentDeadline)}</strong>
        </div>
      </div>
    </section>
  );
}
