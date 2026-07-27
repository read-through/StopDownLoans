import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

const usdc = (amount: bigint) => amount * 1_000_000n;

describe("LoanPositionToken", function () {
  async function deployLoanPositionToken() {
    const [owner, borrower, lenderA, lenderB] = await viem.getWalletClients();
    const token = await viem.deployContract("MockUSDC");
    const loanPositions = await viem.deployContract("LoanPositionToken", [
      token.address,
      owner.account.address,
      0n,
      owner.account.address,
      ""
    ]);

    return { token, loanPositions, owner, borrower, lenderA, lenderB };
  }

  async function createLoanFixture() {
    const { loanPositions, owner, borrower } = await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const interestBps = 500n;
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);
    const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

    await loanPositions.write.createLoan([
      principal,
      interestBps,
      loanWithdrawFreezeDeadline,
      activationDeadline,
      repaymentDeadline
    ], { account: borrower.account });

    return { loanPositions, owner, borrower, principal, interestBps, repaymentAmount, loanWithdrawFreezeDeadline, activationDeadline, repaymentDeadline };
  }

  async function setMockOutcomeToken(loanPositions: any, owner: any) {
    const outcomeToken = await viem.deployContract("MockOutcomeToken");

    await loanPositions.write.setOutcomeToken([outcomeToken.address], { account: owner.account });

    return outcomeToken;
  }

  it("creates a loan in Funding state", async function () {
    const { loanPositions, owner, borrower, principal, interestBps, repaymentAmount, loanWithdrawFreezeDeadline, activationDeadline, repaymentDeadline } =
      await createLoanFixture();
    const loanCreatedEvents = await loanPositions.getEvents.LoanCreated();
    const loan = await loanPositions.read.loans([1n]);
    const loanView = await loanPositions.read.getLoanView([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);
    const repeatedMarketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loanCreatedEvents.length, 1);
    assert.equal(loanCreatedEvents[0].args.loanId, 1n);
    assert.equal(loanCreatedEvents[0].args.borrower?.toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(loanCreatedEvents[0].args.principal, principal);
    assert.equal(loanCreatedEvents[0].args.repaymentAmount, repaymentAmount);
    assert.equal(loanCreatedEvents[0].args.interestBps, interestBps);
    assert.equal(loanCreatedEvents[0].args.loanWithdrawFreezeDeadline, loanWithdrawFreezeDeadline);
    assert.equal(loanCreatedEvents[0].args.activationDeadline, activationDeadline);
    assert.equal(loanCreatedEvents[0].args.repaymentDeadline, repaymentDeadline);
    assert.equal(loanCreatedEvents[0].args.collateralBps, 10_000n);
    assert.equal(loanCreatedEvents[0].args.marketId, marketId);

    assert.equal(loan[0].toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(loan[1], principal);
    assert.equal(loan[2], repaymentAmount);
    assert.equal(loan[3], loanWithdrawFreezeDeadline);
    assert.equal(loan[4], activationDeadline);
    assert.equal(loan[5], repaymentDeadline);
    assert.equal(loan[6], 0n);
    assert.equal(loan[7], 0n);
    assert.equal(loan[8], 0n);
    assert.equal(loan[9], 0n);
    assert.equal(loan[10], 0);
    assert.equal(await loanPositions.read.loanInterestBps([1n]), interestBps);
    assert.equal(await loanPositions.read.loanFeeBps([1n]), 0n);
    assert.equal((await loanPositions.read.loanFeeRecipient([1n])).toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(await loanPositions.read.loanCollateralBps([1n]), 10_000n);
    assert.equal(marketId, repeatedMarketId);
    assert.equal(await loanPositions.read.getBorrowerCollateralAmount([1n]), repaymentAmount);
    assert.equal(loanView.borrower.toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(loanView.principal, principal);
    assert.equal(loanView.repaymentAmount, repaymentAmount);
    assert.equal(loanView.loanWithdrawFreezeDeadline, loanWithdrawFreezeDeadline);
    assert.equal(loanView.activationDeadline, activationDeadline);
    assert.equal(loanView.repaymentDeadline, repaymentDeadline);
    assert.equal(loanView.fundedAmount, 0n);
    assert.equal(loanView.creditedAmount, 0n);
    assert.equal(loanView.repaymentSatisfiedAt, 0n);
    assert.equal(loanView.feeClaimedAmount, 0n);
    assert.equal(loanView.state, 0);
    assert.equal(loanView.interestBps, interestBps);
    assert.equal(loanView.feeBps, 0n);
    assert.equal(loanView.feeRecipient.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(loanView.collateralBps, 10_000n);
    assert.equal(loanView.borrowerCollateralAmount, repaymentAmount);
    assert.equal(loanView.marketId, marketId);
    assert.equal(await loanPositions.read.nextLoanId(), 2n);
  });

  it("lets the owner transfer ownership", async function () {
    const { loanPositions, owner, borrower, lenderA } = await networkHelpers.loadFixture(deployLoanPositionToken);

    await loanPositions.write.transferOwnership([borrower.account.address], { account: owner.account });

    assert.equal((await loanPositions.read.owner()).toLowerCase(), owner.account.address.toLowerCase());
    assert.equal((await loanPositions.read.pendingOwner()).toLowerCase(), borrower.account.address.toLowerCase());

    await assert.rejects(
      loanPositions.write.acceptOwnership({ account: lenderA.account })
    );

    await assert.rejects(
      loanPositions.write.setPlatformFeeBps([250n], { account: borrower.account })
    );

    await loanPositions.write.acceptOwnership({ account: borrower.account });
    await loanPositions.write.setPlatformFeeBps([250n], { account: borrower.account });

    assert.equal((await loanPositions.read.owner()).toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(await loanPositions.read.pendingOwner(), "0x0000000000000000000000000000000000000000");
    assert.equal(await loanPositions.read.platformFeeBps(), 250n);

    await assert.rejects(
      loanPositions.write.setPlatformFeeBps([500n], { account: owner.account })
    );
  });

  it("restricts platform fee settings to the owner", async function () {
    const { loanPositions, owner, borrower, lenderA } = await networkHelpers.loadFixture(deployLoanPositionToken);

    await assert.rejects(
      loanPositions.write.setPlatformFeeBps([250n], { account: borrower.account })
    );
    await assert.rejects(
      loanPositions.write.setPlatformFeeRecipient([lenderA.account.address], { account: borrower.account })
    );

    await loanPositions.write.setPlatformFeeBps([250n], { account: owner.account });
    await loanPositions.write.setPlatformFeeRecipient([lenderA.account.address], { account: owner.account });

    assert.equal(await loanPositions.read.platformFeeBps(), 250n);
    assert.equal((await loanPositions.read.platformFeeRecipient()).toLowerCase(), lenderA.account.address.toLowerCase());
  });

  it("lets the owner set collateral bps used by new loans", async function () {
    const { loanPositions, owner, borrower } = await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    await setMockOutcomeToken(loanPositions, owner);

    await assert.rejects(
      loanPositions.write.setPlatformCollateralBps([12_000n], { account: borrower.account })
    );

    await loanPositions.write.setPlatformCollateralBps([12_000n], { account: owner.account });

    await loanPositions.write.createLoan([
      usdc(1000n),
      500n,
      BigInt(now + networkHelpers.time.duration.days(3)),
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await loanPositions.write.setPlatformCollateralBps([8_000n], { account: owner.account });

    assert.equal(await loanPositions.read.platformCollateralBps(), 8_000n);
    assert.equal(await loanPositions.read.loanCollateralBps([1n]), 12_000n);
    assert.equal(await loanPositions.read.getBorrowerCollateralAmount([1n]), usdc(1260n));
  });

  it("creates a proto market through the configured outcome token", async function () {
    const { loanPositions, owner, borrower } = await networkHelpers.loadFixture(deployLoanPositionToken);
    const outcomeToken = await viem.deployContract("MockOutcomeToken");
    const now = await networkHelpers.time.latest();

    await assert.rejects(
      loanPositions.write.setOutcomeToken([outcomeToken.address], { account: borrower.account })
    );

    await loanPositions.write.setOutcomeToken([outcomeToken.address], { account: owner.account });
    await loanPositions.write.createLoan([
      usdc(1000n),
      500n,
      BigInt(now + networkHelpers.time.duration.days(3)),
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(await outcomeToken.read.lastLoanId(), 1n);
    assert.equal((await outcomeToken.read.lastBorrower()).toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(await outcomeToken.read.lastBorrowerCollateralAmount(), usdc(1050n));
    assert.equal(await outcomeToken.read.lastMarketId(), marketId);
    assert.equal((await outcomeToken.read.lastCaller()).toLowerCase(), loanPositions.address.toLowerCase());
  });

  it("allows the owner to set the outcome token only once", async function () {
    const { loanPositions, owner } = await networkHelpers.loadFixture(deployLoanPositionToken);
    const firstOutcomeToken = await viem.deployContract("MockOutcomeToken");
    const secondOutcomeToken = await viem.deployContract("MockOutcomeToken");

    await loanPositions.write.setOutcomeToken([firstOutcomeToken.address], { account: owner.account });

    await assert.rejects(
      loanPositions.write.setOutcomeToken([secondOutcomeToken.address], { account: owner.account })
    );

    assert.equal((await loanPositions.read.outcomeToken()).toLowerCase(), firstOutcomeToken.address.toLowerCase());
  });

  it("funds a loan and mints a unique lender position", async function () {
    const { token, loanPositions, owner, lenderA } = await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      BigInt(now + networkHelpers.time.duration.days(3)),
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: lenderA.account });

    await token.write.mint([lenderA.account.address, usdc(600n)]);
    await token.write.approve([loanPositions.address, usdc(600n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(600n)], { account: lenderA.account });

    const loan = await loanPositions.read.loans([1n]);
    const position = await loanPositions.read.positions([1n]);

    assert.equal(loan[6], usdc(600n));
    assert.equal(loan[10], 0);
    assert.equal(position[0], 1n);
    assert.equal(position[1], usdc(600n));
    assert.equal(position[2], 0n);
    assert.equal(position[3], false);
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 1n);
    assert.equal(await token.read.balanceOf([loanPositions.address]), usdc(600n));
  });

  it("accepts only the remaining principal and marks the loan as Funded", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      usdc(1000n),
      500n,
      BigInt(now + networkHelpers.time.duration.days(3)),
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(900n)]);
    await token.write.mint([lenderB.account.address, usdc(150n)]);
    await token.write.approve([loanPositions.address, usdc(900n)], { account: lenderA.account });
    await token.write.approve([loanPositions.address, usdc(150n)], { account: lenderB.account });

    await loanPositions.write.fund([1n, usdc(900n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(150n)], { account: lenderB.account });

    const loan = await loanPositions.read.loans([1n]);
    const secondPosition = await loanPositions.read.positions([2n]);

    assert.equal(loan[6], usdc(1000n));
    assert.equal(loan[10], 1);
    assert.equal(secondPosition[1], usdc(100n));
    assert.equal(await token.read.balanceOf([lenderB.account.address]), usdc(50n));
    assert.equal(await loanPositions.read.balanceOf([lenderB.account.address, 2n]), 1n);
  });

  it("lets a lender withdraw funding before the loan withdraw freeze deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      usdc(1000n),
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(250n)]);
    await token.write.approve([loanPositions.address, usdc(250n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(250n)], { account: lenderA.account });

    assert.equal(await loanPositions.read.getClaimable([1n], { account: lenderA.account }), usdc(250n));

    await loanPositions.write.claim([1n], { account: lenderA.account });

    const loan = await loanPositions.read.loans([1n]);
    const position = await loanPositions.read.positions([1n]);

    assert.equal(loan[6], 0n);
    assert.equal(loan[10], 0);
    assert.equal(position[2], usdc(250n));
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 0n);
    assert.equal(await token.read.balanceOf([lenderA.account.address]), usdc(250n));
  });

  it("moves a funded loan back to Funding when a lender withdraws before the loan withdraw freeze deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);
    const principal = usdc(1000n);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await loanPositions.write.claim([1n], { account: lenderA.account });

    const loan = await loanPositions.read.loans([1n]);

    assert.equal(loan[6], 0n);
    assert.equal(loan[10], 0);
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 0n);
    assert.equal(await token.read.balanceOf([lenderA.account.address]), principal);
  });

  it("rejects activation before the loan withdraw freeze deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      BigInt(now + networkHelpers.time.duration.days(3)),
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });

    await assert.rejects(
      loanPositions.write.activate([1n])
    );
  });

  it("rejects loan creation when outcome token is not configured", async function () {
    const { loanPositions, borrower } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));

    await assert.rejects(
      loanPositions.write.createLoan([
        principal,
        500n,
        loanWithdrawFreezeDeadline,
        BigInt(now + networkHelpers.time.duration.days(7)),
        BigInt(now + networkHelpers.time.duration.days(37))
      ], { account: borrower.account })
    );
  });

  it("atomically activates a funded loan and releases principal", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });

    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    const loan = await loanPositions.read.loans([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loan[10], 2);
    assert.equal(await outcomeToken.read.lastActivatedMarketId(), marketId);
    assert.equal(await token.read.balanceOf([borrower.account.address]), principal);
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
  });

  it("rejects activation after the activation deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      activationDeadline,
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });

    await networkHelpers.time.increaseTo(activationDeadline + 1n);

    await assert.rejects(
      loanPositions.write.activate([1n])
    );
  });

  it("credits repayment only after activation and settles a repaid loan", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });

    await token.write.mint([lenderB.account.address, repaymentAmount]);
    await token.write.approve([loanPositions.address, repaymentAmount], { account: lenderB.account });

    await assert.rejects(
      loanPositions.write.depositToLoan([1n, repaymentAmount], { account: lenderB.account })
    );

    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);
    await loanPositions.write.depositToLoan([1n, repaymentAmount], { account: lenderB.account });
    await loanPositions.write.settleRepaid([1n]);

    const loan = await loanPositions.read.loans([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loan[7], repaymentAmount);
    assert.equal(loan[10], 4);
    assert.equal(await outcomeToken.read.lastResolvedMarketId(), marketId);
    assert.equal(await outcomeToken.read.lastWinningOutcome(), 1);
    assert.equal(await token.read.balanceOf([loanPositions.address]), repaymentAmount);
  });

  it("rejects repayment settlement before enough money is credited", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    await token.write.mint([lenderB.account.address, usdc(500n)]);
    await token.write.approve([loanPositions.address, usdc(500n)], { account: lenderB.account });
    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });

    await assert.rejects(
      loanPositions.write.settleRepaid([1n])
    );

    const loan = await loanPositions.read.loans([1n]);

    assert.equal(loan[7], usdc(500n));
    assert.equal(loan[10], 2);
  });

  it("marks an active loan as defaulted after the repayment deadline when repayment is insufficient", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      repaymentDeadline
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    await token.write.mint([lenderB.account.address, usdc(500n)]);
    await token.write.approve([loanPositions.address, usdc(500n)], { account: lenderB.account });
    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);
    await loanPositions.write.markDefaulted([1n], { account: lenderB.account });

    const loan = await loanPositions.read.loans([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loan[7], usdc(500n));
    assert.equal(loan[10], 5);
    assert.equal(await outcomeToken.read.lastResolvedMarketId(), marketId);
    assert.equal(await outcomeToken.read.lastWinningOutcome(), 2);
  });

  it("redeems held NO outcome tokens into the lender recovery pool after default", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));
    const outcomeToken = await viem.deployContract("OutcomeToken", [
      loanPositions.address,
      token.address,
      ""
    ]);

    await loanPositions.write.setOutcomeToken([outcomeToken.address], { account: owner.account });
    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      activationDeadline,
      repaymentDeadline
    ], { account: borrower.account });

    const marketId = await loanPositions.read.getMarketId([1n]);
    const noTokenId = await outcomeToken.read.getNoTokenId([marketId]);

    await token.write.mint([borrower.account.address, repaymentAmount]);
    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([outcomeToken.address, repaymentAmount], { account: borrower.account });
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, repaymentAmount], { account: borrower.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    assert.equal(await outcomeToken.read.balanceOf([loanPositions.address, noTokenId]), repaymentAmount);

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);
    await loanPositions.write.markDefaulted([1n]);
    await loanPositions.write.redeemDefaultCollateral([1n]);

    const loan = await loanPositions.read.loans([1n]);

    assert.equal(loan[7], repaymentAmount);
    assert.equal(await outcomeToken.read.balanceOf([loanPositions.address, noTokenId]), 0n);
    assert.equal(await token.read.balanceOf([loanPositions.address]), repaymentAmount);

    await loanPositions.write.claim([1n], { account: lenderA.account });

    assert.equal(await token.read.balanceOf([lenderA.account.address]), repaymentAmount);
  });

  it("runs the full repaid happy path with real outcome collateral redemption", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const interest = usdc(50n);
    const repaymentAmount = principal + interest;
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));
    const outcomeToken = await viem.deployContract("OutcomeToken", [
      loanPositions.address,
      token.address,
      ""
    ]);

    await loanPositions.write.setOutcomeToken([outcomeToken.address], { account: owner.account });
    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      activationDeadline,
      repaymentDeadline
    ], { account: borrower.account });

    const marketId = await loanPositions.read.getMarketId([1n]);
    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);

    await token.write.mint([borrower.account.address, repaymentAmount + interest]);
    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([outcomeToken.address, repaymentAmount], { account: borrower.account });
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, repaymentAmount], { account: borrower.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    await token.write.approve([loanPositions.address, repaymentAmount], { account: borrower.account });
    await loanPositions.write.depositToLoan([1n, repaymentAmount], { account: borrower.account });
    await loanPositions.write.settleRepaid([1n]);
    await loanPositions.write.claim([1n], { account: lenderA.account });
    await outcomeToken.write.redeem([marketId, 1, repaymentAmount], { account: borrower.account });

    const loan = await loanPositions.read.loans([1n]);

    assert.equal(loan[7], repaymentAmount);
    assert.equal(loan[10], 4);
    assert.equal(await outcomeToken.read.balanceOf([borrower.account.address, yesTokenId]), 0n);
    assert.equal(await token.read.balanceOf([lenderA.account.address]), repaymentAmount);
    assert.equal(await token.read.balanceOf([borrower.account.address]), repaymentAmount);
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
    assert.equal(await token.read.balanceOf([outcomeToken.address]), 0n);
  });

  it("rejects default before the repayment deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    await assert.rejects(
      loanPositions.write.markDefaulted([1n])
    );
  });

  it("settles as repaid after the deadline when full repayment was credited before the deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      repaymentDeadline
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    await token.write.mint([lenderB.account.address, repaymentAmount]);
    await token.write.approve([loanPositions.address, repaymentAmount], { account: lenderB.account });
    await loanPositions.write.depositToLoan([1n, repaymentAmount], { account: lenderB.account });

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);

    await assert.rejects(
      loanPositions.write.markDefaulted([1n])
    );

    await loanPositions.write.settleRepaid([1n]);

    const loan = await loanPositions.read.loans([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loan[8] <= repaymentDeadline, true);
    assert.equal(loan[10], 4);
    assert.equal(await outcomeToken.read.lastResolvedMarketId(), marketId);
    assert.equal(await outcomeToken.read.lastWinningOutcome(), 1);
  });

  it("rejects active repayment deposits after the repayment deadline", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      repaymentDeadline
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);

    await token.write.mint([lenderB.account.address, repaymentAmount]);
    await token.write.approve([loanPositions.address, repaymentAmount], { account: lenderB.account });

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);

    await assert.rejects(
      loanPositions.write.depositToLoan([1n, repaymentAmount], { account: lenderB.account })
    );
  });

  it("lets lender positions claim repayment without burning the position", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(600n)]);
    await token.write.mint([lenderB.account.address, usdc(400n) + repaymentAmount]);
    await token.write.approve([loanPositions.address, usdc(600n)], { account: lenderA.account });
    await token.write.approve([loanPositions.address, usdc(400n) + repaymentAmount], { account: lenderB.account });

    await loanPositions.write.fund([1n, usdc(600n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(400n)], { account: lenderB.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);
    await loanPositions.write.depositToLoan([1n, repaymentAmount], { account: lenderB.account });
    await loanPositions.write.settleRepaid([1n]);

    assert.equal(await loanPositions.read.getClaimable([1n], { account: lenderA.account }), usdc(630n));
    assert.equal(await loanPositions.read.getClaimable([2n], { account: lenderB.account }), usdc(420n));

    await loanPositions.write.claim([1n], { account: lenderA.account });
    await loanPositions.write.claim([2n], { account: lenderB.account });

    const firstPosition = await loanPositions.read.positions([1n]);
    const secondPosition = await loanPositions.read.positions([2n]);

    assert.equal(firstPosition[2], usdc(630n));
    assert.equal(secondPosition[2], usdc(420n));
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 1n);
    assert.equal(await loanPositions.read.balanceOf([lenderB.account.address, 2n]), 1n);
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);

    await assert.rejects(
      loanPositions.write.claim([1n], { account: lenderA.account })
    );
    await assert.rejects(
      loanPositions.read.getClaimable([1n], { account: lenderA.account })
    );
  });

  it("takes protocol fee only from profit", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const repaymentAmount = usdc(1050n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);

    await loanPositions.write.setPlatformFeeBps([1_000n], { account: owner.account });
    await loanPositions.write.setPlatformFeeRecipient([borrower.account.address], { account: owner.account });

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(600n)]);
    await token.write.mint([lenderB.account.address, usdc(400n) + repaymentAmount]);
    await token.write.approve([loanPositions.address, usdc(600n)], { account: lenderA.account });
    await token.write.approve([loanPositions.address, usdc(400n) + repaymentAmount], { account: lenderB.account });

    await loanPositions.write.fund([1n, usdc(600n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(400n)], { account: lenderB.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);
    await loanPositions.write.depositToLoan([1n, repaymentAmount], { account: lenderB.account });
    await loanPositions.write.settleRepaid([1n]);

    await loanPositions.write.claim([1n], { account: lenderA.account });
    await loanPositions.write.claim([2n], { account: lenderB.account });

    await assert.rejects(
      loanPositions.write.claimPlatformFee([1n], { account: borrower.account })
    );

    await loanPositions.write.claimPlatformFee([1n]);

    const firstPosition = await loanPositions.read.positions([1n]);
    const secondPosition = await loanPositions.read.positions([2n]);
    const loan = await loanPositions.read.loans([1n]);

    assert.equal(firstPosition[2], usdc(627n));
    assert.equal(secondPosition[2], usdc(418n));
    assert.equal(loan[9], usdc(5n));
    assert.equal(await token.read.balanceOf([borrower.account.address]), principal + usdc(5n));
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
  });

  it("lets lender positions claim partial default recovery proportionally", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      repaymentDeadline
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(600n)]);
    await token.write.mint([lenderB.account.address, usdc(400n) + usdc(500n)]);
    await token.write.approve([loanPositions.address, usdc(600n)], { account: lenderA.account });
    await token.write.approve([loanPositions.address, usdc(400n) + usdc(500n)], { account: lenderB.account });

    await loanPositions.write.fund([1n, usdc(600n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(400n)], { account: lenderB.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);
    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);
    await loanPositions.write.markDefaulted([1n]);

    await loanPositions.write.claim([1n], { account: lenderA.account });
    await loanPositions.write.claim([2n], { account: lenderB.account });

    const firstPosition = await loanPositions.read.positions([1n]);
    const secondPosition = await loanPositions.read.positions([2n]);

    assert.equal(firstPosition[2], usdc(300n));
    assert.equal(secondPosition[2], usdc(200n));
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
  });

  it("lets positions claim additional recovery deposited after default", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      repaymentDeadline
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(600n)]);
    await token.write.mint([lenderB.account.address, usdc(400n) + usdc(1000n)]);
    await token.write.approve([loanPositions.address, usdc(600n)], { account: lenderA.account });
    await token.write.approve([loanPositions.address, usdc(400n) + usdc(1000n)], { account: lenderB.account });

    await loanPositions.write.fund([1n, usdc(600n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(400n)], { account: lenderB.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);
    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);
    await loanPositions.write.markDefaulted([1n]);

    await loanPositions.write.claim([1n], { account: lenderA.account });
    await loanPositions.write.claim([2n], { account: lenderB.account });

    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });

    await loanPositions.write.claim([1n], { account: lenderA.account });
    await loanPositions.write.claim([2n], { account: lenderB.account });

    const firstPosition = await loanPositions.read.positions([1n]);
    const secondPosition = await loanPositions.read.positions([2n]);

    assert.equal(firstPosition[2], usdc(600n));
    assert.equal(secondPosition[2], usdc(400n));
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
  });

  it("splits a position after partial claim and preserves proportional recovery rights", async function () {
    const { token, loanPositions, owner, borrower, lenderA, lenderB } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const principal = usdc(1000n);
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    await setMockOutcomeToken(loanPositions, owner);
    const repaymentDeadline = BigInt(now + networkHelpers.time.duration.days(37));

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      BigInt(now + networkHelpers.time.duration.days(7)),
      repaymentDeadline
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.mint([lenderB.account.address, usdc(1000n)]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await token.write.approve([loanPositions.address, usdc(1000n)], { account: lenderB.account });

    await loanPositions.write.fund([1n, principal], { account: lenderA.account });
    await networkHelpers.time.increaseTo(loanWithdrawFreezeDeadline);
    await loanPositions.write.activate([1n]);
    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });

    await networkHelpers.time.increaseTo(repaymentDeadline + 1n);
    await loanPositions.write.markDefaulted([1n]);
    await loanPositions.write.claim([1n], { account: lenderA.account });

    await assert.rejects(
      loanPositions.write.splitPosition([1n, usdc(250n)], { account: lenderB.account })
    );

    await loanPositions.write.splitPosition([1n, usdc(400n)], { account: lenderA.account });
    await loanPositions.write.depositToLoan([1n, usdc(500n)], { account: lenderB.account });
    await loanPositions.write.claim([1n], { account: lenderA.account });
    await loanPositions.write.claim([2n], { account: lenderA.account });

    const originalPosition = await loanPositions.read.positions([1n]);
    const splitPosition = await loanPositions.read.positions([2n]);

    assert.equal(originalPosition[1], usdc(600n));
    assert.equal(originalPosition[2], usdc(600n));
    assert.equal(originalPosition[3], true);
    assert.equal(splitPosition[1], usdc(400n));
    assert.equal(splitPosition[2], usdc(400n));
    assert.equal(splitPosition[3], true);
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 1n);
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 2n]), 1n);
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
  });

  it("cancels an unfunded expired loan and lets positions claim principal back with burn", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);
    const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));

    await loanPositions.write.createLoan([
      usdc(1000n),
      500n,
      loanWithdrawFreezeDeadline,
      activationDeadline,
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, usdc(250n)]);
    await token.write.approve([loanPositions.address, usdc(250n)], { account: lenderA.account });
    await loanPositions.write.fund([1n, usdc(250n)], { account: lenderA.account });

    await networkHelpers.time.increaseTo(activationDeadline + 1n);
    await loanPositions.write.cancelExpiredLoan([1n]);
    await loanPositions.write.claim([1n], { account: lenderA.account });

    const loan = await loanPositions.read.loans([1n]);
    const position = await loanPositions.read.positions([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loan[10], 3);
    assert.equal(await outcomeToken.read.lastCancelledMarketId(), marketId);
    assert.equal(position[2], usdc(250n));
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 0n);
    assert.equal(await token.read.balanceOf([lenderA.account.address]), usdc(250n));
    assert.equal(await token.read.balanceOf([loanPositions.address]), 0n);
  });

  it("cancels a funded but inactive expired loan", async function () {
    const { token, loanPositions, owner, borrower, lenderA } =
      await networkHelpers.loadFixture(deployLoanPositionToken);
    const now = await networkHelpers.time.latest();
    const loanWithdrawFreezeDeadline = BigInt(now + networkHelpers.time.duration.days(3));
    const outcomeToken = await setMockOutcomeToken(loanPositions, owner);
    const activationDeadline = BigInt(now + networkHelpers.time.duration.days(7));
    const principal = usdc(1000n);

    await loanPositions.write.createLoan([
      principal,
      500n,
      loanWithdrawFreezeDeadline,
      activationDeadline,
      BigInt(now + networkHelpers.time.duration.days(37))
    ], { account: borrower.account });

    await token.write.mint([lenderA.account.address, principal]);
    await token.write.approve([loanPositions.address, principal], { account: lenderA.account });
    await loanPositions.write.fund([1n, principal], { account: lenderA.account });

    await networkHelpers.time.increaseTo(activationDeadline + 1n);
    await loanPositions.write.cancelExpiredLoan([1n]);
    await loanPositions.write.claim([1n], { account: lenderA.account });

    const loan = await loanPositions.read.loans([1n]);
    const marketId = await loanPositions.read.getMarketId([1n]);

    assert.equal(loan[10], 3);
    assert.equal(await outcomeToken.read.lastCancelledMarketId(), marketId);
    assert.equal(await loanPositions.read.balanceOf([lenderA.account.address, 1n]), 0n);
    assert.equal(await token.read.balanceOf([lenderA.account.address]), principal);
    assert.equal(await token.read.balanceOf([borrower.account.address]), 0n);
  });
});


