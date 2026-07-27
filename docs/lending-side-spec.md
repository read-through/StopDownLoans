# Lending Side MVP Specification

## Scope

This document describes the current lending-side MVP implemented by `LoanPositionToken`.

The lending side is integrated with the prediction-market outcome layer through `OutcomeToken`, but the accounting responsibilities remain separated:

- `LoanPositionToken` owns loan state, lender positions, repayment accounting, default recovery accounting, and platform fee accounting.
- `OutcomeToken` owns market state, YES/NO ERC-1155 balances, collateral custody, activation, resolution, merge, cancellation refunds, and winning-outcome redemption.

`LoanPositionToken` currently handles:

- loan creation;
- funding;
- pre-activation funding withdrawal;
- activation through the linked outcome market;
- repayment/recovery deposits;
- repaid/defaulted settlement;
- NO collateral redemption into lender recovery after default;
- lender payout claims;
- protocol fee claims;
- transferable ERC-1155 lender positions;
- lender position splits;
- owner administration.

## Contract Boundary

For MVP, lending side is one ERC-1155 contract: `LoanPositionToken`.

The contract stores all loan state and all lender-position payout accounting in one place. This avoids extra permission wiring between a loan core contract and a separate position token contract.

The payment asset is an ERC-20-like USDC token passed into the constructor.

`LoanPositionToken` can also receive ERC-1155 outcome tokens. This is required because `OutcomeToken` mints the loan-linked NO shares to `LoanPositionToken` during market activation.

## Loan Identity

Each loan has a numeric `loanId`.

The contract also exposes a deterministic market id:

```solidity
getMarketId(loanId) = keccak256(abi.encode(address(this), loanId))
```

`marketId` is not stored in loan storage. It is derived from the lending contract address and `loanId`.

`LoanCreated` emits the computed `marketId` for indexers.

`LoanCreated` also emits the main immutable loan parameters:

- `principal`;
- `repaymentAmount`;
- `interestBps`;
- `loanWithdrawFreezeDeadline`;
- `activationDeadline`;
- `repaymentDeadline`;
- `repaymentSatisfiedAt`;
- snapshotted collateral setting.

`getLoanView(loanId)` exposes the same loan-facing data as a single read model:

- core loan terms and lifecycle accounting;
- loan state;
- snapshotted interest, fee, fee recipient, and collateral settings;
- required borrower collateral amount;
- deterministic `marketId`.

For MVP, the intended relationship is:

- one loan;
- one prediction market;
- one YES outcome;
- one NO outcome.

## Loan Creation

The borrower creates the loan directly.

`createLoan(...)` sets:

- `borrower = msg.sender`;
- `principal`;
- `repaymentAmount = principal + principal * interestBps / 10_000`;
- `loanWithdrawFreezeDeadline`;
- `activationDeadline`;
- `repaymentDeadline`;
- current platform fee settings snapshot;
- current platform collateral settings snapshot;
- initial state `Funding`.

Deadline constraints:

- `loanWithdrawFreezeDeadline > block.timestamp`;
- `activationDeadline > block.timestamp`;
- `loanWithdrawFreezeDeadline <= activationDeadline`;
- `repaymentDeadline > activationDeadline`.

`interestBps`, fee settings, and collateral settings are stored as per-loan snapshots outside the core `Loan` struct:

- `loanInterestBps[loanId]`;
- `loanFeeBps[loanId]`;
- `loanFeeRecipient[loanId]`;
- `loanCollateralBps[loanId]`.

This keeps `Loan` focused on lifecycle and payout accounting while preserving immutable per-loan policy snapshots.

`outcomeToken` must be configured before loan creation. This prevents loans from being created without a linked proto-market.

For MVP, `outcomeToken` is set-once:

- owner can configure it while it is still unset;
- after it is configured, it cannot be changed.

This prevents existing loans from being redirected to a different outcome contract after their proto-markets and collateral accounting have been created.

