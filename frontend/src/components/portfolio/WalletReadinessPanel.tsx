import { CheckCircle2, CircleAlert, CircleDot } from "lucide-react";
import type { WalletBalances } from "../../chainReads";
import type { WalletAccount, WalletStatus } from "../../wallet";
import { formatOptionalUsdc, formatUsdc, shortHex } from "../../lib/format";

type ReadinessState = "ready" | "blocked" | "pending";

export function WalletReadinessPanel(props: {
  account: WalletAccount | null;
  status: WalletStatus;
  hasWallet: boolean;
  onExpectedChain: boolean;
  expectedChainId: string;
  balances: WalletBalances | null;
  balancesStatus: "idle" | "loading" | "loaded" | "error";
}) {
  const checks: Array<{ label: string; detail: string; state: ReadinessState }> = [
    {
      label: "Wallet provider",
      detail: props.hasWallet ? "Injected EVM wallet detected." : "Open the app in a browser with an EVM wallet.",
      state: props.hasWallet ? "ready" : "blocked",
    },
    {
      label: "Connected account",
      detail:
        props.account === null
          ? props.status === "checking" || props.status === "connecting"
            ? "Waiting for wallet response."
            : "Connect a wallet to sign transactions and orders."
          : shortHex(props.account.address),
      state: props.account === null ? (props.status === "checking" || props.status === "connecting" ? "pending" : "blocked") : "ready",
    },
    {
      label: "ARC network",
      detail: props.account === null ? "Connect first." : props.onExpectedChain ? `ARC ${props.expectedChainId}` : `Switch to ARC ${props.expectedChainId}.`,
      state: props.account === null ? "pending" : props.onExpectedChain ? "ready" : "blocked",
    },
    {
      label: "Balances",
      detail: getBalanceDetail(props.balances, props.balancesStatus),
      state: getBalanceState(props.account, props.onExpectedChain, props.balances, props.balancesStatus),
    },
    {
      label: "Exchange approvals",
      detail: getExchangeApprovalDetail(props.balances),
      state: getExchangeApprovalState(props.account, props.onExpectedChain, props.balances),
    },
  ];

  return (
    <section className="walletReadinessPanel" aria-label="Live wallet readiness">
      {checks.map((check) => (
        <div className={`walletReadinessItem readiness${check.state}`} key={check.label}>
          <ReadinessIcon state={check.state} />
          <div>
            <div className="actionLabel">{check.label}</div>
            <div className="actionDetail">{check.detail}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

function ReadinessIcon(props: { state: ReadinessState }) {
  if (props.state === "ready") {
    return <CheckCircle2 size={18} />;
  }

  if (props.state === "blocked") {
    return <CircleAlert size={18} />;
  }

  return <CircleDot size={18} />;
}

function getBalanceDetail(
  balances: WalletBalances | null,
  status: "idle" | "loading" | "loaded" | "error"
): string {
  if (status === "error") {
    return "Unable to read wallet balances.";
  }

  if (balances === null) {
    return status === "loading" ? "Loading balances and allowances." : "Connect on ARC to load balances.";
  }

  return `${formatUsdc(balances.usdcBalance)} USDC`;
}

function getBalanceState(
  account: WalletAccount | null,
  onExpectedChain: boolean,
  balances: WalletBalances | null,
  status: "idle" | "loading" | "loaded" | "error"
): ReadinessState {
  if (account === null || !onExpectedChain) {
    return "pending";
  }

  if (status === "error") {
    return "blocked";
  }

  if (balances === null) {
    return "pending";
  }

  return balances.usdcBalance > 0n ? "ready" : "blocked";
}

function getExchangeApprovalDetail(balances: WalletBalances | null): string {
  if (balances === null) {
    return "Load balances to inspect approvals.";
  }

  return `USDC ${formatOptionalUsdc(balances.exchangeAllowance)}, outcome ${balances.outcomeExchangeApproved ? "approved" : "not approved"}.`;
}

function getExchangeApprovalState(
  account: WalletAccount | null,
  onExpectedChain: boolean,
  balances: WalletBalances | null
): ReadinessState {
  if (account === null || !onExpectedChain || balances === null) {
    return "pending";
  }

  return balances.exchangeAllowance !== null && balances.exchangeAllowance > 0n && balances.outcomeExchangeApproved
    ? "ready"
    : "pending";
}
