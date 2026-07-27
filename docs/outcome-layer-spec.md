# Outcome Layer MVP Specification

## Context

StopDownLoans will use separate contracts for lending positions and prediction market outcomes.

The prediction market order book is off-chain and will be handled by the backend. The on-chain outcome layer only manages outcome share custody, transfers, minting, resolution, and redemption.

The project targets ARC, an EVM-compatible L1. Prototype accounting uses an ERC-20 USDC-style token with 6 decimals.

The old ERC-20 lender-share model was discarded. Lender claims are represented by the separate ERC-1155 `LoanPositionToken` layer.

## Decision

YES and NO outcome shares are represented as ERC-1155 tokens.

One shared `OutcomeToken` contract supports many loan-linked prediction markets. For each market, YES and NO are separate token IDs.

This matches the shape of conditional outcome tokens used by prediction markets such as Polymarket-style systems: many markets, multiple outcomes, one token contract, and off-chain order books that reference token IDs.

The `OutcomeToken` contract is responsible for outcome-token accounting only:

- ERC-1155 balances;
- market accounting fields;
- one shared collateral pool per `marketId`;
- minting YES/NO pairs;
- merging equal YES and NO back into collateral while active;
- resolution state;
- redemption of winning shares.

The `OutcomeToken` contract is not responsible for loan funding, order matching, pricing, governance, or market ranking.

## Market Model

Each loan can have one or more linked binary prediction markets over time. For MVP, the first supported flow is one proto-market linked to one loan.

- YES wins if the borrower repays according to the loan condition.
- NO wins if the borrower defaults according to the loan condition.

For MVP, `LoanPositionToken` remains the source of truth for repayment/default state. The outcome layer does not decide whether the borrower repaid. It only consumes an explicit resolution result from `LoanPositionToken`.

## Market Creation

Markets are created by the lending flow, not manually by arbitrary users.

When a borrower starts a loan request, the protocol should create:

- a loan record in `LoanPositionToken`;
- a linked proto-market in the outcome contract.

The proto-market exists before the loan is funded. It stores the loan link, borrower address, required borrower collateral amount, and future YES/NO token IDs.

The proto-market does not mint ERC-1155 outcome balances before the loan is funded.

Borrower collateral is stored in the shared `OutcomeToken` contract and accounted by `marketId`.

`borrowerCollateralDeposited[marketId]` is not a separate payout pool. It is a technical variable proving that the borrower deposited the required collateral before activation.

## Market States

For MVP, markets have these states:

- `Proto`: market exists, collateral can be deposited, token IDs are known, ERC-1155 balances are not minted yet.
- `Active`: loan has been funded, initial outcome shares have been minted, market can be traded.
- `Cancelled`: loan was not activated and proto collateral can be refunded to original depositors.
- `Resolved`: outcome has been finalized and winning shares can redeem collateral.

If the loan is not funded by its deadline, the proto-market is cancelled through the loan flow.
Locked borrower and pair collateral then becomes refundable through the explicit cancellation refund
functions.

## Token IDs

Each market has two token IDs:

- `yesTokenId`
- `noTokenId`

Token IDs are derived from `marketId` and outcome.

`marketId` is a business-level market identifier created by the protocol. It is not itself an ERC-1155 token ID.

`yesTokenId` and `noTokenId` are technical ERC-1155 token IDs:

- `yesTokenId = hash(marketId, YES)`
- `noTokenId = hash(marketId, NO)`

This avoids mixing market identifiers with ERC-1155 token identifiers and leaves room for multiple markets per loan.

The backend must map:

- loan address
- market ID
- YES token ID
- NO token ID

`getMarketView(marketId)` exposes the market-facing on-chain read model:

- linked `loanId`;
- borrower address;
- required borrower collateral amount;
- deposited borrower collateral amount;
- winning outcome;
- market state;
- deterministic YES token ID;
- deterministic NO token ID.

## Minting

For MVP, minting creates balanced YES/NO pairs only after the loan is funded and the market is active.

Before funding:

- the proto-market exists;
- borrower collateral can be locked;
- other pair collateral can be locked;
- future token IDs are known;
- no ERC-1155 outcome balances exist.

After funding, the lending flow activates the linked proto-market.

Activation mints the initial borrower-linked outcome shares:

- YES to borrower;
- NO to `LoanPositionToken`.

The amount is the required borrower collateral amount supplied by `LoanPositionToken` at proto-market creation.

After activation, users who deposited pair collateral during the proto phase can mint their activated YES/NO pair.

Pair collateral deposit and pair minting are intentionally separate actions.

`depositPairCollateral(marketId, amount)`:

- is allowed in `Proto` and `Active`;
- transfers USDC into `OutcomeToken`;
- increases the user's deposited pair collateral accounting;
- does not mint YES/NO by itself.

`mintActivatedPair(marketId)`:

- is allowed only in `Active`;
- compares the user's total deposited pair collateral with the amount already minted;
- mints only the not-yet-minted amount as equal YES/NO.

`getPairMintable(marketId, account)` returns the not-yet-minted part of an account's pair deposit:

```text
pendingPairCollateral[marketId][account] - pairCollateralMinted[marketId][account]
```

It follows the same active-market rule as `mintActivatedPair(...)` and reverts if the market is not `Active`.

`withdrawPairDeposit(marketId, amount)`:

