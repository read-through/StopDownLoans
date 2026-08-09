import { ArrowRight } from "lucide-react";
import type { ApiBookSnapshot, ApiTrade } from "../api";
import type { WalletBalances } from "../chainReads";
import type { MarketFilter, Outcome, PredictionMarket } from "../types";
import type { WalletAccount } from "../wallet";
import { MarketDetail } from "../components/exchange/MarketDetail";
import { MarketFilterControl } from "../components/exchange/MarketFilterControl";
import { MarketGrid } from "../components/exchange/MarketGrid";
import { PanelHeader } from "../components/shared/PanelHeader";

export function ExchangeScreen(props: {
  marketFilter: MarketFilter;
  predictionMarkets: PredictionMarket[];
  filteredPredictionMarkets: PredictionMarket[];
  onMarketFilterChange: (value: MarketFilter) => void;
  marketsStatus: "loading" | "loaded" | "error";
  marketsError: string | null;
  marketNextCursor: string | null;
  marketPageStatus: "idle" | "loading" | "error";
  marketPageError: string | null;
  selectedMarketKey: string | null;
  onSelectMarket: (marketKey: string) => void;
  showDetail: boolean;
  onBackToList: () => void;
  selectedMarket: PredictionMarket | null;
  bookSnapshot: ApiBookSnapshot | null;
  bookStatus: "idle" | "loading" | "loaded" | "error";
  bookError: string | null;
  selectedOutcome: Outcome;
  onSelectOutcome: (outcome: Outcome) => void;
  recentTrades: ApiTrade[];
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
  onLoadMoreMarkets: () => void;
  onLoadMoreTrades: () => void;
  onOrderSubmitted: () => void;
  onPairCollateralChanged: () => void;
}) {
  if (props.showDetail) {
    return (
      <section className="panel screenPanel entityDetailScreen" id="exchange" aria-label="Selected market">
        <PanelHeader
          title="Repayment market"
          action={props.selectedMarket === null ? "Choose a market" : "Trade"}
          icon={<ArrowRight size={17} />}
        />
        <button className="ghostButton backButton" onClick={props.onBackToList} type="button">
          Back to markets
        </button>
        <MarketDetail
          market={props.selectedMarket}
          book={props.bookSnapshot}
          status={props.bookStatus}
          error={props.bookError}
          selectedOutcome={props.selectedOutcome}
          onSelectOutcome={props.onSelectOutcome}
          trades={props.recentTrades}
          tradesStatus={props.tradesStatus}
          tradesError={props.tradesError}
          tradesNextCursor={props.tradesNextCursor}
          tradesPageStatus={props.tradesPageStatus}
          tradesPageError={props.tradesPageError}
          feedStatus={props.feedStatus}
          feedError={props.feedError}
          walletAccount={props.walletAccount}
          walletOnExpectedChain={props.walletOnExpectedChain}
          walletBalances={props.walletBalances}
          walletBalancesStatus={props.walletBalancesStatus}
          walletBalancesError={props.walletBalancesError}
          onAccountChanged={props.onAccountChanged}
          onLoadMoreTrades={props.onLoadMoreTrades}
          onOrderSubmitted={props.onOrderSubmitted}
          onPairCollateralChanged={props.onPairCollateralChanged}
        />
      </section>
    );
  }

  return (
    <section className="panel screenPanel entityListScreen" id="exchange" aria-label="All markets">
      <PanelHeader
        title="Repayment markets"
        action={props.marketsStatus === "loading" ? "Loading" : `${props.filteredPredictionMarkets.length} shown`}
        icon={<ArrowRight size={17} />}
      />
      <MarketFilterControl
        value={props.marketFilter}
        markets={props.predictionMarkets}
        onChange={props.onMarketFilterChange}
      />
      <MarketGrid
        markets={props.filteredPredictionMarkets}
        status={props.marketsStatus}
        error={props.marketsError}
        filter={props.marketFilter}
        selectedMarketKey={props.selectedMarketKey}
        onSelectMarket={props.onSelectMarket}
      />
      {props.marketsStatus === "loaded" && props.marketNextCursor !== null && (
        <div className="tableFooter">
          <button
            className="ghostButton"
            disabled={props.marketPageStatus === "loading"}
            onClick={props.onLoadMoreMarkets}
            type="button"
          >
            {props.marketPageStatus === "loading" ? "Loading markets" : "Load more markets"}
          </button>
          {props.marketPageStatus === "error" && props.marketPageError !== null && (
            <span className="footerError">{props.marketPageError}</span>
          )}
        </div>
      )}
    </section>
  );
}
