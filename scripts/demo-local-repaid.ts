import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

const usdc = (amount: bigint) => amount * 1_000_000n;

const [owner, borrower, lender] = await viem.getWalletClients();
const collateralToken = await viem.deployContract("MockUSDC");
const loanPositionToken = await viem.deployContract("LoanPositionToken", [
  collateralToken.address,
  owner.account.address,
  0n,
  owner.account.address,
  "",
]);
const outcomeToken = await viem.deployContract("OutcomeToken", [
  loanPositionToken.address,
  collateralToken.address,
  "",
]);

await loanPositionToken.write.setOutcomeToken([outcomeToken.address], { account: owner.account });

const now = await networkHelpers.time.latest();
const principal = usdc(1_000n);
const interestBps = 500n;
const repaymentAmount = usdc(1_050n);
const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));
const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

console.log("Local repaid demo");
console.log(`Owner: ${owner.account.address}`);
console.log(`Borrower: ${borrower.account.address}`);
console.log(`Lender: ${lender.account.address}`);
console.log(`Collateral token: ${collateralToken.address}`);
console.log(`LoanPositionToken: ${loanPositionToken.address}`);
console.log(`OutcomeToken: ${outcomeToken.address}`);

await loanPositionToken.write.createLoan([
  principal,
  interestBps,
  loanWithdrawFreezeDeadline,
  activationDeadline,
  repaymentDeadline,
], { account: borrower.account });

const loanId = 1n;
const marketId = await loanPositionToken.read.getMarketId([loanId]);
const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);
const loanView = await loanPositionToken.read.getLoanView([loanId]) as {
  borrowerCollateralAmount: bigint;
};

console.log("");
console.log(`Loan created: loanId=${loanId.toString()}, marketId=${marketId}`);
console.log(`Borrower collateral required: ${loanView.borrowerCollateralAmount.toString()}`);

await collateralToken.write.mint([borrower.account.address, repaymentAmount * 2n]);
await collateralToken.write.mint([lender.account.address, principal]);
await collateralToken.write.approve([outcomeToken.address, loanView.borrowerCollateralAmount], {
  account: borrower.account,
});
await collateralToken.write.approve([loanPositionToken.address, principal], {
  account: lender.account,
});

await outcomeToken.write.depositBorrowerCollateral([marketId, loanView.borrowerCollateralAmount], {
  account: borrower.account,
});
console.log("Borrower collateral deposited");

await loanPositionToken.write.fund([loanId, principal], { account: lender.account });
console.log("Loan funded by lender");

await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
await loanPositionToken.write.activate([loanId]);
console.log("Loan activated and principal released to borrower");

await collateralToken.write.approve([loanPositionToken.address, repaymentAmount], {
  account: borrower.account,
});
await loanPositionToken.write.depositToLoan([loanId, repaymentAmount], { account: borrower.account });
await loanPositionToken.write.settleRepaid([loanId]);
console.log("Loan repaid and market resolved to YES");

await loanPositionToken.write.claim([loanId], { account: lender.account });
console.log("Lender claimed repayment");

await outcomeToken.write.redeem([marketId, 1, loanView.borrowerCollateralAmount], {
  account: borrower.account,
});
console.log("Borrower redeemed YES collateral");

const finalLoan = await loanPositionToken.read.loans([loanId]);
const borrowerYesBalance = await outcomeToken.read.balanceOf([borrower.account.address, yesTokenId]);
const lenderUsdcBalance = await collateralToken.read.balanceOf([lender.account.address]);
const borrowerUsdcBalance = await collateralToken.read.balanceOf([borrower.account.address]);
const loanContractUsdcBalance = await collateralToken.read.balanceOf([loanPositionToken.address]);
const outcomeContractUsdcBalance = await collateralToken.read.balanceOf([outcomeToken.address]);

console.log("");
console.log("Final state:");
console.log(`Loan state: ${String(finalLoan[10])} (4 = Repaid)`);
console.log(`Credited amount: ${String(finalLoan[7])}`);
console.log(`Borrower YES balance: ${borrowerYesBalance.toString()}`);
console.log(`Lender USDC balance: ${lenderUsdcBalance.toString()}`);
console.log(`Borrower USDC balance: ${borrowerUsdcBalance.toString()}`);
console.log(`LoanPositionToken USDC balance: ${loanContractUsdcBalance.toString()}`);
console.log(`OutcomeToken USDC balance: ${outcomeContractUsdcBalance.toString()}`);