`createLoan(...)` also calls:

```solidity
outcomeToken.createProtoMarket(loanId, borrower, borrowerCollateralAmount, marketId)
```

If `outcomeToken` is not configured, loan creation reverts.

## Loan States

The loan state machine is:

- `Funding`: lenders can fund, and lenders can withdraw their funding before `loanWithdrawFreezeDeadline`.
- `Funded`: principal is fully collected, but activation has not happened yet.
- `Active`: principal was sent to borrower.
- `Cancelled`: funding/funded loan expired without activation.
- `Repaid`: enough credited USDC was present before or at `repaymentDeadline`.
- `Defaulted`: enough credited USDC was not present after `repaymentDeadline`.

## Funding

Lenders call:

```solidity
fund(loanId, amount)
```

Funding is allowed only while the loan is in `Funding` and before `activationDeadline`.

If `amount` exceeds remaining principal, only the remaining principal is accepted.

Each accepted funding contribution creates a unique ERC-1155 lender position:

- `positionId`;
- `loanId`;
- `principalAmount`;
- `claimedAmount = 0`;
- ERC-1155 supply `1`.

When `fundedAmount == principal`, the loan moves to `Funded`.

## Funding Withdrawal

Before `loanWithdrawFreezeDeadline`, a lender can call `claim(positionId)` while the loan is `Funding` or `Funded`.

In this case, claim means funding withdrawal:

- the position owner receives the unclaimed principal back;
- `loan.fundedAmount` decreases;
- if the loan was `Funded`, it returns to `Funding`;
- the ERC-1155 position is burned.

After `loanWithdrawFreezeDeadline`, funding withdrawal is no longer allowed.

## Activation

`activate(loanId)` is allowed only when:

- loan state is `Funded`;
- current time is at or after `loanWithdrawFreezeDeadline`.
- current time is at or before `activationDeadline`.

Current MVP activation:

- calls `outcomeToken.activateMarket(marketId)`;
- transfers principal USDC from the contract to the borrower;
- moves loan state to `Active`.

Outcome activation and principal release happen in one transaction. If either side reverts, the whole activation reverts.

## Cancellation

Anyone can call:

```solidity
cancelExpiredLoan(loanId)
```

Cancellation is allowed only when:

- loan state is `Funding` or `Funded`;
- current time is after `activationDeadline`.

After cancellation:

- loan state becomes `Cancelled`;
- lender positions can claim principal back and are burned;
- linked proto-market is cancelled through `outcomeToken.cancelMarket(marketId)`;
- borrower and pair collateral refunds are handled by `OutcomeToken` cancellation refund functions.
- `BorrowerCollateralRefundPending` is emitted as an indexer/UI hint, not as a separate payout mechanism.

The lending contract is still the source of truth for how much borrower collateral is required, but actual collateral custody belongs to `OutcomeToken`.

## Repayment And Recovery Deposits

Repayment and recovery are source-agnostic.

Anyone can call:

```solidity
depositToLoan(loanId, amount)
```

Deposits are allowed only when loan state is:

- `Active`;
- `Repaid`;
- `Defaulted`.

Each deposit increases `loan.creditedAmount`.

For `Active` loans, `depositToLoan(...)` is accepted only before or at `repaymentDeadline`. When
`creditedAmount` first reaches `repaymentAmount`, the contract stores that timestamp in
`repaymentSatisfiedAt`. This timestamp is the source of truth for whether the borrower repaid on
time; settlement can happen later.

The protocol does not care whether the money came from:

- borrower repayment;
- direct recovery deposit;
- late recovery;
- another helper contract.

Direct ERC-20 transfers to `LoanPositionToken` do not affect loan accounting. Only `depositToLoan(loanId, amount)` credits a loan.

