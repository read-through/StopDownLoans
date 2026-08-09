import {
  BadgeDollarSign,
  BarChart3,
  CircleDollarSign,
  LineChart,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import { HealthBadge } from "./components/layout/HealthBadge";
import { useAppController } from "./hooks/useAppController";
import { CreateLoanScreen } from "./screens/CreateLoanScreen";
import { ExchangeScreen } from "./screens/ExchangeScreen";
import { LoansScreen } from "./screens/LoansScreen";
import { OverviewScreen } from "./screens/OverviewScreen";
import { PortfolioScreen } from "./screens/PortfolioScreen";
import { useState } from "react";
import { WalletConnectDialog } from "./components/wallet/WalletConnectDialog";

export function App() {
  const c = useAppController();
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">SD</div>
          <div>
            <div className="brandName">StopDown</div>
            <div className="brandSub">Prediction-backed lending</div>
          </div>
        </div>

        <nav className="navList" aria-label="Primary">
          <a className={c.activeScreen === "overview" ? "navItem active" : "navItem"} href="#overview">
            <BarChart3 size={18} />
            Overview
          </a>
          <a className={c.activeScreen === "create" ? "navItem active" : "navItem"} href="#create">
            <CircleDollarSign size={18} />
            Create Loan
          </a>
          <a className={c.activeScreen === "loans" ? "navItem active" : "navItem"} href="#loans">
            <BadgeDollarSign size={18} />
            Loans
          </a>
          <a className={c.activeScreen === "exchange" ? "navItem active" : "navItem"} href="#exchange">
            <LineChart size={18} />
            Exchange
          </a>
          <a className={c.activeScreen === "portfolio" ? "navItem active" : "navItem"} href="#portfolio">
            <Wallet size={18} />
            Portfolio
          </a>
        </nav>

        <div className="networkBox">
          <div className="networkLabel">Settlement chain</div>
          <div className="networkValue">ARC Testnet</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{c.screenCopy.title}</h1>
            <p>
              {c.screenCopy.description}
              <span className="refreshMeta">Last refresh {c.formatTopbarTime(c.lastRefreshAt)}</span>
            </p>
          </div>
          <div className="topbarActions">
            <HealthBadge
              expectedChainId={c.expectedArcChainIdNumber}
              expectedContracts={c.frontendContracts}
              health={c.health}
              status={c.healthStatus}
              error={c.healthError}
            />
            <button className="ghostButton compactIconButton" onClick={c.refreshAll} type="button">
              <RefreshCcw size={17} />
              Refresh
            </button>
            <button
              className={c.walletAccount !== null && !c.walletOnExpectedChain ? "walletButton warningWalletButton" : "walletButton"}
              onClick={() => {
                if (c.walletAccount?.kind === "injected" && !c.walletOnExpectedChain) {
                  c.connectWallet();
                } else {
                  setWalletDialogOpen(true);
                }
              }}
              title={c.walletError ?? undefined}
              type="button"
            >
              <Wallet size={18} />
              {c.walletAccount === null
                ? c.walletButtonLabel(c.walletStatus)
                : c.walletOnExpectedChain
                  ? c.shortHex(c.walletAccount.address)
                  : "Switch to ARC"}
            </button>
          </div>
        </header>

        {c.activeScreen === "overview" && (
          <OverviewScreen
            dashboardStats={c.dashboardStats}
            selectedLoanDetail={c.selectedLoanDetail}
            selectedMarket={c.selectedMarket}
          />
        )}

        {c.activeScreen === "create" && (
          <CreateLoanScreen
            walletAccount={c.walletAccount}
            walletOnExpectedChain={c.walletOnExpectedChain}
            onLoanCreated={() => {
              c.setLoansRefreshNonce((value) => value + 1);
              c.navigateToScreen("loans");
            }}
          />
        )}

        {c.activeScreen === "loans" && (
          <LoansScreen
            filteredLoanOpportunities={c.filteredLoanOpportunities}
            loanOpportunities={c.loanOpportunities}
            loansStatus={c.loansStatus}
            loansError={c.loansError}
            loanFilter={c.loanFilter}
            onLoanFilterChange={c.setLoanFilter}
            selectedLoanId={c.selectedLoanId}
            onSelectLoan={c.openLoanDetail}
            showDetail={c.routeLoanId !== null}
            onBackToList={() => c.navigateToScreen("loans")}
            loanNextCursor={c.loanNextCursor}
            loanPageStatus={c.loanPageStatus}
            loanPageError={c.loanPageError}
            onLoadMoreLoans={c.loadMoreLoans}
            selectedLoanDetail={c.selectedLoanDetail}
            selectedLoanMarketKey={c.selectedLoanMarketKey}
            walletAccount={c.walletAccount}
            walletOnExpectedChain={c.walletOnExpectedChain}
            walletBalances={c.walletBalances}
            walletBalancesStatus={c.walletBalancesStatus}
            walletBalancesError={c.walletBalancesError}
            onOpenMarket={c.openSelectedLoanMarket}
            onLoanFunded={() => {
              c.setLoansRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
            }}
            onBorrowerCollateralDeposited={() => {
              c.setLoansRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
            }}
            onLoanActivated={() => {
              c.setLoansRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
              c.setBookRefreshNonce((value) => value + 1);
            }}
            onLoanPaymentChanged={() => {
              c.setLoansRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
              c.setBookRefreshNonce((value) => value + 1);
            }}
          />
        )}

        {c.activeScreen === "portfolio" && (
          <PortfolioScreen
            walletAccount={c.walletAccount}
            walletStatus={c.walletStatus}
            walletError={c.walletError}
            hasWallet={c.hasInjectedWallet()}
            walletOnExpectedChain={c.walletOnExpectedChain}
            expectedChainId={c.expectedArcChainIdHex}
            openOrders={c.openOrders}
            openOrdersStatus={c.openOrdersStatus}
            openOrdersError={c.openOrdersError}
            openOrdersNextCursor={c.openOrdersNextCursor}
            openOrdersPageStatus={c.openOrdersPageStatus}
            openOrdersPageError={c.openOrdersPageError}
            loanPositions={c.loanPositions}
            loanPositionsStatus={c.loanPositionsStatus}
            loanPositionsError={c.loanPositionsError}
            loanPositionsNextCursor={c.loanPositionsNextCursor}
            loanPositionsPageStatus={c.loanPositionsPageStatus}
            loanPositionsPageError={c.loanPositionsPageError}
            reservations={c.reservations}
            reservationsStatus={c.reservationsStatus}
            reservationsError={c.reservationsError}
            walletBalances={c.walletBalances}
            walletBalancesStatus={c.walletBalancesStatus}
            walletBalancesError={c.walletBalancesError}
            onLoadMoreOpenOrders={c.loadMoreOpenOrders}
            onLoadMoreLoanPositions={c.loadMoreLoanPositions}
            onOrderCancelled={() => {
              c.setBookRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
            }}
            onLoanPositionClaimed={() => {
              c.setLoansRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
            }}
          />
        )}

        {c.activeScreen === "exchange" && (
          <ExchangeScreen
            marketFilter={c.marketFilter}
            predictionMarkets={c.predictionMarkets}
            filteredPredictionMarkets={c.filteredPredictionMarkets}
            onMarketFilterChange={c.setMarketFilter}
            marketsStatus={c.marketsStatus}
            marketsError={c.marketsError}
            marketNextCursor={c.marketNextCursor}
            marketPageStatus={c.marketPageStatus}
            marketPageError={c.marketPageError}
            selectedMarketKey={c.selectedMarketKey}
            onSelectMarket={c.openMarketDetail}
            showDetail={c.routeMarketKey !== null}
            onBackToList={() => c.navigateToScreen("exchange")}
            selectedMarket={c.selectedMarket}
            bookSnapshot={c.bookSnapshot}
            bookStatus={c.bookStatus}
            bookError={c.bookError}
            selectedOutcome={c.selectedOutcome}
            onSelectOutcome={c.setSelectedOutcome}
            recentTrades={c.recentTrades}
            tradesStatus={c.tradesStatus}
            tradesError={c.tradesError}
            tradesNextCursor={c.tradesNextCursor}
            tradesPageStatus={c.tradesPageStatus}
            tradesPageError={c.tradesPageError}
            feedStatus={c.feedStatus}
            feedError={c.feedError}
            walletAccount={c.walletAccount}
            walletOnExpectedChain={c.walletOnExpectedChain}
            walletBalances={c.walletBalances}
            walletBalancesStatus={c.walletBalancesStatus}
            walletBalancesError={c.walletBalancesError}
            onAccountChanged={() => {
              c.setAccountRefreshNonce((value) => value + 1);
            }}
            onLoadMoreMarkets={c.loadMoreMarkets}
            onLoadMoreTrades={c.loadMoreTrades}
            onOrderSubmitted={() => {
              c.setBookRefreshNonce((value) => value + 1);
              c.setAccountRefreshNonce((value) => value + 1);
            }}
            onPairCollateralChanged={() => {
              c.setAccountRefreshNonce((value) => value + 1);
            }}
          />
        )}
      </section>
      {walletDialogOpen && (
        <WalletConnectDialog
          onClose={() => setWalletDialogOpen(false)}
          onInjectedWallet={() => {
            setWalletDialogOpen(false);
            c.connectWallet();
          }}
          onCircleWallet={c.connectCircleWallet}
        />
      )}
    </main>
  );
}
