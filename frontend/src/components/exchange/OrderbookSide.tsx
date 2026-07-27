import type { ApiPriceLevel } from "../../api";
import type { Outcome } from "../../types";
import { formatUsdc, formatPriceUnits } from "../../lib/format";

export function OrderbookSide(props: {
  title: string;
  levels: ApiPriceLevel[];
  side: "bid" | "ask";
  outcome: Outcome;
}) {
  return (
    <div className="bookSide">
      <div className="bookSideHeader">
        <span>{props.title}</span>
        <span>{props.outcome} size</span>
      </div>
      {props.levels.length === 0 ? (
        <div className="bookEmpty">No resting orders</div>
      ) : (
        props.levels.slice(0, 8).map((level) => (
          <div className="bookLevel" key={`${props.side}:${level.priceUnits}`}>
            <span className={props.side === "bid" ? "bidPrice" : "askPrice"}>
              {formatPriceUnits(level.priceUnits)}
            </span>
            <span>{formatUsdc(BigInt(level.totalRemainingOutcomeAmount))}</span>
          </div>
        ))
      )}
    </div>
  );
}
