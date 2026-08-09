import { useState } from "react";
import { cancelOrder, type ApiCancelOrderResponse, type ApiOrder, type ApiLoanPosition, type ApiReservation } from "../../api";
import type { WalletBalances } from "../../chainReads";
import { buildUnsignedCancel, signCancelOrder } from "../../orderSigning";
import type { WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";
import { errorMessage, formatUsdc, shortHex, formatPriceUnits } from "../../lib/format";
import { LoanPositionsPanel } from "./LoanPositionsPanel";
import { ReservationsPanel } from "./ReservationsPanel";
import { WalletBalancePanel } from "./WalletBalancePanel";
import { Wallet } from "lucide-react";

export function AccountActionsState(props: {
  account: WalletAccount;
  orders: ApiOrder[];
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  nextCursor: string | null;
  pageStatus: "idle" | "loading" | "error";
  pageError: string | null;
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
  const [cancellingOrderHash, setCancellingOrderHash] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<ApiCancelOrderResponse | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const balancePanel = (
    <WalletBalancePanel
      balances={props.balances}
      status={props.balancesStatus}
      error={props.balancesError}
    />
  );
  const positionsPanel = (
    <LoanPositionsPanel
      positions={props.loanPositions}
      status={props.loanPositionsStatus}
      error={props.loanPositionsError}
      account={props.account}
      nextCursor={props.loanPositionsNextCursor}
      pageStatus={props.loanPositionsPageStatus}
      pageError={props.loanPositionsPageError}
      onLoadMore={props.onLoadMoreLoanPositions}
      onLoanPositionClaimed={props.onLoanPositionClaimed}
    />
  );
  const reservationsPanel = (
    <ReservationsPanel
      reservations={props.reservations}
      status={props.reservationsStatus}
      error={props.reservationsError}
    />
  );
  const cancelOpenOrder = (order: ApiOrder) => {
    const provider = getWalletProvider(props.account);
    if (provider === null) {
      setCancelError("No connected wallet provider found.");
      return;
    }

    setCancellingOrderHash(order.orderHash);
    setCancelError(null);
    setCancelResult(null);

    Promise.resolve()
      .then(() => buildUnsignedCancel({ account: props.account, orderHash: order.orderHash }))
      .then((unsignedCancel) => signCancelOrder(provider, unsignedCancel))
      .then((signedCancel) => cancelOrder(signedCancel))
      .then((response) => {
        setCancelResult(response);
        props.onOrderCancelled();
      })
      .catch((error: unknown) => {
        setCancelError(errorMessage(error, "Failed to cancel order"));
      })
      .finally(() => {
        setCancellingOrderHash(null);
      });
  };

  if (props.status === "loading" || props.status === "idle") {
    return (
      <div className="accountActionStack">
        {balancePanel}
        {positionsPanel}
        {reservationsPanel}
        <div className="walletRequiredState">
          <div className="actionIcon">
            <Wallet size={18} />
          </div>
          <div>
            <div className="actionLabel">{shortHex(props.account.address)}</div>
            <div className="actionDetail">Loading open orders...</div>
          </div>
        </div>
      </div>
    );
  }

  if (props.status === "error") {
    return (
      <div className="accountActionStack">
        {balancePanel}
        {positionsPanel}
        {reservationsPanel}
        <div className="walletRequiredState errorActionState">
          <div className="actionIcon">
            <Wallet size={18} />
          </div>
          <div>
            <div className="actionLabel">Open orders unavailable</div>
            <div className="actionDetail">{props.error ?? "Unable to load open orders."}</div>
          </div>
        </div>
      </div>
    );
  }

  if (props.orders.length === 0) {
    return (
      <div className="accountActionStack">
        {balancePanel}
        {positionsPanel}
        {reservationsPanel}
        <div className="walletRequiredState">
          <div className="actionIcon">
            <Wallet size={18} />
          </div>
          <div>
            <div className="actionLabel">{shortHex(props.account.address)}</div>
            <div className="actionDetail">No live CLOB orders for this account.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="accountActionStack">
      {balancePanel}
      {positionsPanel}
      {reservationsPanel}
      {cancelError !== null && <div className="walletRequiredState errorActionState">{cancelError}</div>}
      {cancelResult !== null && (
        <div className="walletRequiredState">
          Cancelled {shortHex(cancelResult.orderHash)} / {formatUsdc(BigInt(cancelResult.cancelledAvailableOutcomeAmount))} released
        </div>
      )}
      <div className="openOrdersList">
        {props.orders.map((order) => (
          <div className="openOrderItem" key={order.orderHash}>
            <div>
              <div className="actionLabel">
                {order.order.side} {order.order.outcome} at {formatPriceUnits(order.priceUnits)}
              </div>
              <div className="actionDetail">
                {shortHex(order.order.marketId)} / {formatUsdc(BigInt(order.availableForMatching))} available
              </div>
            </div>
            <div className="openOrderControls">
              <span className="orderPill">{order.timeInForce}</span>
              <button
                className="smallActionButton"
                disabled={cancellingOrderHash === order.orderHash}
                onClick={() => cancelOpenOrder(order)}
                type="button"
              >
                {cancellingOrderHash === order.orderHash ? "Cancelling" : "Cancel"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {props.nextCursor !== null && (
        <div className="tableFooter">
          <button
            className="ghostButton"
            disabled={props.pageStatus === "loading"}
            onClick={props.onLoadMoreOpenOrders}
            type="button"
          >
            {props.pageStatus === "loading" ? "Loading orders" : "Load more orders"}
          </button>
          {props.pageStatus === "error" && props.pageError !== null && (
            <span className="footerError">{props.pageError}</span>
          )}
        </div>
      )}
    </div>
  );
}
