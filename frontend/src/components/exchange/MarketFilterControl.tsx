import type { MarketFilter, PredictionMarket } from "../../types";
import { countMarketsForFilter } from "../../lib/mappers";

export function MarketFilterControl(props: {
  value: MarketFilter;
  markets: PredictionMarket[];
  onChange: (value: MarketFilter) => void;
}) {
  const filters: MarketFilter[] = ["All", "Proto", "Active", "Resolved", "Cancelled"];
  const labels: Record<MarketFilter, string> = {
    All: "All",
    Proto: "Pending",
    Active: "Active",
    Resolved: "Resolved",
    Cancelled: "Cancelled",
  };

  return (
    <div className="filterBar" aria-label="Market state filter">
      {filters.map((filter) => (
        <button
          className={props.value === filter ? "filterButton activeFilter" : "filterButton"}
          key={filter}
          onClick={() => props.onChange(filter)}
          type="button"
        >
          <span>{labels[filter]}</span>
          <strong>{countMarketsForFilter(props.markets, filter)}</strong>
        </button>
      ))}
    </div>
  );
}
