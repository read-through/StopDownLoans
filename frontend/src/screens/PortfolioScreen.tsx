import { Wallet } from "lucide-react";
import type { ApiLoanPosition, ApiOrder, ApiReservation } from "../api";
import type { WalletBalances } from "../chainReads";
import type { WalletAccount, WalletStatus } from "../wallet";
import { PanelHeader } from "../components/shared/PanelHeader";
import { WalletReadinessPanel } from "../components/portfolio/WalletReadinessPanel";
import { WalletRequiredState } from "../components/portfolio/WalletRequiredState";

export function PortfolioScreen(props: {
  walletAccount: WalletAccount | null;
  walletStatus: WalletStatus;
  walletError: string | null;
  hasWallet: boolean;
  walletOnExpectedChain: boolean;
  expectedChainId: string;
  openOrders: ApiOrder[];
  openOrdersStatus: "idle" | "loading" | "loaded" | "error";
  openOrdersError: string | null;
  openOrdersNextCursor: string | null;
  openOrdersPageStatus: "idle" | "loading" | "error";
  openOrdersPageError: string | null;
  loanPositions: ApiLoanPosition[];
  loanPositionsStatus: "idle" | "loading" | "loaded" | "error";
  loanPositionsError: string | null;
  loanPositionsNextCursor: string | null;
  loanPositionsPageStatus: "idle" | "loading" | "error";
  loanPositionsPageError: string | null;
  reservations: ApiReservation[];
  reservationsStatus: "idle" | "loading" | "loaded" | "error";
  reservationsError: string | null;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onLoadMoreOpenOrders: () => void;
  onLoadMoreLoanPositions: () => void;
  onOrderCancelled: () => void;
  onLoanPositionClaimed: () => void;
}) {
  return (
    <section className="panel screenPanel" id="portfolio">
      <PanelHeader
        title="Portfolio"
        action={props.walletAccount === null ? "Connect" : "Ready"}
        icon={<Wallet size={17} />}
      />
      <WalletReadinessPanel
        account={props.walletAccount}
        status={props.walletStatus}
        hasWallet={props.hasWallet}
        onExpectedChain={props.walletOnExpectedChain}
        expectedChainId={props.expectedChainId}
        balances={props.walletBalances}
        balancesStatus={props.walletBalancesStatus}
      />
      <WalletRequiredState
        account={props.walletAccount}
        status={props.walletStatus}
        error={props.walletError}
        hasWallet={props.hasWallet}
        onExpectedChain={props.walletOnExpectedChain}
        expectedChainId={props.expectedChainId}
        openOrders={props.openOrders}
        openOrdersStatus={props.openOrdersStatus}
        openOrdersError={props.openOrdersError}
        openOrdersNextCursor={props.openOrdersNextCursor}
        openOrdersPageStatus={props.openOrdersPageStatus}
        openOrdersPageError={props.openOrdersPageError}
        loanPositions={props.loanPositions}
        loanPositionsStatus={props.loanPositionsStatus}
        loanPositionsError={props.loanPositionsError}
        loanPositionsNextCursor={props.loanPositionsNextCursor}
        loanPositionsPageStatus={props.loanPositionsPageStatus}
        loanPositionsPageError={props.loanPositionsPageError}
        reservations={props.reservations}
        reservationsStatus={props.reservationsStatus}
        reservationsError={props.reservationsError}
        balances={props.walletBalances}
        balancesStatus={props.walletBalancesStatus}
        balancesError={props.walletBalancesError}
        onLoadMoreOpenOrders={props.onLoadMoreOpenOrders}
        onLoadMoreLoanPositions={props.onLoadMoreLoanPositions}
        onOrderCancelled={props.onOrderCancelled}
        onLoanPositionClaimed={props.onLoanPositionClaimed}
      />
    </section>
  );
}
