import type { ApiLoanPosition, ApiOrder, ApiReservation } from "../../api";
import type { WalletBalances } from "../../chainReads";
import type { WalletAccount, WalletStatus } from "../../wallet";
import { shortHex } from "../../lib/format";
import { AccountActionsState } from "./AccountActionsState";
import { Wallet } from "lucide-react";

export function WalletRequiredState(props: {
  account: WalletAccount | null;
  status: WalletStatus;
  error: string | null;
  hasWallet: boolean;
  onExpectedChain: boolean;
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
  balances: WalletBalances | null;
  balancesStatus: "idle" | "loading" | "loaded" | "error";
  balancesError: string | null;
  onLoadMoreOpenOrders: () => void;
  onLoadMoreLoanPositions: () => void;
  onOrderCancelled: () => void;
  onLoanPositionClaimed: () => void;
}) {
  if (!props.hasWallet) {
    return (
      <div className="walletRequiredState">
        <div className="actionIcon">
          <Wallet size={18} />
        </div>
        <div>
          <div className="actionLabel">No browser wallet detected</div>
          <div className="actionDetail">
            Install or enable an EVM wallet to view account-specific positions and actions.
          </div>
        </div>
      </div>
    );
  }

  if (props.status === "error") {
    return (
      <div className="walletRequiredState errorActionState">
        <div className="actionIcon">
          <Wallet size={18} />
        </div>
        <div>
          <div className="actionLabel">Wallet connection failed</div>
          <div className="actionDetail">{props.error ?? "Unable to connect wallet."}</div>
        </div>
      </div>
    );
  }

  if (props.account !== null && !props.onExpectedChain) {
    return (
      <div className="walletRequiredState errorActionState">
        <div className="actionIcon">
          <Wallet size={18} />
        </div>
        <div>
          <div className="actionLabel">Wrong wallet network</div>
          <div className="actionDetail">
            Switch wallet to ARC chain {props.expectedChainId} to use account actions.
          </div>
        </div>
      </div>
    );
  }

  if (props.account !== null) {
    return (
      <AccountActionsState
        account={props.account}
        orders={props.openOrders}
        status={props.openOrdersStatus}
        error={props.openOrdersError}
        nextCursor={props.openOrdersNextCursor}
        pageStatus={props.openOrdersPageStatus}
        pageError={props.openOrdersPageError}
        loanPositions={props.loanPositions}
        loanPositionsStatus={props.loanPositionsStatus}
        loanPositionsError={props.loanPositionsError}
        loanPositionsNextCursor={props.loanPositionsNextCursor}
        loanPositionsPageStatus={props.loanPositionsPageStatus}
        loanPositionsPageError={props.loanPositionsPageError}
        reservations={props.reservations}
        reservationsStatus={props.reservationsStatus}
        reservationsError={props.reservationsError}
        balances={props.balances}
        balancesStatus={props.balancesStatus}
        balancesError={props.balancesError}
        onLoadMoreOpenOrders={props.onLoadMoreOpenOrders}
        onLoadMoreLoanPositions={props.onLoadMoreLoanPositions}
        onOrderCancelled={props.onOrderCancelled}
        onLoanPositionClaimed={props.onLoanPositionClaimed}
      />
    );
  }

  return (
    <div className="walletRequiredState">
      <div className="actionIcon">
        <Wallet size={18} />
      </div>
      <div>
        <div className="actionLabel">
          {props.status === "checking" || props.status === "connecting" ? "Checking wallet" : "Wallet not connected"}
        </div>
        <div className="actionDetail">
          Account-specific funding positions, claims, collateral actions, and open orders appear after wallet connection.
        </div>
      </div>
    </div>
  );
}
