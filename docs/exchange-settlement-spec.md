# Exchange Settlement MVP Specification

## Scope

`OutcomeExchange` is the MVP on-chain settlement contract for the off-chain outcome-token order book.

The backend stores, ranks, and matches orders off-chain. An authorized backend operator submits matched signed orders to the contract. The operator never becomes a trade counterparty and never receives user assets.

The model follows the relevant part of Polymarket CTF Exchange V2:

- a signed taker order is matched against an array of signed maker orders;
- only an authorized operator can submit a match;
- signatures, limits, order state, and transfers are verified on-chain;
- order-book cancellation is handled by the backend, not by this contract;
- settlement is atomic and non-custodial.

StopDown currently implements only complementary BUY/SELL settlement for an existing outcome token. Polymarket's same-side CTF mint/merge settlement is outside this MVP because StopDown exposes minting and merging through `OutcomeToken`.

## Roles

`OutcomeExchange` has two administrative layers:

- `owner`: managed through OpenZeppelin `Ownable2Step` and allowed to add or remove operators;
- `operator`: allowed to call `matchOrders`.

The initial owner is also the initial operator. A backend executor can be authorized without receiving ownership.

## Order Model

Orders are EIP-712 signed typed data.

```solidity
Order {
    maker;
    outcomeToken;
    marketId;
    outcome;
    side;
    outcomeAmount;
    usdcAmount;
    expiration;
    nonce;
}
```

`outcome` is `Yes` or `No`.

`side` is:

- `Buy`: the signer wants to buy `outcomeAmount` outcome tokens and spend at most the signed limit price;
- `Sell`: the signer wants to sell `outcomeAmount` outcome tokens and receive at least the signed limit price.

The exchange derives the ERC-1155 token ID from:

```text
outcomeToken.getOutcomeTokenId(marketId, outcome)
```

The signed order cannot inject an arbitrary token ID.

## Batch Matching

The operator calls:

```solidity
matchOrders(
    takerOrder,
    takerSignature,
    makerOrders,
    makerSignatures,
    makerFillAmounts
)
```

The arrays must be non-empty and have equal lengths. Every maker order must reference the same:

- outcome-token contract;
- market ID;
- outcome.

Every maker must be on the opposite side of the taker. The referenced market must still be `Active`.

`makerFillAmounts[i]` is always denominated in outcome tokens. The taker's outcome fill is the sum of all maker fill amounts.

## Price Validation

Each maker price must cross the taker's signed limit price:

```text
buyPrice >= sellPrice
```

The contract compares ratios with integer math and without floating-point prices.

Every match executes at the resting maker order's price. Therefore price improvement belongs to the taker:

- taker BUY pays each maker SELL price;
- taker SELL receives each maker BUY price.

The taker's signed `usdcAmount / outcomeAmount` is a price limit, not necessarily the actual USDC amount exchanged.

## Partial Fill Accounting

The contract stores the outcome-token amount consumed from every signed order:

```solidity
filledAmounts[orderHash]
```

Both taker and maker order hashes are updated. An order cannot be consumed above `order.outcomeAmount`.

Maker USDC settlement uses cumulative accounting:

```text
quote(filled) = floor(order.usdcAmount * filled / order.outcomeAmount)

usdcFillAmount = quote(newFilled) - quote(previousFilled)
```

This ensures that splitting one maker order into multiple fills does not accumulate rounding loss. A completely filled maker order settles exactly its signed `usdcAmount`.

## Settlement Flow

Taker BUY against maker SELL:

```text
maker -> taker: ERC-1155 outcome token
taker -> maker: USDC
```

Taker SELL against maker BUY:

```text
taker -> maker: ERC-1155 outcome token
maker -> taker: USDC
```

The operator only calls the transaction. Token holders must approve `OutcomeExchange`:

- outcome-token sellers use ERC-1155 `setApprovalForAll`;
- USDC buyers use ERC-20 `approve`.

If any validation or transfer in the batch fails, the whole transaction reverts, including all prior fills in that batch.

## Events

`OrderFilled` is emitted once for every maker order and once for the aggregate taker fill.

`OrdersMatched` identifies the taker hash, submitting operator, total outcome amount, and total USDC amount for the batch.

The backend keeps full signed order data keyed by `orderHash`.

## Current Limitations

The MVP intentionally does not include:

- exchange trading fees;
- same-side BUY/BUY mint matching;
- same-side SELL/SELL merge matching;
- maker nonce invalidation ranges;
- on-chain order cancellation;
- ERC-1271 contract-wallet signatures;
- order preapproval;
- arbitrary ERC-1155 token IDs.

The backend remains responsible for order discovery, price-time priority, reservation accounting, and transaction submission.