- is allowed in `Proto`, `Active`, and `Resolved`;
- withdraws only the not-yet-minted part of the user's pair collateral deposit;
- does not burn YES/NO;
- is not limited by the loan withdrawal freeze deadline in the MVP.

`getUnmintedPairDeposit(marketId, account)` exposes the amount that can be withdrawn through `withdrawPairDeposit(...)`:

```text
pendingPairCollateral[marketId][account] - pairCollateralMinted[marketId][account]
```

It follows the same market-state rule as `withdrawPairDeposit(...)`.

Already minted YES/NO pairs are withdrawn through `mergePositions(marketId, amount)`, which burns equal YES and NO and returns collateral.

A user deposits USDC and later receives equal amounts of YES and NO outcome shares for a market.

Example:

- user deposits 100 USDC
- user receives 100 YES shares
- user receives 100 NO shares

This is the standard fully collateralized binary outcome model: one YES plus one NO is backed by one unit of collateral.

While the market is active, a holder can merge equal amounts of YES and NO back into collateral. After resolution, only the winning outcome can redeem collateral.

## Collateral Pool

Each market has one economic collateral pool held by `OutcomeToken`.

The contract tracks two proto-phase deposit categories:

- borrower collateral;
- pair collateral from other users.

These categories matter before activation because cancellation refunds must return funds to the original depositors.

After activation, borrower collateral and pair collateral are both part of the same market collateral pool. There is no special borrower payout pool.

Post-resolution payouts use one mechanism:

```solidity
redeem(marketId, winningOutcome, amount)
```

This burns winning outcome tokens and transfers the same amount of collateral to the redeemer.

## Borrower Collateral Flow

The borrower-side collateral flow is:

- borrower deposits collateral;
- collateral is locked in the shared `OutcomeToken` contract while the loan is trying to get funded;
- borrower collateral deposits cannot exceed the required borrower collateral amount;
- borrower receives transferable YES shares only after the loan is funded and the proto-market is activated;
- `LoanPositionToken` receives NO shares during activation;
- if the loan is not funded, cancellation makes borrower and pair collateral refundable through explicit refund functions;
- if default happens, `LoanPositionToken` redeems its NO shares and credits the received collateral into lender recovery.

Collateral belongs to the market as backing collateral while the market is active. The borrower remains relevant as:

- the original proto-phase collateral depositor;
- the cancellation refund recipient if the loan is not activated;
- the initial YES recipient after activation.

For MVP, NO shares from borrower collateral are controlled by the lending/recovery side during market activation.

This intentionally removes active NO management from the prototype. A future version can introduce a separate fund, treasury, or strategy contract to manage NO exposure.

## Transfers

Outcome shares are transferable ERC-1155 tokens.

The backend order book can track orders and settlement intent off-chain, but actual balances are on-chain.

## Resolution

Each market can resolve to exactly one winning outcome:

- YES
- NO

Resolution is explicit and final.

For MVP, only `LoanPositionToken` can resolve a market:

- `settleRepaid(loanId)` resolves the linked market to YES.
- `markDefaulted(loanId)` resolves the linked market to NO.

## Redemption

After resolution, holders of the winning token can redeem for collateral.

The losing token cannot redeem through the current `redeem(...)` function.

For MVP:

- YES winner gets 1 unit of collateral per 1 YES share.
- NO winner gets 1 unit of collateral per 1 NO share.
- winning shares are burned during redemption.
- losing shares remain worthless after resolution.

In the default path, `LoanPositionToken` calls `OutcomeToken.redeem(marketId, NO, amount)` for the NO shares it holds. The received USDC is then added to lender recovery accounting in `LoanPositionToken`.

## Off-Chain Order Book

The backend order book is responsible for:

- collecting signed EIP-712 orders;
- showing market liquidity;
- ranking markets;
- showing original borrower YES-sale data;
- coordinating execution UX.

The outcome contract is not responsible for maintaining an order book.

On-chain order settlement is handled by the separate `OutcomeExchange` contract. The outcome
contract only exposes ERC-1155 balances, transfers, minting, merging, resolution, and redemption.

## Off-Chain Market Metadata

Human-readable market metadata is intentionally not stored in `OutcomeToken`.

The contract stores and emits only verifiable market parameters:

- `marketId`;
- linked `loanId`;
- borrower address;
- required borrower collateral amount;
- market state;
- winning outcome after resolution;
- deterministic YES token ID;
- deterministic NO token ID.

The backend is responsible for market-facing metadata such as:

- market title;
- prediction question;
- YES label;
- NO label;
- resolution rules;
- trader-facing summary;
- search/ranking tags.

Suggested backend shape:

```ts
type MarketMetadata = {
  chainId: number;
  outcomeToken: `0x${string}`;
  loanPositionToken: `0x${string}`;
  loanId: string;
  marketId: `0x${string}`;

  title: string;
  question: string;
  yesLabel: string;
  noLabel: string;
  resolutionRules: string;
  traderSummary?: string;
  tags?: string[];

  createdAt: string;
  updatedAt: string;
};
```

Market metadata should not include live trading data.

Prices, bids, asks, spread, depth, volume, active orders, fills, market-maker quotes, borrower YES sold amount, and borrower current YES balance belong to the orderbook/indexer trading state layer.

## Open Decisions

The following decisions are intentionally not fixed yet:

- whether future versions should introduce a separate NO management fund instead of sending NO directly to `LoanPositionToken`;
- whether future versions should support multiple child markets per loan.
