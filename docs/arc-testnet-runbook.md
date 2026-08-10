# ARC Testnet Runbook

> **Historical addresses below are not compatible with the current principal-based collateral
> build. Do not start the backend with them.** Redeploy first, then replace every address and add the
> three runtime bytecode hashes printed by `npm.cmd run deploy:arc-testnet`.

This runbook is for running the MVP against the deployed ARC testnet contracts without frontend/backend mocks.

Wallet behavior is specified in `docs/wallet-path.md`. This runbook uses the live injected-wallet
path for users and the backend executor wallet for settlement.

## Contracts

- `LoanPositionToken`: `<CURRENT_LOAN_POSITION_TOKEN>`
- `OutcomeToken`: `<CURRENT_OUTCOME_TOKEN>`
- `OutcomeExchange`: `<CURRENT_OUTCOME_EXCHANGE>`
- ARC USDC: `0x3600000000000000000000000000000000000000`

## Local Environment

The local `.env` file is intentionally ignored by git. It must contain:

```ini
DATABASE_URL=postgres://stopdown:stopdown@localhost:55432/stopdown
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
LOAN_POSITION_TOKEN_ADDRESS=<CURRENT_LOAN_POSITION_TOKEN>
OUTCOME_TOKEN_ADDRESS=<CURRENT_OUTCOME_TOKEN>
OUTCOME_EXCHANGE_ADDRESS=<CURRENT_OUTCOME_EXCHANGE>
LOAN_POSITION_TOKEN_BYTECODE_HASH=<DEPLOY_OUTPUT_HASH>
OUTCOME_TOKEN_BYTECODE_HASH=<DEPLOY_OUTPUT_HASH>
OUTCOME_EXCHANGE_BYTECODE_HASH=<DEPLOY_OUTPUT_HASH>
USDC_ADDRESS=0x3600000000000000000000000000000000000000
EXECUTOR_PRIVATE_KEY=0x...
```

`EXECUTOR_PRIVATE_KEY` is the settlement operator key. It does not sign user orders and does not custody user funds. It submits matched trades to `OutcomeExchange` and can run keeper actions when enabled.

The executor address must also be allowed as an `OutcomeExchange` operator by the contract owner:

```powershell
$env:EXCHANGE_OPERATOR_ADDRESS="0x..."
npm.cmd run arc:set-exchange-operator
```

## Start From Clean Local Services

Start Docker Desktop first. PostgreSQL runs through Docker Compose.

```powershell
corepack npm ci
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:check
```

For a reviewer/live ARC run, use a clean PostgreSQL volume or clean database. Mixing old local demo
orders with live ARC contracts can make background workers inspect stale mock `outcomeToken`
addresses and can leave reconciliation cursors far behind the current ARC head. If you intentionally
reuse an old local database, inspect `backend_cursors` before claiming live CLOB reconciliation
evidence.

Recommended reviewer reset:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:reset:reviewer -- --yes
npm.cmd run db:check
```

`db:reset:reviewer` clears orders, reservations, trades, settlement attempts, market configs,
processed chain events, cursors, and loan snapshots. It preserves the database schema and
`schema_migrations`.

When creating live demo loans from PowerShell, derive deadlines from UTC Unix time:

```powershell
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$env:LOAN_PRINCIPAL = "1000000"
$env:LOAN_INTEREST_BPS = "500"
$env:LOAN_COLLATERAL_BPS = "10000"
$env:LOAN_WITHDRAW_FREEZE_DEADLINE = ($now + 120).ToString()
$env:LOAN_ACTIVATION_DEADLINE = ($now + 1200).ToString()
$env:LOAN_REPAYMENT_DEADLINE = ($now + 3600).ToString()
npm.cmd run arc:create-demo-loan
```

Do not use `Get-Date -UFormat %s` for this. In PowerShell it can produce a timestamp shifted by the
local timezone, which makes the loan withdraw freeze deadline much later than intended.

Register a current-deployment active ARC market in the local CLOB database after creating and
activating a fresh loan:

```powershell
npm.cmd run market-config:upsert -- --outcome-token <CURRENT_OUTCOME_TOKEN> --market-id <MARKET_ID> --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

Run the backend with settlement/keeper loops:

```powershell
npm.cmd run dev:clob
```

`dev:clob` also runs the loan snapshot sync loop. The frontend loan and market list endpoints read
from PostgreSQL snapshots instead of repeatedly scanning loans through ARC RPC. If the public ARC
RPC is throttled, affected HTTP calls return `429 RATE_LIMITED`, and the sync loop retries on its
next interval.

