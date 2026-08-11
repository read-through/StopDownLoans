# CLOB And Matching MVP Specification

## Scope

The CLOB is the off-chain trading layer for StopDown outcome tokens.

It is centralized for MVP:

- users sign EIP-712 orders client-side;
- backend validates, stores, matches, and publishes the order book;
- backend executor submits matched fills to `OutcomeExchange`;
- on-chain settlement remains non-custodial and atomic.

This is intentionally close to the Polymarket-style model: fast centralized matching with signed orders and on-chain settlement.

## Contract Boundary

`OutcomeExchange` is the on-chain settlement primitive.

The CLOB backend does not replace contract checks. At settlement time, `OutcomeExchange` still verifies:

- order signature;
- order expiration;
- partial fill limit;
- market is `Active`;
- proportional USDC amount is non-zero;
- ERC-20/ERC-1155 transfers succeed.

The backend is responsible for everything that is not practical to do on-chain in MVP:

- order intake;
- order validation before admission;
- price-time priority;
- matching;
- reservation accounting;
- market data;
- transaction submission;
- retry/failure handling.

## Order Identity

Each order is identified by the same `orderHash` used by `OutcomeExchange`.

This `orderHash` is the contract struct hash returned by `OutcomeExchange.hashOrder(order)`.
It is not the final EIP-712 signing digest. The signing digest wraps this struct hash with the
EIP-712 domain, but backend storage, `filledAmounts[orderHash]`, `OrderFilled`, cancellation
messages, and reconciliation all use the contract struct hash.

The backend stores the contract order as the canonical order payload:

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

The CLOB must not require extra business fields to reconstruct settlement calldata.
Frontend-facing fields such as display price, token ID, loan metadata, borrower display data,
or market title are derived views and are not part of the signed order payload.

Around the signed contract order, the backend stores service fields:

- full signed order;
- signature;
- order hash;
- time-in-force;
- remaining outcome amount;
- pending matched outcome amount;
- status;
- created-at timestamp;
- updated-at timestamp;
- accepted sequence number for price-time priority.

The backend must be able to reconstruct the exact calldata for:

```solidity
OutcomeExchange.matchOrders(
    takerOrder,
    takerSignature,
    makerOrders,
    makerSignatures,
    makerFillAmounts
)
```

## Order Side

Orders are expressed over one outcome token:

- YES/USDC;
- NO/USDC.

`side = Buy` means maker wants to buy outcome tokens and pay USDC.

`side = Sell` means maker wants to sell outcome tokens and receive USDC.

There is no direct YES/NO pair trading in the MVP.

## Order Type

All MVP CLOB orders are limit orders.

A marketable order is still represented as a limit order whose price crosses the current book:

- marketable buy: signed buy limit price is greater than or equal to the best ask;
- marketable sell: signed sell limit price is less than or equal to the best bid.

`timeInForce` is a backend/frontend service field, not part of the signed on-chain order.

MVP supports:

- `GTC`: good-till-cancelled. The backend matches immediately if possible, and any unfilled
  remainder rests on the book until filled, cancelled, expired, or market closure.
- `FAK`: fill-and-kill. The backend matches immediately as much as possible, and any unfilled
  remainder is cancelled without resting on the book.

MVP does not support `FOK`. If full immediate execution is needed later, it can be added as a
backend matching policy without changing the on-chain settlement order.

## Price Model

The on-chain order stores:

```text
outcomeAmount
usdcAmount
```

Backend derives display price:

```text
price = usdcAmount / outcomeAmount
```

`price` may exist as a frontend/API/view field for readability, sorting, and display.
It is not part of the signed on-chain order. The signed source of truth remains
`outcomeAmount` and `usdcAmount`.

For order creation, the public backend/API input is:

```text
price_units
outcomeAmount
```

The backend derives the signed `usdcAmount` exactly:

```text
usdcAmount = price_units * outcomeAmount / PRICE_SCALE
```

No rounding is allowed. The backend must reject the order unless:

```text
price_units * outcomeAmount % PRICE_SCALE == 0
```

This makes the relationship between a user's displayed price and the signed contract order
publicly verifiable.

For matching and sorting, backend should use integer/rational comparison instead of floating point math:

```text
priceA < priceB
means
usdcA * outcomeB < usdcB * outcomeA
```

The backend must not use floating-point numbers for financial logic. API display values may be
formatted as decimals, but stored prices, ticks, and bounds use integer units.

MVP price scale:

```text
PRICE_SCALE = 1_000_000
```

Examples:

```text
0.01  -> 10_000
0.001 -> 1_000
0.10  -> 100_000
0.90  -> 900_000
```

## Tick Size

MVP tick size is a backend validation rule.

Default tick size:

```text
0.01 USDC per outcome token = 10_000 price units
```

Edge tick size:

```text
0.001 USDC per outcome token = 1_000 price units
```

The backend selects tick size from the submitted order's own price bucket.
Initial backend-configurable edge bounds:

```text
lowerEdgePrice = 100_000 price units
upperEdgePrice = 900_000 price units
```

If the submitted order price is less than or equal to `lowerEdgePrice`, or greater than or equal to
`upperEdgePrice`, the order is validated against `1_000` price units. Otherwise, it is validated
against `10_000` price units.

The edge bounds are backend configuration, not on-chain state. They may be changed by backend
operators without changing the signed order format or settlement contract.

Tick-size changes apply only to new order admission. Resting orders that were valid when accepted
remain valid after a tick-size change.

For 6-decimal USDC accounting, backend should represent price in integer units:

```text
priceBpsLike = usdcAmount * 1_000_000 / outcomeAmount
```

The backend must reject new orders whose price does not align with the tick size for the order's
own price bucket:

```text
price_units % tick_units == 0
```

## Order Admission

The MVP uses strict admission validation. The order book should contain executable limit orders,
not inactive trading intentions.

When a user submits an order, backend validates before adding it to the book:

- EIP-712 signature matches `order.maker`;
- market exists;
- market is `Active`;
- outcome is YES or NO;
- expiration has not passed;
- outcomeAmount and usdcAmount are non-zero;
- price follows tick-size rules;
- the same order hash is not already present;
- the same order hash is not cancelled in backend state;
- maker has sufficient available balance;
- maker has required allowance for `OutcomeExchange`.

Required balance depends on side:

- Buy order reserves USDC.
- Sell order reserves the outcome token.

If any admission check fails, the backend rejects the order instead of storing it as inactive.

## Reservation Accounting

Backend keeps off-chain reservations to prevent one account from placing many open orders against the same balance.

Available balance:

```text
available = onChainBalance - reservedOpenAmount
```

For buy orders:

```text
reservedUSDC = floor(order.usdcAmount * remainingOutcomeAmount / order.outcomeAmount)
```

