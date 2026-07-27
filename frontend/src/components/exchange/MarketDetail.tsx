import type { ApiBookSnapshot, ApiTrade } from "../../api";
import type { WalletBalances } from "../../chainReads";
import type { Outcome, PredictionMarket } from "../../types";
import type { WalletAccount } from "../../wallet";
import { shortHex } from "../../lib/format";
import { StateBadge } from "../shared/StateBadge";
import { FeedStatusBadge } from "./FeedStatusBadge";
import { MarketLoanContext } from "./MarketLoanContext";
import { OrderbookSide } from "./OrderbookSide";
import { OrderTicket } from "./OrderTicket";
import { OutcomePositionPanel } from "./OutcomePositionPanel";
import { OutcomeToggle } from "./OutcomeToggle";
import { PairCollateralPanel } from "./PairCollateralPanel";
import { RecentTradesPanel } from "./RecentTradesPanel";

export function MarketDetail(props: {
  market: PredictionMarket | null;
  book: ApiBookSnapshot | null;
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  selectedOutcome: Outcome;
  onSelectOutcome: (outcome: Outcome) => void;
  trades: ApiTrade[];
  tradesStatus: "idle" | "loading" | "loaded" | "error";
  tradesError: string | null;
  tradesNextCursor: string | null;
  tradesPageStatus: "idle" | "loading" | "error";
  tradesPageError: string | null;
  feedStatus: "idle" | "connecting" | "connected" | "disconnected" | "error";
  feedError: string | null;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onAccountChanged: () => void;
  onLoadMoreTrades: () => void;
  onOrderSubmitted: () => void;
  onPairCollateralChanged: () => void;
}) {
  if (props.market === null) {
    return <div className="marketDetail emptyState compactState">Selected market is loading or not indexed yet.</div>;
  }

  return (
    <section className="marketDetail" aria-label="Selected market orderbook">
      <div className="detailHeader">
        <div>
          <h3>{props.market.outcome}</h3>
          <p>{shortHex(props.market.outcomeToken)} / {shortHex(props.market.marketId)}</p>
        </div>
        <div className="detailControls">
          <FeedStatusBadge status={props.feedStatus} error={props.feedError} />
          <OutcomeToggle selected={props.selectedOutcome} onSelect={props.onSelectOutcome} />
          <StateBadge state={props.market.state} />
        </div>
      </div>
      <MarketLoanContext market={props.market} />

      {props.status === "loading" && (
        <div className="emptyState compactState">Loading {props.selectedOutcome} orderbook...</div>
      )}
      {props.status === "error" && (
        <div className="emptyState errorState compactState">Orderbook is not available: {props.error}</div>
      )}
      {props.status === "loaded" && props.book !== null && (
        <div className="bookGrid">
          <OrderbookSide title="Bids" levels={props.book.bids} side="bid" outcome={props.selectedOutcome} />
          <OrderbookSide title="Asks" levels={props.book.asks} side="ask" outcome={props.selectedOutcome} />
        </div>
      )}
      <RecentTradesPanel
        trades={props.trades}
        status={props.tradesStatus}
        error={props.tradesError}
        nextCursor={props.tradesNextCursor}
        pageStatus={props.tradesPageStatus}
        pageError={props.tradesPageError}
        onLoadMore={props.onLoadMoreTrades}
      />
      <PairCollateralPanel
        market={props.market}
        walletAccount={props.walletAccount}
        walletOnExpectedChain={props.walletOnExpectedChain}
        walletBalances={props.walletBalances}
        walletBalancesStatus={props.walletBalancesStatus}
        walletBalancesError={props.walletBalancesError}
        onPairCollateralChanged={props.onPairCollateralChanged}
      />
      <OutcomePositionPanel
        market={props.market}
        walletAccount={props.walletAccount}
        walletOnExpectedChain={props.walletOnExpectedChain}
        walletBalances={props.walletBalances}
        walletBalancesStatus={props.walletBalancesStatus}
        walletBalancesError={props.walletBalancesError}
        onOutcomePositionChanged={props.onPairCollateralChanged}
      />
      <OrderTicket
        market={props.market}
        outcome={props.selectedOutcome}
            walletAccount={props.walletAccount}
            walletOnExpectedChain={props.walletOnExpectedChain}
            walletBalances={props.walletBalances}
            walletBalancesStatus={props.walletBalancesStatus}
            walletBalancesError={props.walletBalancesError}
            onAccountChanged={props.onAccountChanged}
            onOrderSubmitted={props.onOrderSubmitted}
          />
    </section>
  );
}
