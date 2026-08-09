import { useEffect, useMemo, useState } from "react";
import { submitOrder } from "../../api";
import type { WalletBalances } from "../../chainReads";
import { approveOutcomeExchange, approveUsdcExchange } from "../../chainWrites";
import {
  buildUnsignedOrder,
  previewOrderAmounts,
  signOrder,
} from "../../orderSigning";
import type { Outcome, PredictionMarket } from "../../types";
import type { WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";
import { errorMessage,
  formatOrderSubmitOutcome,
  formatUsdc, shortHex } from "../../lib/format";
import { needsUsdcExchangeApproval, formatOrderSizeBounds, getMarketTickUnits } from "../../lib/mappers";
import { parseUsdcInput } from "../../lib/parsing";
import { getExpirationMinutesError,
  getOrderPreflightError, getOrderInputPreflightError } from "../../lib/preflight";
import { ToggleButton } from "../shared/ToggleButton";
import { ArrowRight } from "lucide-react";
import type { ApiSubmitOrderResponse } from "../../api";

export function OrderTicket(props: {
  market: PredictionMarket;
  outcome: Outcome;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onAccountChanged: () => void;
  onOrderSubmitted: () => void;
}) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [timeInForce, setTimeInForce] = useState<"GTC" | "FAK">("GTC");
  const [price, setPrice] = useState("0.5");
  const [outcomeAmount, setOutcomeAmount] = useState("1");
  const [expirationMinutes, setExpirationMinutes] = useState("1440");
  const [status, setStatus] = useState<"idle" | "signing" | "submitted" | "error">("idle");
  const [approvalStatus, setApprovalStatus] = useState<"idle" | "approving" | "approved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [result, setResult] = useState<ApiSubmitOrderResponse | null>(null);

  const orderPreview = useMemo(() => {
    try {
      return {
        value: previewOrderAmounts({ price, outcomeAmount }),
        error: null,
      };
    } catch (previewError: unknown) {
      return {
        value: null,
        error: errorMessage(previewError, "Invalid order amount"),
      };
    }
  }, [outcomeAmount, price]);
  const expirationError = getExpirationMinutesError(expirationMinutes);
  const orderInputError = getOrderInputPreflightError(props.market, orderPreview.value);
  const preflightError = getOrderPreflightError({
    balances: props.walletBalances,
    market: props.market,
    outcome: props.outcome,
    preview: orderPreview.value,
    side,
  });
  const disabled =
    props.walletAccount === null ||
    !props.walletOnExpectedChain ||
    props.walletBalances === null ||
    orderPreview.value === null ||
    expirationError !== null ||
    preflightError !== null ||
    status === "signing";
  const canRequestApproval =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    props.walletBalances !== null &&
    orderPreview.value !== null &&
    expirationError === null &&
    orderInputError === null;

  useEffect(() => {
    setStatus("idle");
    setApprovalStatus("idle");
    setError(null);
    setApprovalError(null);
    setApprovalTxHash(null);
    setResult(null);
  }, [props.market.marketId, props.market.outcomeToken, props.outcome]);

  const approve = () => {
    if (props.walletAccount === null || !props.walletOnExpectedChain) {
      setApprovalStatus("error");
      setApprovalError("Connect wallet on ARC before approving the exchange.");
      return;
    }

    if (side === "BUY" && orderPreview.value === null) {
      setApprovalStatus("error");
      setApprovalError("Enter a valid order amount before approving USDC.");
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setApprovalStatus("error");
      setApprovalError("No connected wallet provider found.");
      return;
    }

    setApprovalStatus("approving");
    setApprovalError(null);
    setApprovalTxHash(null);

    const approval =
      side === "BUY" && orderPreview.value !== null
        ? approveUsdcExchange({
            provider,
            account: props.walletAccount,
            amount: orderPreview.value.usdcAmount,
          })
        : approveOutcomeExchange({ provider, account: props.walletAccount });

    approval
      .then((txHash) => {
        setApprovalTxHash(txHash);
        setApprovalStatus("approved");
        props.onAccountChanged();
      })
      .catch((approveError: unknown) => {
        setApprovalError(errorMessage(approveError, "Failed to approve exchange"));
        setApprovalStatus("error");
      });
  };

  const submit = () => {
    if (props.walletAccount === null || !props.walletOnExpectedChain) {
      setStatus("error");
      setError("Connect wallet on ARC before submitting an order.");
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    const account = props.walletAccount;
    setStatus("signing");
    setError(null);
    setResult(null);

    Promise.resolve()
      .then(() =>
        buildUnsignedOrder({
          account,
          outcomeToken: props.market.outcomeToken,
          marketId: props.market.marketId,
          outcome: props.outcome,
          side,
          price,
          outcomeAmount,
          timeInForce,
          expirationMinutes,
        })
      )
      .then((unsignedOrder) => signOrder(provider, unsignedOrder))
      .then((signedOrder) => submitOrder(signedOrder))
      .then((response) => {
        setResult(response);
        setStatus("submitted");
        props.onOrderSubmitted();
      })
      .catch((submitError: unknown) => {
        setError(errorMessage(submitError, "Failed to submit order"));
        setStatus("error");
      });
  };

  return (
    <section className="orderTicket" aria-label="Submit limit order">
      <div className="ticketHeader">
        <div>
          <h3>Limit order</h3>
          <p>{props.outcome} / {props.market.outcome}</p>
        </div>
        <div className="detailControls">
          <ToggleButton value="BUY" selected={side} onSelect={setSide} />
          <ToggleButton value="SELL" selected={side} onSelect={setSide} />
        </div>
      </div>
      <div className="ticketGrid">
        <label>
          Price
          <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Outcome amount
          <input value={outcomeAmount} onChange={(event) => setOutcomeAmount(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Expiration minutes
          <input value={expirationMinutes} onChange={(event) => setExpirationMinutes(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          Time in force
          <select value={timeInForce} onChange={(event) => setTimeInForce(event.target.value as "GTC" | "FAK")}>
            <option value="GTC">GTC</option>
            <option value="FAK">FAK</option>
          </select>
        </label>
      </div>
      <div className="ticketNote">
        Tick {formatUsdc(orderPreview.value === null ? BigInt(props.market.defaultTickUnits) : getMarketTickUnits(orderPreview.value.priceUnits, props.market))}
        {" / "}Size {formatOrderSizeBounds(props.market)}
      </div>
      <button className="primaryButton" disabled={disabled} onClick={submit} type="button">
        {status === "signing" ? "Signing" : "Sign order"}
        <ArrowRight size={17} />
      </button>
      {props.walletAccount === null && <div className="ticketNote">Connect wallet to sign an order.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus === "error" && (
        <div className="ticketNote errorState">{props.walletBalancesError ?? "Unable to load wallet balances and allowances."}</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus !== "error" && props.walletBalances === null && (
        <div className="ticketNote">Loading wallet balances and allowances.</div>
      )}
      {orderPreview.value !== null && (
        <div className="ticketNote">
          Requires {side === "BUY" ? `${formatUsdc(orderPreview.value.usdcAmount)} USDC` : `${formatUsdc(orderPreview.value.outcomeAmount)} ${props.outcome}`}
        </div>
      )}
      {side === "SELL" && props.walletBalances?.outcomeExchangeApproved === false && canRequestApproval && (
        <button
          className="ghostButton"
          disabled={approvalStatus === "approving"}
          onClick={approve}
          type="button"
        >
          {approvalStatus === "approving" ? "Approving" : "Approve outcome exchange"}
        </button>
      )}
      {side === "BUY" && orderPreview.value !== null && needsUsdcExchangeApproval(props.walletBalances, orderPreview.value.usdcAmount) && canRequestApproval && (
        <button
          className="ghostButton"
          disabled={approvalStatus === "approving"}
          onClick={approve}
          type="button"
        >
          {approvalStatus === "approving" ? "Approving" : "Approve USDC"}
        </button>
      )}
      {approvalStatus === "approved" && approvalTxHash !== null && (
        <div className="ticketNote">Approval submitted {shortHex(approvalTxHash)}</div>
      )}
      {approvalStatus === "error" && approvalError !== null && (
        <div className="ticketNote errorState">{approvalError}</div>
      )}
      {orderPreview.error !== null && <div className="ticketNote errorState">{orderPreview.error}</div>}
      {expirationError !== null && <div className="ticketNote errorState">{expirationError}</div>}
      {preflightError !== null && <div className="ticketNote errorState">{preflightError}</div>}
      {status === "error" && <div className="ticketNote errorState">{error}</div>}
      {status === "submitted" && result !== null && (
        <div className="ticketNote submitResult">
          <span>Submitted {shortHex(result.orderHash)} / {formatOrderSubmitOutcome(result)}</span>
          <span>
            {formatUsdc(BigInt(result.availableForMatching))} available /{" "}
            {formatUsdc(BigInt(result.pendingMatchedOutcomeAmount))} pending match
          </span>
          {result.createdTradeIds.length > 0 && (
            <span>Trade {result.createdTradeIds.map((tradeId) => `#${tradeId}`).join(", ")}</span>
          )}
        </div>
      )}
    </section>
  );
}
