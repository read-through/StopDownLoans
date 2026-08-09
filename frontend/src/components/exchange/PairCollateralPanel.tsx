import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WalletBalances } from "../../chainReads";
import {
  approveUsdcOutcomeToken,
  depositPairCollateral,
  mintActivatedPair,
  withdrawPairDeposit,
} from "../../chainWrites";
import { errorMessage, formatUsdc, shortHex } from "../../lib/format";
import { parseUsdcInput } from "../../lib/parsing";
import {
  getPairDepositPreflightError,
  getPairMintPreflightError,
  getPairWithdrawPreflightError,
} from "../../lib/preflight";
import type { PredictionMarket } from "../../types";
import type { EthereumProvider, WalletAccount } from "../../wallet";
import { getWalletProvider } from "../../wallet";

export function PairCollateralPanel(props: {
  market: PredictionMarket;
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  walletBalances: WalletBalances | null;
  walletBalancesStatus: "idle" | "loading" | "loaded" | "error";
  walletBalancesError: string | null;
  onPairCollateralChanged: () => void;
}) {
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState<
    "idle" | "approving" | "depositing" | "minting" | "withdrawing" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const parsedAmount = useMemo(() => parseUsdcInput(amount), [amount]);
  const selectedMarketBalances = props.walletBalances?.selectedMarket ?? null;
  const depositError = getPairDepositPreflightError({
    amount: parsedAmount.value,
    balances: props.walletBalances,
    market: props.market,
  });
  const withdrawError = getPairWithdrawPreflightError({
    amount: parsedAmount.value,
    selectedMarket: selectedMarketBalances,
    market: props.market,
  });
  const mintError = getPairMintPreflightError({
    selectedMarket: selectedMarketBalances,
    market: props.market,
  });
  const needsApproval =
    parsedAmount.value !== null &&
    props.walletBalances?.outcomeAllowance !== null &&
    props.walletBalances?.outcomeAllowance !== undefined &&
    props.walletBalances.outcomeAllowance < parsedAmount.value;
  const isBusy =
    status === "approving" ||
    status === "depositing" ||
    status === "minting" ||
    status === "withdrawing";
  const canDeposit =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    props.walletBalances !== null &&
    parsedAmount.value !== null &&
    depositError === null &&
    !isBusy;
  const canWithdraw =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    props.walletBalances !== null &&
    parsedAmount.value !== null &&
    withdrawError === null &&
    !isBusy;
  const canMint =
    props.walletAccount !== null &&
    props.walletOnExpectedChain &&
    selectedMarketBalances !== null &&
    mintError === null &&
    !isBusy;

  useEffect(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, [props.market.marketId, props.market.outcomeToken]);

  const runPairAction = (
    nextStatus: "approving" | "depositing" | "minting" | "withdrawing",
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
        props.onPairCollateralChanged();
      })
      .catch((actionError: unknown) => {
        setError(errorMessage(actionError, fallbackMessage));
        setStatus("error");
      });
  };

  return (
    <section className="orderTicket" aria-label="Pair collateral">
      <div className="ticketHeader">
        <div>
          <h3>Pair collateral</h3>
          <p>Deposit USDC, mint YES+NO after activation, or withdraw unminted collateral.</p>
        </div>
      </div>
      <div className="ticketGrid">
        <label>
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="ticketNote">
        Unminted {formatUsdc(selectedMarketBalances?.unmintedPairDeposit ?? 0n)} USDC / mintable{" "}
        {formatUsdc(selectedMarketBalances?.pairMintable ?? 0n)} pairs
      </div>
      {parsedAmount.error !== null && <div className="ticketNote errorState">{parsedAmount.error}</div>}
      {props.walletAccount === null && <div className="ticketNote">Connect wallet to manage pair collateral.</div>}
      {props.walletAccount !== null && !props.walletOnExpectedChain && <div className="ticketNote errorState">Switch wallet to ARC.</div>}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus === "error" && (
        <div className="ticketNote errorState">{props.walletBalancesError ?? "Unable to load wallet balances and allowances."}</div>
      )}
      {props.walletAccount !== null && props.walletOnExpectedChain && props.walletBalancesStatus !== "error" && props.walletBalances === null && (
        <div className="ticketNote">Loading wallet balances and allowances.</div>
      )}
      {depositError !== null && <div className="ticketNote">{depositError}</div>}
      {needsApproval && (
        <button
          className="ghostButton"
          disabled={status === "approving"}
          onClick={() =>
            runPairAction(
              "approving",
              (provider, account) =>
                approveUsdcOutcomeToken({
                  provider: provider!,
                  account,
                  amount: parsedAmount.value!,
                }),
              "Failed to approve pair collateral"
            )
          }
          type="button"
        >
          {status === "approving" ? "Approving" : "Approve USDC for pairs"}
        </button>
      )}
      <button
        className="primaryButton"
        disabled={!canDeposit}
        onClick={() =>
          runPairAction(
            "depositing",
            (provider, account) =>
              depositPairCollateral({
                provider: provider!,
                account,
                marketId: props.market.marketId,
                amount: parsedAmount.value!,
              }),
            "Failed to deposit pair collateral"
          )
        }
        type="button"
      >
        {status === "depositing" ? "Depositing" : "Deposit pair collateral"}
        <ArrowRight size={17} />
      </button>
      {mintError !== null && <div className="ticketNote">{mintError}</div>}
      <button
        className="ghostButton"
        disabled={!canMint}
        onClick={() =>
          runPairAction(
            "minting",
            (provider, account) =>
              mintActivatedPair({
                provider: provider!,
                account,
                marketId: props.market.marketId,
              }),
            "Failed to mint activated pair"
          )
        }
        type="button"
      >
        {status === "minting" ? "Minting" : "Mint YES + NO"}
      </button>
      {withdrawError !== null && <div className="ticketNote">{withdrawError}</div>}
      <button
        className="ghostButton"
        disabled={!canWithdraw}
        onClick={() =>
          runPairAction(
            "withdrawing",
            (provider, account) =>
              withdrawPairDeposit({
                provider: provider!,
                account,
                marketId: props.market.marketId,
                amount: parsedAmount.value!,
              }),
            "Failed to withdraw pair collateral"
          )
        }
        type="button"
      >
        {status === "withdrawing" ? "Withdrawing" : "Withdraw unminted deposit"}
      </button>
      {txHash !== null && <div className="ticketNote">Transaction {shortHex(txHash)}</div>}
      {status === "error" && error !== null && <div className="ticketNote errorState">{error}</div>}
    </section>
  );
}
