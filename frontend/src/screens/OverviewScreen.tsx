import { Activity } from "lucide-react";
import type { LoanDetail, PredictionMarket } from "../types";
import { DemoPathPanel } from "../components/shared/DemoPathPanel";
import { OverviewPreview } from "../components/shared/OverviewPreview";
import { RoleAction } from "../components/shared/RoleAction";

const productFacts = [
  { label: "Credit request", value: "P principal + fixed interest" },
  { label: "Borrower collateral", value: "repayment * collateralBps" },
  { label: "Market payout", value: "winning YES or NO redeems 1 USDC" },
  { label: "Lender recovery", value: "repayment and NO recovery share one pool" },
];

const reviewerPaths = [
  "Local protocol proof: demo:happy-path",
  "UI fallback: demo:reviewer",
  "ARC evidence: deployed loan, market, and CLOB settlement tx",
];

export function OverviewScreen(props: {
  dashboardStats: Array<{ label: string; value: string; icon: typeof Activity }>;
  selectedLoanDetail: LoanDetail | null;
  selectedMarket: PredictionMarket | null;
}) {
  return (
    <section className="screenStack" id="overview" aria-label="Protocol overview">
      <section className="productOrientation" aria-label="Product orientation">
        <div className="orientationCopy">
          <span>Final submission focus</span>
          <h2>DeFi credit markets backed by repayment prediction shares</h2>
          <p>
            Each loan creates one YES/NO market for whether repayment arrives on time. Borrowers get
            YES exposure, lenders get fixed-rate positions plus NO-backed recovery, and traders price
            repayment risk through the orderbook.
          </p>
        </div>
        <div className="orientationFacts" aria-label="Protocol economics">
          {productFacts.map((fact) => (
            <div className="orientationFact" key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
        <div className="reviewerPathList" aria-label="Reviewer verification paths">
          <span>Reviewer paths</span>
          {reviewerPaths.map((path) => (
            <div key={path}>{path}</div>
          ))}
        </div>
      </section>

      <section className="statusGrid" aria-label="Protocol status">
        {props.dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article className="statPanel" key={stat.label}>
              <Icon size={20} />
              <div>
                <div className="statValue">{stat.value}</div>
                <div className="statLabel">{stat.label}</div>
              </div>
            </article>
          );
        })}
      </section>

      <DemoPathPanel />

      <section className="roleStrip" aria-label="Role shortcuts">
        <RoleAction
          title="Borrow"
          text="Create a loan request and receive transferable YES collateral after activation."
          action="Create loan"
          href="#create"
        />
        <RoleAction
          title="Lend"
          text="Fund fixed-rate loan lines and receive transferable lender positions."
          action="View loans"
          href="#loans"
        />
        <RoleAction
          title="Trade"
          text="Price repayment risk through YES/NO outcome markets and the CLOB."
          action="Open exchange"
          href="#exchange"
        />
      </section>

      <section className="overviewPreviewGrid" aria-label="Protocol previews">
        <OverviewPreview
          title="Selected loan"
          primary={props.selectedLoanDetail === null ? "No loan selected" : `Loan #${props.selectedLoanDetail.loanId}`}
          secondary={
            props.selectedLoanDetail === null
              ? "Open Loans to inspect funding and repayment state."
              : `${props.selectedLoanDetail.state} / ${props.selectedLoanDetail.principal} principal / ${props.selectedLoanDetail.repaymentRemaining} remaining repayment`
          }
          action="Open loans"
          href="#loans"
        />
        <OverviewPreview
          title="Selected market"
          primary={props.selectedMarket === null ? "No market selected" : props.selectedMarket.outcome}
          secondary={
            props.selectedMarket === null
              ? "Open Exchange to inspect the YES/NO book."
              : `Best bid ${props.selectedMarket.bestBid} / best ask ${props.selectedMarket.bestAsk} / volume ${props.selectedMarket.volume}`
          }
          action="Open exchange"
          href="#exchange"
        />
      </section>
    </section>
  );
}
