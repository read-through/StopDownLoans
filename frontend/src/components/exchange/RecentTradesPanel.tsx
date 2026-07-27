import type { ApiTrade } from "../../api";
import { formatTradePrice, formatTradeTime, formatUsdc } from "../../lib/format";

export function RecentTradesPanel(props: {
  trades: ApiTrade[];
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  nextCursor: string | null;
  pageStatus: "idle" | "loading" | "error";
  pageError: string | null;
  onLoadMore: () => void;
}) {
  if (props.status === "loading" || props.status === "idle") {
    return <div className="emptyState compactState">Loading recent trades...</div>;
  }

  if (props.status === "error") {
    return <div className="emptyState errorState compactState">Trades are not available: {props.error}</div>;
  }

  if (props.trades.length === 0) {
    return <div className="emptyState compactState">No matched trades yet.</div>;
  }

  return (
    <section className="recentTrades" aria-label="Recent trades">
      <div className="bookSideHeader">
        <span>Recent trades</span>
        <span>USDC / size</span>
      </div>
      {props.trades.map((trade) => (
        <div className="tradeRow" key={trade.tradeId}>
          <div>
            <div className="actionLabel">
              {trade.outcome} at {formatTradePrice(trade)}
            </div>
            <div className="actionDetail">{formatTradeTime(trade.createdAt)} / {trade.status}</div>
          </div>
          <div className="tradeAmounts">
            <span>{formatUsdc(BigInt(trade.totalUsdcAmount))}</span>
            <span>{formatUsdc(BigInt(trade.totalOutcomeAmount))}</span>
          </div>
        </div>
      ))}
      {props.nextCursor !== null && (
        <div className="tableFooter">
          <button
            className="ghostButton"
            disabled={props.pageStatus === "loading"}
            onClick={props.onLoadMore}
            type="button"
          >
            {props.pageStatus === "loading" ? "Loading trades" : "Load more trades"}
          </button>
          {props.pageStatus === "error" && props.pageError !== null && (
            <span className="footerError">{props.pageError}</span>
          )}
        </div>
      )}
    </section>
  );
}
