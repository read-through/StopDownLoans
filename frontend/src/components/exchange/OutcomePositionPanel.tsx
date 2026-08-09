import { useEffect, useMemo, useState } from "react";
import type { WalletBalances } from "../../chainReads";
import { mergeOutcomePositions, redeemOutcome } from "../../chainWrites";
import type { Outcome, PredictionMarket } from "../../types";
import type { EthereumProvider, WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";
import { errorMessage, formatUsdc, shortHex } from "../../lib/format";
import { parseUsdcInput } from "../../lib/parsing";
import {
  getMergePositionsPreflightError,
  getRedeemOutcomePreflightError,
} from "../../lib/preflight";
import { OutcomeToggle } from "./OutcomeToggle";
import { ArrowRight } from "lucide-react";

export function OutcomePositionPanel(props: {
  market: PredictionMarket;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onOutcomePositionChanged: () => void;
}) {
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState<"idle" | "merging" | "redeeming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const parsedAmount = useMemo(() => parseUsdcInput(amount), [amount]);
  const selectedMarket = props.walletBalances?.selectedMarket ?? null;
  const mergeError = getMergePositionsPreflightError({
    amount: parsedAmount.value,
    selectedMarket,
  });
  const redeemError = getRedeemOutcomePreflightError({
    amount: parsedAmount.value,
    selectedMarket,
  });
  const isBusy = status === "merging" || status === "redeeming";
  const canMerge =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    selectedMarket !== null &&
    parsedAmount.value !== null &&
    mergeError === null &&
    !isBusy;
  const canRedeem =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    selectedMarket !== null &&
    parsedAmount.value !== null &&
    redeemError === null &&
    !isBusy;

  useEffect(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, [props.market.marketId, props.market.outcomeToken]);

  const runOutcomeAction = (
    nextStatus: "merging" | "redeeming",
    action: (provider: EthereumProvider, account: WalletAccount) => Promise<string>,
    fallbackMessage: string
  ) => {
    if (props.walletAccount === null) {
      return;
    }

    const provider = getWalletProvider(props.walletAccount);
    if (provider === null) {
      setStatus("error");
      setError("No connected wallet provider found.");
      return;
    }

    setStatus(nextStatus);
    setError(null);
    setTxHash(null);

    action(provider, props.walletAccount)
      .then((hash) => {
        setTxHash(hash);
        setStatus("done");
        props.onOutcomePositionChanged();
      })
      .catch((actionError: unknown) => {
        setError(errorMessage(actionError, fallbackMessage));
        setStatus("error");
      });
  };

  const winningOutcome = selectedMarket?.winningOutcome ?? "None";

  return (
    <section className="orderTicket" aria-label="Outcome positions">
      <div className="ticketHeader">
        <div>
          <h3>Outcome positions</h3>
          <p>Merge matched YES/NO pairs in active markets or redeem the winning outcome after resolution.</p>
        </div>
      </div>
      <div className="ticketGrid">
        <label>
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="ticketNote">
        YES {formatUsdc(selectedMarket?.yesBalance ?? 0n)} / NO {formatUsdc(selectedMarket?.noBalance ?? 0n)} / winner {winningOutcome}
      </div>
      {parsedAmount.error !== null && <div className="ticketNote errorState">{parsedAmount.error}</div>}
      {props.walletAccount === null && <div className="ticketNote">Connect wallet to manage outcome positions.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus === "error" && (
        <div className="ticketNote errorState">{props.walletBalancesError ?? "Unable to load wallet balances and allowances."}</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus !== "error" && props.walletBalances === null && (
        <div className="ticketNote">Loading wallet balances and allowances.</div>
      )}
      {mergeError !== null && <div className="ticketNote">{mergeError}</div>}
      <button
        className="ghostButton"
        disabled={!canMerge}
        onClick={() =>
          runOutcomeAction(
            "merging",
            (provider, account) =>
              mergeOutcomePositions({
                provider,
                account,
                marketId: props.market.marketId,
                amount: parsedAmount.value!,
              }),
            "Failed to merge outcome positions"
          )
        }
        type="button"
      >
        {status === "merging" ? "Merging" : "Merge YES + NO"}
      </button>
      {redeemError !== null && <div className="ticketNote">{redeemError}</div>}
      <button
        className="primaryButton"
        disabled={!canRedeem}
        onClick={() =>
          runOutcomeAction(
            "redeeming",
            (provider, account) =>
              redeemOutcome({
                provider,
                account,
                marketId: props.market.marketId,
                outcome: selectedMarket!.winningOutcome === "NO" ? "NO" : "YES",
                amount: parsedAmount.value!,
              }),
            "Failed to redeem outcome"
          )
        }
        type="button"
      >
        {status === "redeeming" ? "Redeeming" : "Redeem winner"}
        <ArrowRight size={17} />
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
