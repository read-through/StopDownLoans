import type { MarketFilter, PredictionMarket } from "../../types";
import { getMarketKey } from "../../lib/mappers";
import { shortHex } from "../../lib/format";
import { Quote } from "../shared/Quote";
import { StateBadge } from "../shared/StateBadge";

export function MarketGrid(props: {
  markets: PredictionMarket[];
  status: "loading" | "loaded" | "error";
  error: string | null;
  filter: MarketFilter;
  selectedMarketKey: string | null;
  onSelectMarket: (marketKey: string) => void;
}) {
  if (props.status === "loading") {
    return <div className="emptyState">Loading CLOB markets from backend...</div>;
  }

  if (props.status === "error") {
    return (
      <div className="emptyState errorState">
        Backend is not available: {props.error}
      </div>
    );
  }

  if (props.markets.length === 0) {
    return (
      <div className="emptyState">
        {props.filter === "All" ? "No CLOB markets configured yet." : `No ${props.filter.toLowerCase()} markets.`}
      </div>
    );
  }

  return (
    <div className="marketGrid">
      {props.markets.map((market) => (
        <button
          className={
            props.selectedMarketKey === getMarketKey(market.outcomeToken, market.marketId)
              ? "marketCard selectedMarketCard"
              : "marketCard"
          }
          key={getMarketKey(market.outcomeToken, market.marketId)}
          onClick={() => props.onSelectMarket(getMarketKey(market.outcomeToken, market.marketId))}
          type="button"
        >
          <div className="marketTop">
            <div>
              <div className="marketTitle">{market.outcome}</div>
              <div className="marketMeta">
                {shortHex(market.outcomeToken)} / {shortHex(market.marketId)}
              </div>
            </div>
            <StateBadge state={market.state} />
          </div>
          <div className="quoteGrid">
            <Quote label="Best bid" value={market.bestBid} />
            <Quote label="Best ask" value={market.bestAsk} />
            <Quote label="Volume" value={market.volume} />
          </div>
        </button>
      ))}
    </div>
  );
}
