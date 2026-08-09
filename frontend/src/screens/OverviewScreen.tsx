import { Activity, ArrowUpRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import type { LoanDetail, PredictionMarket } from "../types";

function pricePercent(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = parsed > 1 ? parsed / 1_000_000 : parsed;
  return Math.min(100, Math.max(0, normalized * 100));
}

export function OverviewScreen(props: {
  dashboardStats: Array<{ label: string; value: string; icon: typeof Activity }>;
  selectedLoanDetail: LoanDetail | null;
  selectedMarket: PredictionMarket | null;
}) {
  const bid = pricePercent(props.selectedMarket?.bestBid, 42);
  const ask = Math.max(bid, pricePercent(props.selectedMarket?.bestAsk, 58));

  return (
    <section className="screenStack" id="overview" aria-label="Protocol overview">
      <section className="overviewLead" aria-label="Protocol orientation">
        <div className="overviewLeadCopy">
          <span className="eyebrow">Prediction-backed credit</span>
          <h2>Credit lines with a live market for repayment risk.</h2>
          <p>
            Borrowers open fixed-rate loans, lenders fund transferable positions, and traders price
            default exposure through YES and NO shares.
          </p>
          <div className="overviewLeadActions">
            <a className="primaryButton" href="#loans">
              Explore credit lines <ArrowUpRight size={16} />
            </a>
            <a className="textLink" href="#create">Open a request</a>
          </div>
        </div>
        <div className="riskInstrument" aria-label="Repayment market signal">
          <div className="riskInstrumentHeader">
            <div>
              <span>Repayment signal</span>
              <strong>{props.selectedMarket?.outcome ?? "Select an active market"}</strong>
            </div>
            <span className="liveIndicator"><i /> ARC</span>
          </div>
          <div className="riskQuoteRow">
            <div><span>YES bid</span><strong>{props.selectedMarket?.bestBid ?? "--"}</strong></div>
            <div><span>YES ask</span><strong>{props.selectedMarket?.bestAsk ?? "--"}</strong></div>
            <div><span>Volume</span><strong>{props.selectedMarket?.volume ?? "--"}</strong></div>
          </div>
          <div className="riskScale" aria-hidden="true">
            <div className="riskScaleLabels"><span>Default</span><span>Repayment</span></div>
            <div className="riskScaleTrack">
              <div className="riskSpread" style={{ left: `${bid}%`, width: `${Math.max(ask - bid, 2)}%` }} />
              <i className="riskBid" style={{ left: `${bid}%` }} />
              <i className="riskAsk" style={{ left: `${ask}%` }} />
            </div>
          </div>
          <a className="instrumentLink" href="#exchange">Open market <ArrowUpRight size={15} /></a>
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

      <section className="roleRail" aria-label="Primary actions">
        <a href="#create"><CircleDollarSign size={20} /><span><strong>Borrow</strong><small>Set terms and collateral</small></span><ArrowUpRight size={17} /></a>
        <a href="#loans"><ShieldCheck size={20} /><span><strong>Lend</strong><small>Fund fixed-rate positions</small></span><ArrowUpRight size={17} /></a>
        <a href="#exchange"><Activity size={20} /><span><strong>Trade risk</strong><small>Buy or sell YES and NO</small></span><ArrowUpRight size={17} /></a>
        <div className="selectedContext">
          <span>Current context</span>
          <strong>{props.selectedLoanDetail === null ? "No credit line selected" : `Loan #${props.selectedLoanDetail.loanId} · ${props.selectedLoanDetail.state}`}</strong>
        </div>
      </section>
    </section>
  );
}