There is one exception controlled by `LoanPositionToken` itself: after default, `redeemDefaultCollateral(loanId)` can redeem NO outcome shares held by `LoanPositionToken` and credit the received USDC to the same `creditedAmount` recovery pool.

## Repaid Settlement

Anyone can call:

```solidity
settleRepaid(loanId)
```

Settlement to `Repaid` is allowed only when:

- loan state is `Active`;
- `repaymentSatisfiedAt` is set;
- `repaymentSatisfiedAt <= repaymentDeadline`.

This means the repayment money must arrive on time, but the `settleRepaid(...)` transaction itself
does not have to be mined before the repayment deadline. Late repayment after `repaymentDeadline`
does not turn the loan into `Repaid` in MVP.

After successful settlement, `LoanPositionToken` resolves the linked market to YES by calling:

```solidity
outcomeToken.resolveMarket(marketId, YES)
```

YES holders receive their outcome collateral only through `OutcomeToken.redeem(...)`. The lending contract does not refund borrower collateral directly in the repaid path.

## Default Settlement

Anyone can call:

```solidity
markDefaulted(loanId)
```

Default is allowed only when:

- loan state is `Active`;
- current time is after `repaymentDeadline`;
- `repaymentSatisfiedAt` is not set before or at `repaymentDeadline`.

After default, later deposits are treated as recovery and can be claimed by lender positions through the same payout mechanism.

After successful default settlement, `LoanPositionToken` resolves the linked market to NO by calling:

```solidity
outcomeToken.resolveMarket(marketId, NO)
```

Then anyone can call:

```solidity
redeemDefaultCollateral(loanId)
```

This function redeems the NO shares held by `LoanPositionToken`, receives USDC from `OutcomeToken`, and adds the received amount to `loan.creditedAmount`.

## Lender Payout Accounting

Each lender position stores its own accounting:

- `loanId`;
- `principalAmount`;
- `claimedAmount`;
- `split`.

For `Repaid` and `Defaulted` loans:

```text
lenderPayoutPool = creditedAmount - protocolFee
positionEntitlement = lenderPayoutPool * position.principalAmount / loan.fundedAmount
claimable = positionEntitlement - position.claimedAmount
```

Claiming increases `position.claimedAmount`.

The position is not burned when claiming from `Repaid` or `Defaulted`. This preserves future recovery rights if more USDC is deposited later.

`getClaimable(positionId)` exposes the currently claimable amount for the caller.

It intentionally follows the same revert rules as `claim(positionId)`:

- if the caller does not own the position, it reverts;
- if funding withdrawal is no longer allowed, it reverts;
- if the loan is not in a claimable state, it reverts;
- if there is no amount to claim, it reverts.

This keeps frontend/backend read behavior aligned with the actual state-changing claim path.

## Transfers

Lender positions are ERC-1155 tokens and are transferable.

Future unclaimed payout rights follow the token.

The contract does not track previous owners separately. If an owner transfers a position before claiming, the new owner receives the unclaimed payout rights.

## Position Split

The current owner can call:

```solidity
splitPosition(positionId, splitPrincipalAmount)
```

The function:

- requires caller to own `positionId`;
- requires `0 < splitPrincipalAmount < position.principalAmount`;
- creates a new unique ERC-1155 `positionId`;
- mints the new position to `msg.sender`;
- reduces the original position principal;
- splits already claimed amount proportionally.

Formula:

```text
splitClaimedAmount = oldClaimedAmount * splitPrincipalAmount / oldPrincipalAmount
```

This preserves payout accounting when a position is split after partial claims.

## Borrower Collateral Requirement

Borrower collateral amount is determined by the lending contract, not by the borrower.

The platform-level coefficient is:

```solidity
platformCollateralBps
```

Default:

```text
platformCollateralBps = 10_000
```

That means borrower collateral equals 100% of `repaymentAmount`.

For each loan:

```text
borrowerCollateralAmount = repaymentAmount * loanCollateralBps[loanId] / 10_000
```

