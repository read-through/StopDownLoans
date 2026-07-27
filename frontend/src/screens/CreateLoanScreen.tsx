import { ArrowRight, CircleDollarSign } from "lucide-react";
import type { WalletAccount } from "../wallet";
import { CreateLoanForm } from "../components/loans/CreateLoanForm";
import { FlowStep } from "../components/shared/FlowStep";
import { PanelHeader } from "../components/shared/PanelHeader";

export function CreateLoanScreen(props: {
  walletAccount: WalletAccount | null;
  walletOnExpectedChain: boolean;
  onLoanCreated: () => void;
}) {
  return (
    <section className="createScreenGrid" id="create" aria-label="Create loan">
      <section className="panel screenPanel">
        <PanelHeader
          title="Create Loan"
          action={props.walletAccount === null ? "Connect wallet" : "Borrower flow"}
          icon={<CircleDollarSign size={17} />}
        />
        <CreateLoanForm
          walletAccount={props.walletAccount}
          walletOnExpectedChain={props.walletOnExpectedChain}
          onLoanCreated={props.onLoanCreated}
        />
      </section>
      <section className="panel screenPanel">
        <PanelHeader title="Creation Path" action="MVP" icon={<ArrowRight size={17} />} />
        <div className="flowList" aria-label="Loan creation path">
          <FlowStep title="Create loan" text="Borrower chooses principal, interest, activation deadline, and repayment deadline." />
          <FlowStep title="Deposit borrower collateral" text="Collateral is tracked on the loan and activates the linked proto-market later." />
          <FlowStep title="Funding" text="Lenders fund the loan line and receive transferable lender positions." />
          <FlowStep title="Activation" text="After the withdraw freeze, the loan releases principal and the linked market becomes tradable." />
        </div>
      </section>
    </section>
  );
}