Run the frontend:

```powershell
npm.cmd run dev:frontend
```

Check that the live stack is ready for a frontend trade:

```powershell
npm.cmd run arc:live-check
```

Optional env:

```powershell
$env:CLOB_API_URL='http://127.0.0.1:3001'
$env:MARKET_ID='<MARKET_ID>'
npm.cmd run arc:live-check
```

This checks:

- PostgreSQL connectivity;
- ARC RPC chain id;
- executor wallet configuration;
- executor `OutcomeExchange` operator permission;
- executor gas balance;
- backend health, sync, and `executorEnabled`;
- linked loan context in `/v1/markets`;
- WebSocket book feed snapshot.

`arc:live-check` does not sign user orders. It only verifies that the infrastructure is ready for a
real browser wallet to sign and submit orders through the frontend.

Open:

```text
http://127.0.0.1:5173/#exchange/<CURRENT_OUTCOME_TOKEN>:<MARKET_ID>
```

## API-only Mode

Use API-only mode only when you want to inspect REST/WebSocket behavior without automatic settlement:

```powershell
npm.cmd run dev:clob:api-only
```

In API-only mode, orders can be admitted and matched in the local CLOB database, but the executor does not submit settlement transactions.

## Health Checks

```powershell
Invoke-RestMethod http://127.0.0.1:3000/v1/health
Invoke-RestMethod http://127.0.0.1:3000/v1/loans?limit=5
Invoke-RestMethod http://127.0.0.1:3000/v1/markets?limit=5
```

Expected for the current demo state:

- health `status = ok`;
- health `executorEnabled = true` when `EXECUTOR_PRIVATE_KEY` is set and `dev:clob` is used;
- loan `#3` is the current active reviewer market;
- loan `#3` market id is `0x1489a4e8bf6c349a62c1892e03c1206051f11bac3bdf1adaba8aaa6800322ea1`.

## Live CLOB Trade Script

The live backend trade walkthrough submits a borrower SELL and a temporary buyer BUY through the
running CLOB API:

```powershell
$env:LOAN_ID='3'
$env:CLOB_API_URL='http://127.0.0.1:3000'
npm.cmd run arc:clob-trade-active-loan
```

With the public ARC testnet RPC, this can fail with `request limit reached` during admission,
snapshot sync, or settlement simulation. The backend maps that failure to `RATE_LIMITED` where it
crosses the HTTP API boundary. For a stable demo, use a less rate-limited ARC RPC endpoint or run a
separate backend with conservative worker intervals:

```powershell
$env:PORT='3001'
$env:CLOB_API_URL='http://127.0.0.1:3001'
$env:RECONCILIATION_START_BLOCK='<CURRENT_ARC_BLOCK_BEFORE_STARTING_BACKEND>'
$env:RECONCILIATION_INTERVAL_MS='15000'
$env:MARKET_CONFIG_EVENT_SWEEP_INTERVAL_MS='60000'
$env:LENDING_KEEPER_INTERVAL_MS='60000'
$env:EXPIRED_ORDER_SWEEP_INTERVAL_MS='60000'
$env:RECEIPT_SWEEP_INTERVAL_MS='15000'
$env:EXECUTOR_INTERVAL_MS='5000'
$env:LOAN_SNAPSHOT_SYNC_INTERVAL_MS='30000'
npm.cmd run dev:clob
```

For a clean reviewer database, choose `RECONCILIATION_START_BLOCK` at or just before backend
startup, before submitting the reviewer trade. Starting before old demo trades can make
reconciliation see historical `OrderFilled` events whose orders are no longer present after
`db:reset:reviewer`.

## Funding the Executor

The executor address needs ARC testnet funds for transaction fees. It does not need user trading balances.

After funding, restart `dev:clob` so the backend loads the current `.env`.

## Live Wallet Trade Checklist

Before placing a trade through the frontend:

1. Open the frontend in a browser with an injected EVM wallet.
2. Switch the wallet to ARC testnet chain `5042002`.
3. Make sure the trader wallet has ARC gas and ARC USDC.
4. Open the loan-linked market page.
5. For a BUY order, approve USDC for `OutcomeExchange`.
6. For a SELL order, approve `OutcomeExchange` as ERC-1155 operator for `OutcomeToken`.
7. Submit the signed order.
8. Watch the orderbook, recent trades, and portfolio balances.
9. Check backend settlement with `/v1/trades` and `settlement_attempts` if needed.