The collateral coefficient is snapshotted at loan creation:

- `loanCollateralBps[loanId]`.

Later platform collateral changes do not change existing loans.

The required borrower collateral is read through:

```solidity
getBorrowerCollateralAmount(loanId)
```

The outcome contract receives this value at proto-market creation and prevents activation if borrower collateral has not been deposited.

Important accounting model:

- borrower collateral is not a separate payout pool after activation;
- it becomes part of the single market collateral pool inside `OutcomeToken`;
- `borrowerCollateralDeposited[marketId]` in `OutcomeToken` is a technical accounting variable proving that the required borrower collateral was deposited before activation;
- after resolution, borrower-side payout also happens through normal outcome redemption, not through a special borrower refund path.

## Protocol Fee

Protocol fee is charged only on profit, not on recovered principal.

Formula:

```text
profit = max(creditedAmount - fundedAmount, 0)
protocolFee = profit * loanFeeBps[loanId] / 10_000
lenderPayoutPool = creditedAmount - protocolFee
```

Fee settings are snapshotted into each loan at creation:

- `loanFeeBps[loanId]`;
- `loanFeeRecipient[loanId]`.

Later changes to platform-level fee settings do not change existing loans.

`claimPlatformFee(loanId)`:

- can only be called by `owner`;
- is allowed only after `Repaid` or `Defaulted`;
- transfers fee to the loan's snapshotted `loanFeeRecipient[loanId]`;
- tracks already claimed fee with `feeClaimedAmount`.

## Owner Administration

The contract has one owner address.

Owner-only functions:

- `setPlatformFeeBps`;
- `setPlatformFeeRecipient`;
- `setPlatformCollateralBps`;
- `setOutcomeToken`, only while `outcomeToken` is unset;
- `transferOwnership`;
- `claimPlatformFee`.

Ownership transfer is two-step:

1. current owner calls `transferOwnership(newOwner)`;
2. `newOwner` calls `acceptOwnership()`.

This prevents accidentally transferring ownership to an address that cannot accept it.

For production, owner should be a multisig or governance/timelock contract. For MVP, a single owner address is accepted.

## Current Outcome Integration Boundary

The lending contract currently integrates with `OutcomeToken` through:

- proto-market creation during `createLoan(...)`;
- market activation during `activate(...)`;
- market cancellation during `cancelExpiredLoan(...)`;
- YES resolution during `settleRepaid(...)`;
- NO resolution during `markDefaulted(...)`;
- NO redemption into lender recovery through `redeemDefaultCollateral(...)`.

The following items remain outside the lending contract:

- borrower collateral custody;
- pair collateral custody;
- YES/NO token balances;
- user redemption of winning YES/NO;
- merge of equal YES and NO back into collateral;
- unminted pair deposit withdrawal;
- pair collateral minting into YES/NO after market activation;
- off-chain order book and market ranking;
- human-readable market metadata.

## Off-Chain Loan Metadata

Human-readable loan metadata is intentionally not stored in `LoanPositionToken`.

The contract stores and emits only verifiable loan parameters:

- `loanId`;
- borrower address;
- principal;
- repayment amount;
- interest bps;
- deadlines;
- collateral bps;
- linked deterministic `marketId`.

The backend is responsible for loan-facing metadata such as:

- loan title;
- loan description;
- borrower display profile;
- borrower context;
- risk summary;
- repayment context;
- external documents or links.

Suggested backend shape:

```ts
type LoanMetadata = {
  chainId: number;
  loanPositionToken: `0x${string}`;
  loanId: string;

  title: string;
  description: string;
  borrowerDisplayName?: string;
  borrowerProfileUrl?: string;
  riskSummary?: string;
  repaymentContext?: string;

  createdAt: string;
  updatedAt: string;
};
```

On-chain state remains the source of truth for financial terms and lifecycle state. Off-chain loan metadata is only the presentation and context layer.

