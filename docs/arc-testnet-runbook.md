# ARC Testnet Runbook

This runbook is for running the MVP against the deployed ARC testnet contracts without frontend/backend mocks.

Wallet behavior is specified in `docs/wallet-path.md`. This runbook uses the live injected-wallet
path for users and the backend executor wallet for settlement.

## Contracts

- `LoanPositionToken`: `0x7e1a9611f61a40fac7e2f18831a13edf9e8d25e6`
- `OutcomeToken`: `0xfb5d4095bc502bd0774d8e4437b94573fd29028c`
- `OutcomeExchange`: `0x45333a5b06a95a2a84cea9ab67f486558943c626`
- ARC USDC: `0x3600000000000000000000000000000000000000`

## Local Environment

The local `.env` file is intentionally ignored by git. It must contain:

```ini
DATABASE_URL=postgres://stopdown:stopdown@localhost:55432/stopdown
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
LOAN_POSITION_TOKEN_ADDRESS=0x7e1a9611f61a40fac7e2f18831a13edf9e8d25e6
OUTCOME_TOKEN_ADDRESS=0xfb5d4095bc502bd0774d8e4437b94573fd29028c
OUTCOME_EXCHANGE_ADDRESS=0x45333a5b06a95a2a84cea9ab67f486558943c626
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
npm.cmd install
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:check
```

Register the active ARC market in the local CLOB database:

```powershell
npm.cmd run market-config:upsert -- --outcome-token 0xfb5d4095bc502bd0774d8e4437b94573fd29028c --market-id 0xc3851385000c2d86f34b031cfa5e672e6651cce7d7af2fc3e0c9b3365fda5427 --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

Current additional live market created on 2026-07-26:

```powershell
npm.cmd run market-config:upsert -- --outcome-token 0xfb5d4095bc502bd0774d8e4437b94573fd29028c --market-id 0xd5cf42e5e9cb299e61742c19f6f1958e4e737b22c0ca6b1a31ee86f9fcfe4738 --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

Current active live market for reviewer trading checks:

```powershell
npm.cmd run market-config:upsert -- --outcome-token 0xfb5d4095bc502bd0774d8e4437b94573fd29028c --market-id 0xd1ee39ba1234d6fb0a71db25f743d2e22b55bb9a9490986e0537a82526b6b4c8 --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
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
$env:MARKET_ID='0xd1ee39ba1234d6fb0a71db25f743d2e22b55bb9a9490986e0537a82526b6b4c8'
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
http://127.0.0.1:5173/#exchange/0xfb5d4095bc502bd0774d8e4437b94573fd29028c:0xc3851385000c2d86f34b031cfa5e672e6651cce7d7af2fc3e0c9b3365fda5427
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
- loan `#1` is `DEFAULTED`;
- loan `#3` was used for backend checks and may be `DEFAULTED`;
- loan `#4` is the current active reviewer market;
- loan `#4` market id is `0xd1ee39ba1234d6fb0a71db25f743d2e22b55bb9a9490986e0537a82526b6b4c8`.

## Live CLOB Trade Script

The live backend trade walkthrough submits a borrower SELL and a temporary buyer BUY through the
running CLOB API:

```powershell
$env:LOAN_ID='4'
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
$env:RECONCILIATION_START_BLOCK='53785400'
$env:RECONCILIATION_INTERVAL_MS='15000'
$env:MARKET_CONFIG_EVENT_SWEEP_INTERVAL_MS='60000'
$env:LENDING_KEEPER_INTERVAL_MS='60000'
$env:EXPIRED_ORDER_SWEEP_INTERVAL_MS='60000'
$env:RECEIPT_SWEEP_INTERVAL_MS='15000'
$env:EXECUTOR_INTERVAL_MS='5000'
$env:LOAN_SNAPSHOT_SYNC_INTERVAL_MS='30000'
npm.cmd run dev:clob
```

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