For sell orders:

```text
reservedOutcome = remainingOutcomeAmount
```

BUY reservations use the signed limit price, not the expected execution price.
If a BUY order later executes at a better resting maker price, the unused reserve is released
after the fill is confirmed by backend accounting.

Reservation is reduced when:

- order is filled;
- order is cancelled;
- order expires;
- order fails permanently.

The contract does not enforce backend reservations. It only enforces actual balance and allowance during settlement.

If on-chain balance or allowance falls below an existing reservation, backend cancels complete
available remainders newest-first by descending `acceptedSequence` until the remaining reservation
is covered again. This preserves older price-time priority. Pending matched amounts are never
released by this process; any deficit consisting only of pending amounts remains visible until the
corresponding settlement reaches a terminal state.

The reconciliation update locks the reservation row first, then its candidate LIVE orders, and
applies order cancellations plus reservation releases in one PostgreSQL transaction. The on-chain
balance or allowance remains an external snapshot; settlement preflight is still the final guard
if that snapshot changes again after reconciliation.

## Book Data Model

The MVP book is keyed by outcome-token market:

```text
bookKey = (outcomeToken, marketId, outcome)
```

Each book has two sides:

```text
bids: price levels for BUY orders
asks: price levels for SELL orders
```

Each price level stores:

```text
price
totalRemainingOutcomeAmount
FIFO queue of orderHash values
```

The full signed order, signature, remaining amount, pending amount, reservation state, status, and
timestamps are stored by `orderHash`.

Sorting:

- bids: highest price first;
- asks: lowest price first;
- within one price level: lower `acceptedSequence` first.

The public L2 order book is derived from price levels:

```text
bids = [{ price, totalRemainingOutcomeAmount }]
asks = [{ price, totalRemainingOutcomeAmount }]
```

The frontend does not need to see every individual order to render the market book.

## Persistence Model

PostgreSQL is the source of truth for MVP CLOB backend state.

The backend persists:

- accepted orders;
- signatures;
- terminal order statuses;
- remaining amounts;
- reservations;
- trades and settlement attempts;
- cancellation state;
- accepted sequence numbers.

The matching engine may keep in-memory book indexes for fast matching:

```text
bookKey -> bids/asks -> price levels -> FIFO orderHash queues
```

In-memory indexes are rebuildable. After restart, backend reconstructs them from PostgreSQL by
loading orders with available or pending remaining amounts.

## PostgreSQL Orders Table

`orders` stores the signed contract order as typed columns.

```sql
CREATE TABLE orders (
    order_hash BYTEA PRIMARY KEY,
    maker BYTEA NOT NULL,
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    outcome SMALLINT NOT NULL,
    side SMALLINT NOT NULL,
    outcome_amount NUMERIC(78, 0) NOT NULL,
    usdc_amount NUMERIC(78, 0) NOT NULL,
    expiration TIMESTAMPTZ NOT NULL,
    nonce NUMERIC(78, 0) NOT NULL,
    signature BYTEA NOT NULL,
    time_in_force TEXT NOT NULL,
    remaining_outcome_amount NUMERIC(78, 0) NOT NULL,
    pending_matched_outcome_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    accepted_sequence BIGSERIAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Required constraints:

```sql
CHECK (outcome IN (0, 1));
CHECK (side IN (0, 1));
CHECK (outcome_amount > 0);
CHECK (usdc_amount > 0);
CHECK (remaining_outcome_amount >= 0);
CHECK (remaining_outcome_amount <= outcome_amount);
CHECK (pending_matched_outcome_amount >= 0);
CHECK (pending_matched_outcome_amount <= remaining_outcome_amount);
CHECK (time_in_force IN ('GTC', 'FAK'));
CHECK (status IN ('LIVE', 'FILLED', 'CANCELLED', 'EXPIRED', 'FAILED'));
```

Required indexes:

```sql
CREATE INDEX orders_book_live_idx
    ON orders (outcome_token, market_id, outcome, side, status, accepted_sequence);

CREATE INDEX orders_maker_status_idx
    ON orders (maker, status);

CREATE INDEX orders_expiration_idx
    ON orders (expiration)
    WHERE status = 'LIVE';
```

The backend stores addresses, hashes, and signatures as raw bytes. API layers can encode them as
hex strings.

`pending_matched_outcome_amount` tracks the portion of `remaining_outcome_amount` that has already
been assigned to a trade but is not confirmed on-chain yet.

```text
available_for_matching = remaining_outcome_amount - pending_matched_outcome_amount
```

Only `available_for_matching` may be used for new matches.

Partial fill is a derived state, not a stored status:

```text
confirmed_filled = outcome_amount - remaining_outcome_amount
is_partially_filled = confirmed_filled > 0 AND remaining_outcome_amount > 0
```

Rejected orders are not stored in `orders`. If admission validation fails, the API returns an error
and no reservation is created.

## PostgreSQL Processed Chain Events Table

`processed_chain_events` makes chain event handling idempotent across executor receipt processing
and indexer reconciliation.

```sql
CREATE TABLE processed_chain_events (
    tx_hash BYTEA NOT NULL,
    log_index INTEGER NOT NULL,
    block_number BIGINT NOT NULL,
    event_name TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_hash, log_index)
);
```

Required constraints:

```sql
CHECK (block_number >= 0);
CHECK (log_index >= 0);
CHECK (event_name IN ('OrderFilled', 'OrdersMatched'));
```

Required indexes:

```sql
CREATE INDEX processed_chain_events_block_idx
    ON processed_chain_events (block_number);
