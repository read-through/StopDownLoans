import type { PredictionMarket } from "../../types";
import { formatUnixDeadline, formatUsdc, shortHex } from "../../lib/format";
import { DetailMetric } from "../shared/DetailMetric";

export function MarketLoanContext(props: { market: PredictionMarket }) {
  if (props.market.loan === null) {
    return (
      <div className="marketLoanContext standaloneMarketContext">
        <DetailMetric label="Loan context" value="Unavailable from ARC RPC" />
        <DetailMetric label="Outcome token" value={shortHex(props.market.outcomeToken)} />
        <DetailMetric label="Market ID" value={shortHex(props.market.marketId)} />
      </div>
    );
  }

  return (
    <div className="marketLoanContext">
      <DetailMetric label="Loan" value={`#${props.market.loan.loanId}`} />
      <DetailMetric label="Borrower" value={shortHex(props.market.loan.borrower)} />
      <DetailMetric label="Principal" value={`${formatUsdc(BigInt(props.market.loan.principal))} USDC`} />
      <DetailMetric label="Repayment" value={`${formatUsdc(BigInt(props.market.loan.repaymentAmount))} USDC`} />
      <DetailMetric label="Activation" value={formatUnixDeadline(props.market.loan.activationDeadline)} />
      <DetailMetric label="Repayment deadline" value={formatUnixDeadline(props.market.loan.repaymentDeadline)} />
    </div>
  );
}
