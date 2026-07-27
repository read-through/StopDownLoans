import type { LoanState, MarketState } from "../../types";

export function StateBadge(props: { state: LoanState | MarketState }) {
  return <span className={`stateBadge state${props.state}`}>{props.state}</span>;
}