```

## PostgreSQL Backend Cursors Table

`backend_cursors` stores durable progress for background workers.

```sql
CREATE TABLE backend_cursors (
    cursor_name TEXT PRIMARY KEY,
    block_number BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Required constraints:

```sql
CHECK (block_number >= 0);
```

MVP cursor names:

```text
outcome_exchange_events
```

## API Authentication Model

The MVP CLOB is sessionless.

There are no JWT sessions or API keys in the first backend version.

Public read endpoints do not require authentication. The order book is not treated as private data
in MVP.

Order submission is authenticated by the signed EIP-712 order itself:

```text
submitOrder(order, orderSignature, timeInForce)
```

The backend accepts the request only if `orderSignature` recovers `order.maker`.

Order cancellation is authenticated by a separate EIP-712 cancel message:

```text
CancelOrder {
    maker;
    orderHash;
    expiration;
    nonce;
}
```

The backend accepts cancellation only if the cancel signature recovers `maker`, the order belongs to
`maker`, and the cancel message has not expired or been replayed.

Spam protection is not part of auth in MVP. It can be handled later through rate limits, allowlists,
or economic fees.

## ARC and Circle Integration Boundary

The MVP CLOB backend is wallet-agnostic.

For order submission and cancellation, the backend only requires:

- maker address;
- valid EIP-712 order or cancel signature;
- on-chain balance;
- on-chain allowance or ERC-1155 operator approval.

The backend does not require makers to use a specific wallet provider.

Key custody policy:

- the CLOB backend never stores user private keys;
- the CLOB backend never stores market-maker private keys;
- users and market makers authorize trades through EIP-712 signatures;
- funds remain in user-controlled wallets until on-chain settlement;
- backend reservations are accounting constraints, not custody;
- the backend may store or access protocol service keys only.

Protocol service keys are not user keys.

MVP protocol service keys:

- executor/operator key: submits `matchOrders` transactions and pays ARC gas;
- admin/owner key: controls protocol configuration and ownership-gated contract functions.

The executor/operator key cannot create valid user orders by itself. It can only submit settlement
for orders that already carry valid user or market-maker EIP-712 signatures.

Recommended retail wallet provider:

```text
Circle User-Controlled Wallet
```

Circle User-Controlled Wallets are recommended for borrower, lender, and retail trader onboarding.
They provide embedded user wallets where users approve signatures and transactions without exposing
private keys to the StopDownLoans backend. This is the preferred retail UX for MVP, but it is not
required by the CLOB core.

Supported retail alternatives:

- injected wallets such as MetaMask or Rabby;
- WalletConnect-compatible wallets;
- any wallet capable of signing the required EIP-712 order and cancel messages.

Market makers may use any EIP-712-capable signer, including local bot wallets, HSM-backed wallets,
institutional custody, or Circle Wallets if their latency and rate limits are acceptable for that
maker.

Circle User-Controlled Wallets are not the recommended default for high-frequency market makers.
Market makers need low-latency order signing, cancellation, and replacement. For them, the protocol
only standardizes the signed order format, not the custody provider.

Backend executor signer for the first implementation:

```text
local viem wallet
```

The executor wallet does not custody user funds. It only submits matched, signed orders to
`OutcomeExchange`. For MVP, the operational risk of a local hot wallet is accepted for simplicity
and speed.

The executor signer must be isolated behind an adapter so a later implementation can replace the
local signer with Circle Developer-Controlled Wallets, HSM-backed signing, or another custody
provider without changing matching, reservation, or reconciliation logic.

ARC is the settlement chain for MVP. Backend chain integration uses ARC RPC/WSS for:

- order settlement simulation;
- settlement transaction submission;
- receipt tracking;
- `OutcomeExchange` event indexing;
- `confirmationDepth = 1` finality handling.

Arc App Kit / Bridge Kit is an onboarding integration, not a matching dependency. It can be used by
the frontend to help users bridge or access USDC on ARC before funding loans or placing orders.

Future integration note:

- add Arc App Kit / Bridge Kit in the frontend onboarding flow;
- use it before loan funding, repayment, pair collateral deposit, and order placement;
- keep CLOB matching, reservations, and settlement independent from App Kit availability.

## PostgreSQL Market Configs Table

`market_configs` stores backend-level CLOB configuration per outcome market.

```sql
CREATE TABLE market_configs (
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    clob_enabled BOOLEAN NOT NULL DEFAULT true,
    default_tick_units BIGINT NOT NULL,
    edge_tick_units BIGINT NOT NULL,
    lower_edge_price_units BIGINT NOT NULL,
    upper_edge_price_units BIGINT NOT NULL,
    min_order_outcome_amount NUMERIC(78, 0),
    max_order_outcome_amount NUMERIC(78, 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (outcome_token, market_id)
);
```

Required constraints:

```sql
CHECK (default_tick_units > 0);
CHECK (edge_tick_units > 0);
CHECK (lower_edge_price_units >= 0);
CHECK (upper_edge_price_units <= 1000000);
CHECK (lower_edge_price_units < upper_edge_price_units);
CHECK (min_order_outcome_amount IS NULL OR min_order_outcome_amount > 0);
CHECK (max_order_outcome_amount IS NULL OR max_order_outcome_amount > 0);
CHECK (
    min_order_outcome_amount IS NULL
    OR max_order_outcome_amount IS NULL
    OR min_order_outcome_amount <= max_order_outcome_amount
);
```

Initial default values:

```text
default_tick_units = 10_000
edge_tick_units = 1_000
lower_edge_price_units = 100_000
upper_edge_price_units = 900_000
```

For MVP, market config administration is local/backend-side, not a public HTTP write surface.
The current market config is available through the public read API.

The operator can create or update a market config with:

```powershell
npm.cmd run market-config:upsert -- --outcome-token 0x... --market-id 0x... --default-tick-units 10000 --edge-tick-units 1000 --lower-edge-price-units 100000 --upper-edge-price-units 900000
```

Optional flags:

- `--clob-enabled true|false`;
- `--min-order-outcome-amount`;
- `--max-order-outcome-amount`.

To inspect an existing market config:

```powershell
npm.cmd run market-config:get -- --outcome-token 0x... --market-id 0x...
```

To update only tick and price-bound settings for new orders:

```powershell
npm.cmd run market-config:update-ticks -- --outcome-token 0x... --market-id 0x... --default-tick-units 10000 --edge-tick-units 1000 --lower-edge-price-units 100000 --upper-edge-price-units 900000
```

Existing accepted orders remain valid after tick-size updates. The updated settings apply to new
order admission.

To resume accepting new orders for an existing configured market:

```powershell
npm.cmd run market-config:open -- --outcome-token 0x... --market-id 0x...
```

To close a configured market for new CLOB orders:

```powershell
npm.cmd run market-config:close -- --outcome-token 0x... --market-id 0x...
```

`market-config:open` and `market-config:close` are idempotent. If the market is already in the
requested state, the command returns the current config and does not insert a new lifecycle event.

This avoids adding an admin HTTP authentication model before it is needed. A later admin API can
reuse the same `market_configs` repository functions.

Market config write commands insert rows into `market_config_events`. The running backend polls
that outbox and publishes WebSocket market-config events. This keeps CLI administration decoupled
from the WebSocket server process.

All price-like values are stored as integer units with `PRICE_SCALE = 1_000_000`.

## PostgreSQL Reservations Table

`reservations` stores off-chain locked amounts for open and unsettled orders.

It uses a universal asset key so the same table can reserve USDC for BUY orders and ERC-1155
outcome tokens for SELL orders.

```sql
CREATE TABLE reservations (
    maker BYTEA NOT NULL,
    asset_type TEXT NOT NULL,
    asset_address BYTEA NOT NULL,
    token_id NUMERIC(78, 0) NOT NULL,
    reserved_amount NUMERIC(78, 0) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (maker, asset_type, asset_address, token_id)
);
```

Required constraints:

```sql
CHECK (asset_type IN ('ERC20', 'ERC1155'));
CHECK (token_id >= 0);
CHECK (reserved_amount >= 0);
```

Reservation asset rules:

- BUY orders reserve `ERC20` USDC:

```text
asset_type = ERC20
asset_address = usdc
token_id = 0
reserved_amount = reservedUSDC
```

- SELL orders reserve `ERC1155` outcome tokens:

```text
asset_type = ERC1155
asset_address = outcomeToken
token_id = getOutcomeTokenId(marketId, outcome)
reserved_amount = reservedOutcome
```

Reservation updates must happen in the same PostgreSQL transaction as the order or trade update
that caused them.

Every reservation lookup and update must include `asset_type`. `token_id = 0` is only a sentinel
for ERC-20 assets when `asset_type = 'ERC20'`; it must not be interpreted without `asset_type`.

## PostgreSQL Trades Tables

`trades` stores one backend match batch submitted, or intended to be submitted, through
`OutcomeExchange.matchOrders`.

```sql
CREATE TABLE trades (
    trade_id BIGSERIAL PRIMARY KEY,
    taker_order_hash BYTEA NOT NULL REFERENCES orders(order_hash),
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    outcome SMALLINT NOT NULL,
    total_outcome_amount NUMERIC(78, 0) NOT NULL,
    total_usdc_amount NUMERIC(78, 0) NOT NULL,
    status TEXT NOT NULL,
    tx_hash BYTEA,
    submitted_at TIMESTAMPTZ,
    mined_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Required constraints:

```sql
CHECK (outcome IN (0, 1));
CHECK (total_outcome_amount > 0);
CHECK (total_usdc_amount > 0);
CHECK (status IN ('MATCHED', 'EXECUTING', 'SUBMITTED', 'MINED', 'CONFIRMED', 'RETRYING', 'FAILED'));
```

Required indexes:

```sql
CREATE INDEX trades_status_idx
    ON trades (status, created_at);

CREATE INDEX trades_market_idx
    ON trades (outcome_token, market_id, outcome, created_at);

CREATE INDEX trades_tx_hash_idx
    ON trades (tx_hash)
    WHERE tx_hash IS NOT NULL;
```

`trade_fills` stores one maker fill inside a trade batch.

```sql
CREATE TABLE trade_fills (
    trade_fill_id BIGSERIAL PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trades(trade_id),
    taker_order_hash BYTEA NOT NULL REFERENCES orders(order_hash),
    maker_order_hash BYTEA NOT NULL REFERENCES orders(order_hash),
    maker_fill_amount NUMERIC(78, 0) NOT NULL,
    maker_usdc_amount NUMERIC(78, 0) NOT NULL,
    maker_price_numerator NUMERIC(78, 0) NOT NULL,
    maker_price_denominator NUMERIC(78, 0) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Required constraints:

```sql
CHECK (maker_fill_amount > 0);
CHECK (maker_usdc_amount > 0);
CHECK (maker_price_numerator > 0);
CHECK (maker_price_denominator > 0);
```

Required indexes:

```sql
CREATE INDEX trade_fills_trade_idx
    ON trade_fills (trade_id);

CREATE INDEX trade_fills_taker_idx
    ON trade_fills (taker_order_hash);

CREATE INDEX trade_fills_maker_idx
    ON trade_fills (maker_order_hash);
```

`maker_price_numerator / maker_price_denominator` stores the maker order price used for the fill.
The source of truth for settlement is still the signed maker order plus `maker_fill_amount`.

## PostgreSQL Settlement Attempts Table

`settlement_attempts` stores executor transaction attempts for a trade.

```sql
CREATE TABLE settlement_attempts (
    settlement_attempt_id BIGSERIAL PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trades(trade_id),
    operator BYTEA NOT NULL,
    tx_hash BYTEA,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    submitted_at TIMESTAMPTZ,
    mined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Required constraints:

```sql
CHECK (status IN ('CREATED', 'SUBMITTED', 'MINED', 'REVERTED', 'DROPPED', 'FAILED'));
```

Required indexes:

```sql
CREATE INDEX settlement_attempts_trade_idx
    ON settlement_attempts (trade_id, created_at);

CREATE INDEX settlement_attempts_status_idx
    ON settlement_attempts (status, created_at);

CREATE INDEX settlement_attempts_tx_hash_idx
    ON settlement_attempts (tx_hash)
    WHERE tx_hash IS NOT NULL;
```

`trades.status` stores the current high-level trade state. `settlement_attempts` stores the
historical executor attempts that led to that state.

## Matching Rule

The MVP matching engine uses price-time priority.

For each book:

```text
book key = (outcomeToken, marketId, outcome)
```

Buy side:

- highest price first;
- earlier accepted order first at same price.

Sell side:

- lowest price first;
- earlier accepted order first at same price.

An incoming buy order matches resting sell orders while:

```text
buyPrice >= bestAsk
```

An incoming sell order matches resting buy orders while:

```text
sellPrice <= bestBid
```

## Taker And Maker

The incoming marketable order is the taker.

Resting orders are makers.

If an incoming order crosses multiple resting orders, each match becomes a separate fill instruction.

The backend may submit those fill instructions together as one on-chain maker array against the same taker order.

MVP price improvement benefits the taker:

- incoming buy pays resting sell price;
- incoming sell receives resting buy price.

This means each entry in `makerFillAmounts` is priced from its corresponding resting maker order.

## Partial Fills

`fillAmount` is always denominated in outcome tokens.

For each match:

```text
fillAmount = min(incomingRemaining, restingRemaining)
```

After match creation:

- resting order remaining amount decreases;
- incoming order remaining amount decreases;
- backend creates a trade record with status `MATCHED`.

The on-chain contract also tracks partial fill state. Backend state must be reconciled against on-chain `OrderFilled` events.

## Pending Matches And Concurrency

A pending settlement batch must not block the whole book.

While a trade is `MATCHED`, `SUBMITTED`, `MINED`, or `RETRYING`:

- the matched portion of every involved order is counted in `pending_matched_outcome_amount`;
- that pending portion cannot be matched again;
- unrelated orders in the same book can continue matching;
- still-available remainders of involved maker orders can continue matching if they remain `LIVE`;
- cancellation only applies to the non-pending available remainder.

When a trade is confirmed:

```text
remaining_outcome_amount -= confirmedFillAmount
pending_matched_outcome_amount -= confirmedFillAmount
```

When a trade permanently fails:

```text
pending_matched_outcome_amount -= failedFillAmount
```

If the affected order is still `LIVE`, the released amount becomes available for matching again.
If the affected order is already `CANCELLED`, `EXPIRED`, or `FAILED`, the backend releases the
corresponding pending reservation instead, and that amount does not return to the book.

## Submit Order Flow

`submitOrder` receives:

```text
signed contract order
signature
timeInForce: GTC | FAK
```

Backend flow:

1. Compute `orderHash`.
2. Run strict admission validation.
3. Reserve the full incoming order by signed limit.
4. Select the opposite book side for the same `(outcomeToken, marketId, outcome)`.
5. Match against resting price levels while prices cross and the incoming order has available amount.
6. For every matched resting order, create a trade instruction:

```text
takerOrder
takerSignature
makerOrder
makerSignature
makerFillAmount
makerPrice
```

7. Increase `pending_matched_outcome_amount` for the matched portions.
8. If the incoming order has unmatched remainder:
   - `GTC`: store the remainder as a resting order at its limit price;
   - `FAK`: cancel the remainder in backend state and release its reservation.
9. Return the accepted order status and created trade instructions.

The executor may batch one incoming taker order against multiple resting maker orders by calling:

```solidity
OutcomeExchange.matchOrders(
    takerOrder,
    takerSignature,
    makerOrders,
    makerSignatures,
    makerFillAmounts
)
```

The batch should be simulated before submission. If simulation fails because a resting order became
unsettleable, backend removes or refreshes the failed order, releases its reservation as needed, and
rebuilds the match.

## Order Statuses

Order statuses:

- `LIVE`: accepted by the backend and has remaining amount that is not terminal;
- `FILLED`: fully filled and confirmed;
- `CANCELLED`: cancelled by maker;
- `EXPIRED`: expiration passed;
- `FAILED`: settlement failed permanently.

For MVP, statuses are backend states. On-chain source of truth for execution is still:

- `filledAmounts[orderHash]`;
- `OrderFilled` events.

## Trade Statuses

Trade statuses:

- `MATCHED`: backend matched orders and created fill instruction;
- `EXECUTING`: an executor worker has atomically claimed the trade and is preparing/submitting settlement;
- `SUBMITTED`: executor submitted transaction;
- `MINED`: transaction was included in a block;
- `CONFIRMED`: final enough for UI/accounting;
- `RETRYING`: transaction failed or was dropped, backend will retry;
- `FAILED`: not retrying anymore.

## Executor

The executor is a backend worker that submits settlement transactions.

Executable trades are claimed atomically in PostgreSQL:

```text
MATCHED/RETRYING -> EXECUTING
```

The claim query uses `FOR UPDATE SKIP LOCKED`, then updates the selected trades to `EXECUTING`
before the worker performs RPC or wallet calls. This prevents two executor workers from submitting
the same trade concurrently after the selection transaction commits.

If a backend process crashes while a trade is `EXECUTING`, later executor runs can reset stale
`EXECUTING` trades back to `RETRYING` using:

```text
EXECUTOR_EXECUTING_TRADE_TIMEOUT_MS
```

This timeout must be long enough to cover normal wallet/RPC latency for one settlement attempt.

ARC MVP confirmation depth:

```text
confirmationDepth = 1
```

The value is backend configuration. It is `1` for ARC MVP because Arc provides deterministic
finality, but it should remain configurable for other deployments.

Retry policy:

```text
maxSettlementAttempts = 3
backoff = 5s, 15s, 30s
```

Before every submission attempt, the executor simulates the exact `matchOrders` calldata.

Every executor attempt consumes one retry slot, even if no transaction is submitted because
simulation failed.

If simulation fails, the executor does not submit a transaction. It rebuilds the batch from current
order state and records the failed attempt.

If a submitted transaction is dropped, reverted, or cannot be confirmed, the executor retries until
`maxSettlementAttempts` is reached.

`maxSettlementAttempts` is counted per `trade_id` using rows in `settlement_attempts`, not per
single worker invocation. This prevents a trade from receiving a fresh retry budget after each
process restart or submitted-transaction receipt failure.

Retry does not mean blindly resubmitting the same calldata. After a simulation failure or on-chain
revert, backend revalidates affected orders, rebuilds the batch, simulates the rebuilt calldata, and
only then submits again.

Failure classification is intentionally coarse in MVP.

Signal sources:

- simulation revert data;
- transaction receipt status;
- replayed `eth_call` after a reverted transaction;
- backend revalidation of market state, filled amounts, balances, and approvals.

MVP error codes:

```text
STALE_ORDER
MARKET_CLOSED
INSUFFICIENT_BALANCE_OR_ALLOWANCE
ORDER_EXPIRED
ORDER_OVERFILLED
INFRASTRUCTURE_ERROR
UNKNOWN_REVERT
```

Failure handling:

- `STALE_ORDER`, `INSUFFICIENT_BALANCE_OR_ALLOWANCE`, `ORDER_EXPIRED`, `ORDER_OVERFILLED`:
  remove or deactivate affected orders, release or recalculate their available reservations, rebuild
  the batch without them.
- `MARKET_CLOSED`: fail the trade, remove resting orders for that market, stop matching that market.
- `INFRASTRUCTURE_ERROR`, `UNKNOWN_REVERT`: retry with backoff until `maxSettlementAttempts` is reached.

After the final failed attempt:

- `trade.status = FAILED`;
- the latest `settlement_attempts` row records the failure reason;
- pending matched amounts for affected orders are released;
- still-live affected orders can use the released pending amount for future matching;
- non-live affected orders release the corresponding pending reservation and stay out of the book.

## Expired Orders Scheduler

The backend runs an expired-order sweep as a periodic background worker.

MVP interval:

```text
expiredOrderSweepInterval = 5s
```

The interval is backend configuration.

The scheduler finds orders where:

```text
status = LIVE
expiration has passed
available_for_matching > 0
```

For each expired order, the scheduler:

- removes only the available part from in-memory book indexes;
- releases the reservation for only the available part;
- emits the required `book_delta` updates;
- sets the order to `EXPIRED` so no remaining available amount can be matched again.

If an order has `pending_matched_outcome_amount > 0`, expiration does not cancel that already
matched pending portion. The pending portion waits for its settlement attempt to confirm or fail.

If the pending settlement later fails because the order expired on-chain, normal executor failure
handling releases the pending amount. The order then remains expired and does not become matchable
again.

Expiration prevents new matching. It does not retroactively undo a match that the backend already
assigned to a settlement attempt.

## Reconciliation Loop

The MVP uses hybrid reconciliation.

Source of truth for confirmed settlement is still `OutcomeExchange` events. Hybrid means:

- receipt path: backend checks submitted transaction receipts for reverted or dropped transactions;
- recovery path: indexer scans `OutcomeExchange` events by block and applies any events not already
  processed.

Current backend implementation:

- success path is confirmed by the event indexer;
- negative submitted transaction path is handled by the submitted receipt sweep:
  - reverted receipt marks the settlement attempt `REVERTED` and returns the trade to `RETRYING`;
  - missing receipt after `RECEIPT_DROPPED_TIMEOUT_MS` marks the settlement attempt `DROPPED` and
    returns the trade to `RETRYING`.
  - if that negative receipt outcome exhausts the trade-level retry budget, backend runs failed
    trade cleanup instead of leaving the trade retryable.

Before applying a chain event, backend inserts `(tx_hash, log_index)` into
`processed_chain_events`. If the insert conflicts, the event was already applied and must be skipped.

Events handled:

- `OrderFilled`;
- `OrdersMatched`.

When an `OrderFilled` event is applied:

```text
confirmedFillDelta = event.totalFilledAmount - backendPreviouslyConfirmedFilledAmount
```

Then backend updates the related order:

```text
remaining_outcome_amount -= confirmedFillDelta
pending_matched_outcome_amount -= min(pending_matched_outcome_amount, confirmedFillDelta)
```

The backend must not subtract more pending than exists.

When `OrdersMatched` for a known trade is applied and all expected `OrderFilled` deltas for that
trade are applied:

```text
trade.status = CONFIRMED
settlement_attempt.status = MINED
```

For ARC MVP, `confirmationDepth = 1`, so a mined event from a committed block is enough to confirm
the trade.

Indexer cursor:

```text
lastIndexedBlock
```

The indexer scans from `lastIndexedBlock + 1` to the latest finalized block. After all logs in a
block are applied, it advances `lastIndexedBlock`.

If backend restarts, it rebuilds in-memory book indexes from PostgreSQL and resumes scanning from
`lastIndexedBlock + 1`.

For one taker matched against one or more resting orders it calls:

```solidity
OutcomeExchange.matchOrders(
    takerOrder,
    takerSignature,
    makerOrders,
    makerSignatures,
    makerFillAmounts
)
```

Both sides authorize settlement through EIP-712 signatures. The executor address is only the transaction sender and never becomes a trade counterparty.

Only owner-authorized operator addresses can call `matchOrders`. The owner and operator roles are separate so the backend hot key does not need contract ownership.

The contract independently verifies:

- both sides' signatures;
- matching market and outcome;
- opposite sides;
- crossing prices;
- remaining fill capacity;
- market is still `Active`.

## Cancellation Flow

User requests cancellation through backend.

Backend:

- verifies the EIP-712 cancel message;
- verifies the order belongs to the recovered maker;
- removes only the non-pending available remainder from the book;
- releases reservation for the cancelled available remainder;
- marks the `orderHash` as cancelled in backend state;
- prevents the executor from using the cancelled `orderHash` in future `matchOrders` calls.

Cancellation does not cancel portions that are already included in pending settlement trades.

The MVP does not use on-chain order cancellation. This matches the centralized CLOB trust model:
`OutcomeExchange.matchOrders` is operator-only, and the backend/operator is responsible for never
submitting backend-cancelled orders.

If StopDown later moves toward permissionless settlement or multiple untrusted executors,
on-chain invalidation can be reconsidered.

## Market Closure

When market leaves `Active`:

- backend stops accepting new orders;
- backend removes resting orders from the book;
- executor stops submitting fills;
- winning-token redemption path becomes the only post-resolution path.

`OutcomeExchange` also rejects fills unless the market is still `Active`.

## WebSocket Market Feed

The MVP exposes a public WebSocket market feed for live order-book and trade updates.

The feed is unauthenticated in MVP. It only publishes public market data.

Clients subscribe by one or more outcome books:

```text
outcomeToken
marketId
outcome
```

The backend may also expose `tokenId` as a convenience subscription key derived from
`outcomeToken.getOutcomeTokenId(marketId, outcome)`.

Supported event types:

- `book_snapshot`: full L2 book state for one outcome book;
- `book_delta`: changed L2 price levels after order submit, cancel, match, expiry, or market closure;
- `best_bid_ask`: current best bid and ask for one outcome book;
- `trade`: public confirmed or matched trade print;
- `tick_size_change`: market config update for tick/bucket settings;
- `market_opened`: market resumed accepting new orders;
- `market_closed`: market stopped accepting orders.

`book_snapshot` payload:

```json
{
  "type": "book_snapshot",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES",
  "sequence": "1201",
  "bids": [
    { "priceUnits": 640000, "totalRemainingOutcomeAmount": "100000000" }
  ],
  "asks": [
    { "priceUnits": 650000, "totalRemainingOutcomeAmount": "120000000" }
  ],
  "timestamp": "2026-07-21T12:00:00.000Z"
}
```

`book_delta` payload:

```json
{
  "type": "book_delta",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES",
  "sequence": "1202",
  "bids": [
    { "priceUnits": 640000, "totalRemainingOutcomeAmount": "0" }
  ],
  "asks": [
    { "priceUnits": 650000, "totalRemainingOutcomeAmount": "80000000" }
  ],
  "timestamp": "2026-07-21T12:00:01.000Z"
}
```

`book_delta` uses the same side-separated L2 price level shape as `book_snapshot`, but includes
only changed levels. A `totalRemainingOutcomeAmount` of `"0"` means the price level was removed
from that side of the book.

`best_bid_ask` payload:

```json
{
  "type": "best_bid_ask",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES",
  "sequence": "1203",
  "bestBid": {
    "priceUnits": 640000,
    "totalRemainingOutcomeAmount": "100000000"
  },
  "bestAsk": {
    "priceUnits": 650000,
    "totalRemainingOutcomeAmount": "80000000"
  },
  "timestamp": "2026-07-21T12:00:01.000Z"
}
```

If one side is empty, its value is `null`.

`tick_size_change` payload:

```json
{
  "type": "tick_size_change",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "sequence": "1204",
  "defaultTickUnits": "10000",
  "edgeTickUnits": "1000",
  "lowerEdgePriceUnits": "100000",
  "upperEdgePriceUnits": "900000",
  "timestamp": "2026-07-21T12:00:02.000Z"
}
```

`market_closed` payload:

```json
{
  "type": "market_closed",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "sequence": "1205",
  "timestamp": "2026-07-21T12:00:03.000Z"
}
```

`market_opened` has the same payload shape as `market_closed`, with `"type": "market_opened"`.

`trade` payload:

```json
{
  "type": "trade",
  "sequence": "1206",
  "tradeId": "123",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES",
  "totalOutcomeAmount": "40000000",
  "totalUsdcAmount": "26000000",
  "status": "MATCHED",
  "txHash": null,
  "createdAt": "2026-07-21T12:00:01.000Z",
  "confirmedAt": null
}
```

`trade` is an aggregate backend batch. If one taker crosses several maker price levels, the trade
does not expose one canonical execution price. Clients that need per-fill prices should use a later
fills endpoint or derive average display price from `totalUsdcAmount / totalOutcomeAmount`.

Every event includes a monotonically increasing `sequence` per subscribed outcome book. Market-level
events are published into every subscribed outcome book for that market. Clients should request a
fresh `book_snapshot` if they detect a sequence gap.

## Public Read API

All amounts are returned as decimal strings containing integer base units. The API must not return
floating-point numbers for financial values.

### `GET /v1/books/{outcomeToken}/{marketId}/{outcome}`

Returns the current L2 book for one outcome.

Path params:

```json
{
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES"
}
```

Response:

```json
{
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES",
  "sequence": "1042",
  "bids": [
    {
      "priceUnits": 650000,
      "totalRemainingOutcomeAmount": "40000000"
    }
  ],
  "asks": [
    {
      "priceUnits": 660000,
      "totalRemainingOutcomeAmount": "25000000"
    }
  ],
  "timestamp": "2026-07-21T12:00:00.000Z"
}
```

### `GET /v1/books/{outcomeToken}/{marketId}/{outcome}/best`

Returns only the best bid and best ask.

Response:

```json
{
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES",
  "sequence": "1042",
  "bestBid": {
    "priceUnits": 650000,
    "totalRemainingOutcomeAmount": "40000000"
  },
  "bestAsk": {
    "priceUnits": 660000,
    "totalRemainingOutcomeAmount": "25000000"
  },
  "timestamp": "2026-07-21T12:00:00.000Z"
}
```

If one side is empty, its value is `null`.

### `GET /v1/market-configs/{outcomeToken}/{marketId}`

Returns backend CLOB configuration for one outcome market.

Response:

```json
{
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "clobEnabled": true,
  "defaultTickUnits": "10000",
  "edgeTickUnits": "1000",
  "lowerEdgePriceUnits": "100000",
  "upperEdgePriceUnits": "900000",
  "minOrderOutcomeAmount": "1000000",
  "maxOrderOutcomeAmount": null,
  "createdAt": "2026-07-21T12:00:00.000Z",
  "updatedAt": "2026-07-21T12:01:00.000Z"
}
```

If the market has no backend CLOB config, the API returns `MARKET_CONFIG_NOT_FOUND`.

### `GET /v1/orders/{orderHash}`

Returns one order by hash.

Response:

```json
{
  "orderHash": "0x...",
  "order": {
    "maker": "0x...",
    "outcomeToken": "0x...",
    "marketId": "0x...",
    "outcome": "YES",
    "side": "BUY",
    "outcomeAmount": "100000000",
    "usdcAmount": "65000000",
    "expiration": "2026-07-21T13:00:00.000Z",
    "nonce": "12"
  },
  "signature": "0x...",
  "timeInForce": "GTC",
  "priceUnits": 650000,
  "remainingOutcomeAmount": "60000000",
  "pendingMatchedOutcomeAmount": "10000000",
  "availableForMatching": "50000000",
  "status": "LIVE",
  "isPartiallyFilled": true,
  "acceptedSequence": "42",
  "createdAt": "2026-07-21T12:00:00.000Z",
  "updatedAt": "2026-07-21T12:01:00.000Z"
}
```

### `GET /v1/orders`

Returns orders filtered by maker and optional status.

Query params:

```text
maker=0x...
status=LIVE|FILLED|CANCELLED|EXPIRED|FAILED
limit=100
cursor=opaqueCursor
```

Response:

```json
{
  "orders": [],
  "nextCursor": null
}
```

`maker` is required for MVP. This endpoint is public because MVP does not treat open orders as
private data.

`nextCursor` is an opaque backend cursor. Clients must pass it back unchanged and must not parse it.

### `GET /v1/trades`

Returns trades by market and outcome.

Query params:

```text
outcomeToken=0x...
marketId=0x...
outcome=YES|NO
limit=100
cursor=opaqueCursor
```

Response:

```json
{
  "trades": [
    {
      "tradeId": "123",
      "outcomeToken": "0x...",
      "marketId": "0x...",
      "outcome": "YES",
      "totalOutcomeAmount": "40000000",
      "totalUsdcAmount": "26000000",
      "status": "CONFIRMED",
      "txHash": "0x...",
      "createdAt": "2026-07-21T12:00:01.000Z",
      "confirmedAt": "2026-07-21T12:00:02.000Z"
    }
  ],
  "nextCursor": null
}
```

`nextCursor` is an opaque backend cursor. Clients must pass it back unchanged and must not parse it.

### `GET /v1/reservations`

Returns backend reservations by maker.

Query params:

```text
maker=0x...
```

Response:

```json
{
  "maker": "0x...",
  "reservations": [
    {
      "assetType": "ERC20",
      "assetAddress": "0x...",
      "tokenId": "0",
      "reservedAmount": "65000000",
      "updatedAt": "2026-07-21T12:00:00.000Z"
    },
    {
      "assetType": "ERC1155",
      "assetAddress": "0x...",
      "tokenId": "123456",
      "reservedAmount": "100000000",
      "updatedAt": "2026-07-21T12:00:00.000Z"
    }
  ]
}
```

## Signed Write API

Write authorization is request-specific and signature-based. There is no API session.

### `POST /v1/orders`

Submits a signed order. The backend validates, reserves, matches, and either rests or cancels the
unfilled remainder according to `timeInForce`.

Request:

```json
{
  "order": {
    "maker": "0x...",
    "outcomeToken": "0x...",
    "marketId": "0x...",
    "outcome": "YES",
    "side": "BUY",
    "outcomeAmount": "100000000",
    "usdcAmount": "65000000",
    "expiration": "2026-07-21T13:00:00.000Z",
    "nonce": "12"
  },
  "signature": "0x...",
  "timeInForce": "GTC",
  "priceUnits": 650000
}
```

`priceUnits` is not signed and is validated against `outcomeAmount` and `usdcAmount`. It is included
so clients and backend logs can use one explicit price field.

Response:

```json
{
  "orderHash": "0x...",
  "status": "LIVE",
  "remainingOutcomeAmount": "60000000",
  "pendingMatchedOutcomeAmount": "40000000",
  "availableForMatching": "60000000",
  "isPartiallyFilled": false,
  "priceUnits": 650000,
  "createdTradeIds": ["123"],
  "rested": true
}
```

For `FAK`, `rested` is always `false`. Any unfilled remainder is cancelled by backend state and its
reservation is released.

### `POST /v1/orders/{orderHash}/cancel`

Cancels the available remainder of an order through a signed cancel message.

Request:

```json
{
  "cancel": {
    "maker": "0x...",
    "orderHash": "0x...",
    "expiration": "2026-07-21T13:00:00.000Z",
    "nonce": "77"
  },
  "signature": "0x..."
}
```

Response:

```json
{
  "orderHash": "0x...",
  "status": "CANCELLED",
  "cancelledAvailableOutcomeAmount": "60000000",
  "pendingMatchedOutcomeAmount": "40000000"
}
```

Cancellation does not cancel already pending settlement. It only removes and releases the currently
available remainder.

## API Errors

Errors use one common JSON shape:

```json
{
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "Signature does not recover order maker."
  }
}
```

MVP error codes:

- `INVALID_SIGNATURE`;
- `INVALID_ORDER`;
- `INVALID_PRICE_TICK`;
- `ROUNDING_NOT_ALLOWED`;
- `DUPLICATE_ORDER`;
- `ORDER_NOT_FOUND`;
- `MARKET_CONFIG_NOT_FOUND`;
- `ORDER_EXPIRED`;
- `ORDER_NOT_CANCELLABLE`;
- `MARKET_NOT_ACTIVE`;
- `INSUFFICIENT_BALANCE_OR_ALLOWANCE`;
- `INSUFFICIENT_AVAILABLE_BALANCE`;
- `CLOB_DISABLED`;
- `RATE_LIMITED`;
- `INTERNAL_ERROR`.

## Current Backend Implementation Notes

Implemented backend scripts:

```text
npm run db:migrate
npm run db:check
npm run db:up
npm run db:down
npm run smoke:backend
npm run smoke:backend:local
npm run dev:clob
npm run typecheck:backend
npm run test:backend
npm run test:e2e:local
```

`dev:clob` starts:

- HTTP API transport;
- WebSocket feed transport at `/v1/ws`;
- expired-order sweep worker;
- OutcomeExchange reconciliation worker;
- market-config event outbox worker;
- optional executor worker when `EXECUTOR_PRIVATE_KEY` is configured;
- optional lending keeper worker when `EXECUTOR_PRIVATE_KEY` is configured.

Required environment:

```text
DATABASE_URL
ARC_RPC_URL
ARC_CHAIN_ID
OUTCOME_EXCHANGE_ADDRESS
USDC_ADDRESS
```

`db:migrate`, `db:check`, and `smoke:backend` require only `DATABASE_URL`. `dev:clob` requires the
full environment above because it starts ARC readers and, when configured, the settlement executor
and lending keeper.

`smoke:backend` is a runtime check for PostgreSQL-backed HTTP and WebSocket read paths. It inserts
smoke market/order rows through repositories, reads them through the HTTP API, and validates the
initial `book_snapshot` plus `best_bid_ask` WebSocket messages. It intentionally does not submit
orders on-chain.

`smoke:backend:local` is the default Docker Compose convenience check. If `DATABASE_URL` is not set,
it uses `postgres://stopdown:stopdown@localhost:55432/stopdown`, then runs migrations, schema check,
and `smoke:backend` in one process.

`test:e2e:local` uses Hardhat's local EVM. Without `DATABASE_URL`, it verifies contract deployment,
market activation, balances, approvals, EIP-712 signatures, and backend/on-chain order hash parity.
With `DATABASE_URL`, it also starts the HTTP server in-process, submits a maker SELL order through
`POST /v1/orders`, then submits a crossing taker BUY order through the same endpoint. Admission reads
real local EVM balances, allowances, approvals, market state, token IDs, and existing on-chain fill
state. The taker submit must create a `MATCHED` trade and one `trade_fills` row priced from the maker
order. The e2e then executes that trade through the backend executor path, submits
`OutcomeExchange.matchOrders`, waits for the local EVM receipt, and verifies on-chain `filledAmounts`,
YES balances, and USDC balances. It then runs `reconcileOutcomeExchangeEventsOnce` with an isolated
local e2e cursor and verifies confirmed trade state, mined settlement attempt state, processed event
count, and reservation release. The same local e2e suite also includes a WebSocket feed case: it
subscribes to the local book, checks initial `book_snapshot` and `best_bid_ask` messages, observes
book deltas after maker/taker submissions, and observes `MATCHED` then `CONFIRMED` trade messages.

Worker configuration:

```text
EXPIRED_ORDER_SWEEP_INTERVAL_MS
EXPIRED_ORDER_SWEEP_LIMIT
RECONCILIATION_INTERVAL_MS
RECONCILIATION_CONFIRMATION_DEPTH
RECONCILIATION_START_BLOCK
RECONCILIATION_MAX_BLOCKS_PER_RUN
EXECUTOR_PRIVATE_KEY
EXECUTOR_INTERVAL_MS
EXECUTOR_BATCH_LIMIT
EXECUTOR_EXECUTING_TRADE_TIMEOUT_MS
LENDING_KEEPER_INTERVAL_MS
LENDING_KEEPER_SCAN_LIMIT
RECEIPT_SWEEP_INTERVAL_MS
RECEIPT_SWEEP_LIMIT
RECEIPT_DROPPED_TIMEOUT_MS
MARKET_CONFIG_EVENT_SWEEP_INTERVAL_MS
MARKET_CONFIG_EVENT_SWEEP_LIMIT
```

`EXECUTOR_PRIVATE_KEY` is optional. If it is empty, the backend still serves the API and runs
read/reconciliation workers, but it does not submit `OutcomeExchange.matchOrders` transactions or
lending lifecycle transactions. The lending keeper scans newest loans first and calls the
permissionless loan lifecycle functions only after the on-chain preconditions are already true:
`activate`, `settleRepaid`, `cancelExpiredLoan`, `markDefaulted`, and `redeemDefaultCollateral`.

The current WebSocket MVP supports subscription messages:

```json
{
  "type": "subscribe",
  "outcomeToken": "0x...",
  "marketId": "0x...",
  "outcome": "YES"
}
```

The server responds to subscription with a `book_snapshot` and `best_bid_ask`. After backend book
mutations it publishes `book_delta` messages when a previous snapshot exists for that subscribed
book; otherwise it falls back to a fresh `book_snapshot`. Each book state update is followed by
`best_bid_ask`. It also publishes `trade` messages when matched or confirmed trades are created for
the subscribed book.

Known backend implementation limitations before a public demo:

- HTTP endpoints are implemented on Node's built-in `http` transport, not a full framework.
- WebSocket sends snapshots on subscription, L2 deltas and best bid/ask after backend mutation
  points, plus `trade` and market-config outbox events.
- Executor workers can avoid concurrent duplicate submission through atomic DB claiming. Stale
  `EXECUTING` recovery is time-based and should be tuned for the deployment's wallet/RPC latency.
