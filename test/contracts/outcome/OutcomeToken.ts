import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { viem } = await network.create();

const usdc = (amount: bigint) => amount * 1_000_000n;

describe("OutcomeToken", function () {
  async function deployOutcomeToken() {
    const [loanPositionToken, borrower, other] = await viem.getWalletClients();
    const collateralToken = await viem.deployContract("MockUSDC");
    const outcomeToken = await viem.deployContract("OutcomeToken", [
      loanPositionToken.account.address,
      collateralToken.address,
      ""
    ]);

    return { collateralToken, outcomeToken, loanPositionToken, borrower, other };
  }

  it("creates a proto market only from the loan position token", async function () {
    const { outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "11".repeat(32);

    await assert.rejects(
      outcomeToken.write.createProtoMarket([
        1n,
        borrower.account.address,
        usdc(1050n),
        marketId as `0x${string}`
      ], { account: other.account })
    );

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      usdc(1050n),
      marketId as `0x${string}`
    ], { account: loanPositionToken.account });

    const market = await outcomeToken.read.markets([marketId as `0x${string}`]);
    const marketView = await outcomeToken.read.getMarketView([marketId as `0x${string}`]);
    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId as `0x${string}`]);
    const repeatedYesTokenId = await outcomeToken.read.getYesTokenId([marketId as `0x${string}`]);
    const noTokenId = await outcomeToken.read.getNoTokenId([marketId as `0x${string}`]);

    assert.equal(market[0], 1n);
    assert.equal(market[1].toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(market[2], usdc(1050n));
    assert.equal(market[4], 0);
    assert.equal(marketView.loanId, 1n);
    assert.equal(marketView.borrower.toLowerCase(), borrower.account.address.toLowerCase());
    assert.equal(marketView.borrowerCollateralAmount, usdc(1050n));
    assert.equal(marketView.borrowerCollateralDepositedAmount, 0n);
    assert.equal(marketView.winningOutcome, 0);
    assert.equal(marketView.state, 0);
    assert.equal(marketView.yesTokenId, yesTokenId);
    assert.equal(marketView.noTokenId, noTokenId);
    assert.equal(yesTokenId, repeatedYesTokenId);
    assert.notEqual(yesTokenId, noTokenId);

    await assert.rejects(
      outcomeToken.write.createProtoMarket([
        1n,
        borrower.account.address,
        usdc(1050n),
        marketId as `0x${string}`
      ], { account: loanPositionToken.account })
    );
  });

  it("activates borrower collateral and lets pair depositors lazily mint YES and NO", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "22".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);
    const pairCollateralAmount = usdc(250n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.mint([other.account.address, pairCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount], { account: other.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });

    await assert.rejects(
      outcomeToken.read.getPairMintable([marketId, other.account.address])
    );
    await assert.rejects(
      outcomeToken.write.mintActivatedPair([marketId], { account: other.account })
    );

    await outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account });

    assert.equal(await outcomeToken.read.getPairMintable([marketId, other.account.address]), pairCollateralAmount);

    await outcomeToken.write.mintActivatedPair([marketId], { account: other.account });

    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);
    const noTokenId = await outcomeToken.read.getNoTokenId([marketId]);
    const market = await outcomeToken.read.markets([marketId]);

    assert.equal(market[4], 1);
    assert.equal(await outcomeToken.read.balanceOf([borrower.account.address, yesTokenId]), borrowerCollateralAmount);
    assert.equal(await outcomeToken.read.balanceOf([loanPositionToken.account.address, noTokenId]), borrowerCollateralAmount);
    assert.equal(await outcomeToken.read.balanceOf([other.account.address, yesTokenId]), pairCollateralAmount);
    assert.equal(await outcomeToken.read.balanceOf([other.account.address, noTokenId]), pairCollateralAmount);
    assert.equal(await collateralToken.read.balanceOf([outcomeToken.address]), borrowerCollateralAmount + pairCollateralAmount);
    assert.equal(await outcomeToken.read.getPairMintable([marketId, other.account.address]), 0n);

    await assert.rejects(
      outcomeToken.write.mintActivatedPair([marketId], { account: other.account })
    );

    await collateralToken.write.mint([other.account.address, pairCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount], { account: other.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });

    assert.equal(await outcomeToken.read.getPairMintable([marketId, other.account.address]), pairCollateralAmount);

    await outcomeToken.write.mintActivatedPair([marketId], { account: other.account });

    assert.equal(await outcomeToken.read.balanceOf([other.account.address, yesTokenId]), pairCollateralAmount * 2n);
    assert.equal(await outcomeToken.read.balanceOf([other.account.address, noTokenId]), pairCollateralAmount * 2n);
  });

  it("lets depositors withdraw only unminted pair deposits in proto and active markets", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "88".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);
    const pairCollateralAmount = usdc(250n);
    const withdrawAmount = usdc(100n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.mint([other.account.address, pairCollateralAmount * 2n]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount * 2n], { account: other.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });

    assert.equal(await outcomeToken.read.getUnmintedPairDeposit([marketId, other.account.address]), pairCollateralAmount);

    await outcomeToken.write.withdrawPairDeposit([marketId, withdrawAmount], { account: other.account });

    assert.equal(await outcomeToken.read.pendingPairCollateral([marketId, other.account.address]), pairCollateralAmount - withdrawAmount);
    assert.equal(await outcomeToken.read.getUnmintedPairDeposit([marketId, other.account.address]), pairCollateralAmount - withdrawAmount);
    assert.equal(await collateralToken.read.balanceOf([other.account.address]), pairCollateralAmount + withdrawAmount);

    await outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account });
    await outcomeToken.write.mintActivatedPair([marketId], { account: other.account });

    assert.equal(await outcomeToken.read.getUnmintedPairDeposit([marketId, other.account.address]), 0n);

    await assert.rejects(
      outcomeToken.write.withdrawPairDeposit([marketId, 1n], { account: other.account })
    );

    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });
    assert.equal(await outcomeToken.read.getUnmintedPairDeposit([marketId, other.account.address]), pairCollateralAmount);
    await outcomeToken.write.withdrawPairDeposit([marketId, pairCollateralAmount], { account: other.account });

    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);
    const noTokenId = await outcomeToken.read.getNoTokenId([marketId]);

    assert.equal(await outcomeToken.read.balanceOf([other.account.address, yesTokenId]), pairCollateralAmount - withdrawAmount);
    assert.equal(await outcomeToken.read.balanceOf([other.account.address, noTokenId]), pairCollateralAmount - withdrawAmount);
    assert.equal(await collateralToken.read.balanceOf([other.account.address]), pairCollateralAmount + withdrawAmount);
  });

  it("merges equal YES and NO back into collateral while active", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "55".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);
    const pairCollateralAmount = usdc(250n);
    const mergeAmount = usdc(100n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.mint([other.account.address, pairCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount], { account: other.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });

    await assert.rejects(
      outcomeToken.write.mergePositions([marketId, mergeAmount], { account: other.account })
    );

    await outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account });
    await outcomeToken.write.mintActivatedPair([marketId], { account: other.account });
    await outcomeToken.write.mergePositions([marketId, mergeAmount], { account: other.account });

    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);
    const noTokenId = await outcomeToken.read.getNoTokenId([marketId]);

    assert.equal(await outcomeToken.read.balanceOf([other.account.address, yesTokenId]), pairCollateralAmount - mergeAmount);
    assert.equal(await outcomeToken.read.balanceOf([other.account.address, noTokenId]), pairCollateralAmount - mergeAmount);
    assert.equal(await collateralToken.read.balanceOf([other.account.address]), mergeAmount);
    assert.equal(await collateralToken.read.balanceOf([outcomeToken.address]), borrowerCollateralAmount + pairCollateralAmount - mergeAmount);
  });

  it("resolves an active market only from the loan position token", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "66".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await assert.rejects(
      outcomeToken.write.resolveMarket([marketId, 1], { account: loanPositionToken.account })
    );

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account });

    await assert.rejects(
      outcomeToken.write.resolveMarket([marketId, 1], { account: other.account })
    );
    await assert.rejects(
      outcomeToken.write.resolveMarket([marketId, 0], { account: loanPositionToken.account })
    );

    await outcomeToken.write.resolveMarket([marketId, 1], { account: loanPositionToken.account });

    const market = await outcomeToken.read.markets([marketId]);

    assert.equal(market[3], 1);
    assert.equal(market[4], 3);

    await assert.rejects(
      outcomeToken.write.resolveMarket([marketId, 2], { account: loanPositionToken.account })
    );
  });

  it("lets holders redeem only winning outcomes after resolution", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "77".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);
    const pairCollateralAmount = usdc(250n);
    const redeemAmount = usdc(100n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.mint([other.account.address, pairCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount], { account: other.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });
    await outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account });
    await outcomeToken.write.mintActivatedPair([marketId], { account: other.account });

    await assert.rejects(
      outcomeToken.write.redeem([marketId, 1, redeemAmount], { account: other.account })
    );

    await outcomeToken.write.resolveMarket([marketId, 1], { account: loanPositionToken.account });

    await assert.rejects(
      outcomeToken.write.redeem([marketId, 2, redeemAmount], { account: other.account })
    );

    await outcomeToken.write.redeem([marketId, 1, redeemAmount], { account: other.account });

    const yesTokenId = await outcomeToken.read.getYesTokenId([marketId]);
    const noTokenId = await outcomeToken.read.getNoTokenId([marketId]);

    assert.equal(await outcomeToken.read.balanceOf([other.account.address, yesTokenId]), pairCollateralAmount - redeemAmount);
    assert.equal(await outcomeToken.read.balanceOf([other.account.address, noTokenId]), pairCollateralAmount);
    assert.equal(await collateralToken.read.balanceOf([other.account.address]), redeemAmount);
  });

  it("lets depositors withdraw unminted pair deposits after resolution", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "99".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);
    const pairCollateralAmount = usdc(250n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.mint([other.account.address, pairCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount], { account: other.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });
    await outcomeToken.write.resolveMarket([marketId, 1], { account: loanPositionToken.account });
    await outcomeToken.write.withdrawPairDeposit([marketId, pairCollateralAmount], { account: other.account });

    assert.equal(await outcomeToken.read.pendingPairCollateral([marketId, other.account.address]), 0n);
    assert.equal(await collateralToken.read.balanceOf([other.account.address]), pairCollateralAmount);
  });

  it("rejects activation before borrower collateral is fully deposited", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower } = await deployOutcomeToken();
    const marketId = "0x" + "33".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, usdc(1000n)]);
    await collateralToken.write.approve([outcomeToken.address, usdc(1000n)], { account: borrower.account });
    await outcomeToken.write.depositBorrowerCollateral([marketId, usdc(1000n)], { account: borrower.account });

    await assert.rejects(
      outcomeToken.write.activateMarket([marketId], { account: loanPositionToken.account })
    );
  });

  it("rejects borrower collateral deposits above the required amount", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower } = await deployOutcomeToken();
    const marketId = "0xaa" + "00".repeat(31) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount + 1n]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount + 1n], { account: borrower.account });
    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });

    await assert.rejects(
      outcomeToken.write.depositBorrowerCollateral([marketId, 1n], { account: borrower.account })
    );
  });

  it("cancels a proto market and refunds borrower and pair collateral", async function () {
    const { collateralToken, outcomeToken, loanPositionToken, borrower, other } = await deployOutcomeToken();
    const marketId = "0x" + "44".repeat(32) as `0x${string}`;
    const borrowerCollateralAmount = usdc(1050n);
    const pairCollateralAmount = usdc(250n);

    await outcomeToken.write.createProtoMarket([
      1n,
      borrower.account.address,
      borrowerCollateralAmount,
      marketId
    ], { account: loanPositionToken.account });

    await collateralToken.write.mint([borrower.account.address, borrowerCollateralAmount]);
    await collateralToken.write.mint([other.account.address, pairCollateralAmount]);
    await collateralToken.write.approve([outcomeToken.address, borrowerCollateralAmount], { account: borrower.account });
    await collateralToken.write.approve([outcomeToken.address, pairCollateralAmount], { account: other.account });

    await outcomeToken.write.depositBorrowerCollateral([marketId, borrowerCollateralAmount], { account: borrower.account });
    await outcomeToken.write.depositPairCollateral([marketId, pairCollateralAmount], { account: other.account });

    await assert.rejects(
      outcomeToken.write.cancelMarket([marketId], { account: other.account })
    );

    await outcomeToken.write.cancelMarket([marketId], { account: loanPositionToken.account });
    await outcomeToken.write.refundBorrowerCollateral([marketId], { account: borrower.account });
    await outcomeToken.write.refundPairCollateral([marketId], { account: other.account });

    const market = await outcomeToken.read.markets([marketId]);

    assert.equal(market[4], 2);
    assert.equal(await outcomeToken.read.borrowerCollateralDeposited([marketId]), 0n);
    assert.equal(await outcomeToken.read.pendingPairCollateral([marketId, other.account.address]), 0n);
    assert.equal(await collateralToken.read.balanceOf([borrower.account.address]), borrowerCollateralAmount);
    assert.equal(await collateralToken.read.balanceOf([other.account.address]), pairCollateralAmount);
    assert.equal(await collateralToken.read.balanceOf([outcomeToken.address]), 0n);

    await assert.rejects(
      outcomeToken.write.refundBorrowerCollateral([marketId], { account: borrower.account })
    );
    await assert.rejects(
      outcomeToken.write.refundPairCollateral([marketId], { account: other.account })
    );
  });
});
