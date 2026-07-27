import type { WalletBalances } from "../../chainReads";
import { formatApproval, formatOptionalUsdc, formatUsdc } from "../../lib/format";
import { DetailMetric } from "../shared/DetailMetric";

export function WalletBalancePanel(props: {
  balances: WalletBalances | null;
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
}) {
  if (props.status === "loading" || props.status === "idle") {
    return <div className="walletBalancePanel">Loading balances...</div>;
  }

  if (props.status === "error") {
    return <div className="walletBalancePanel errorActionState">{props.error ?? "Unable to load balances."}</div>;
  }

  if (props.balances === null) {
    return <div className="walletBalancePanel">No balances loaded.</div>;
  }

  return (
    <div className="walletBalancePanel">
      <DetailMetric label="USDC balance" value={`${formatUsdc(props.balances.usdcBalance)} USDC`} />
      <DetailMetric label="Loan allowance" value={formatOptionalUsdc(props.balances.loanAllowance)} />
      <DetailMetric label="Exchange allowance" value={formatOptionalUsdc(props.balances.exchangeAllowance)} />
      <DetailMetric label="Outcome approval" value={formatApproval(props.balances.outcomeExchangeApproved)} />
      <DetailMetric
        label="Selected YES / NO"
        value={
          props.balances.selectedMarket === null
            ? "-"
            : `${formatUsdc(props.balances.selectedMarket.yesBalance)} / ${formatUsdc(props.balances.selectedMarket.noBalance)}`
        }
      />
    </div>
  );
}
