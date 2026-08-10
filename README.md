# StopDown Loans

MVP prototype for a DeFi lending protocol where a loan is linked to YES/NO outcome tokens.

The current codebase contains:

- Solidity contracts for loan positions, outcome tokens, and on-chain outcome settlement;
- a TypeScript CLOB backend for signed limit orders;
- PostgreSQL schema and repositories for orders, reservations, trades, settlement attempts, and chain-event reconciliation;
- PostgreSQL loan snapshots for loan/market list reads, so the frontend does not scan ARC RPC on every list request;
- a Vite/React frontend for borrower, lender, and YES/NO trading flows against the local or ARC-backed stack.

For the hackathon submission checklist and 3-minute video script, see
`docs/hackathon-submission.md`. For a short hackathon reviewer guide, see
`docs/mid-submission.md`. For the final-submission MVP roadmap and current progress estimate, see
`docs/final-mvp-roadmap.md`. For intentional MVP shortcuts and cleanup items, see
`docs/known-limitations.md`. Historical ARC testnet deployment addresses are recorded in
`docs/arc-testnet-deployment.md`. For running the live ARC testnet stack with a settlement executor
wallet, see `docs/arc-testnet-runbook.md`. For injected user wallets, the executor wallet, Circle,
and market-maker paths, see `docs/wallet-path.md` and `docs/circle-integration-strategy.md`. The
ARC App Kit funding command is documented in `docs/arc-app-kit.md`. For the
final reviewer demo sequence, see `docs/final-demo-guide.md`. For the current reproducible product
walkthrough, see `docs/happy-path.md`. For a click-by-click UI checklist for manual testers,
see `docs/manual-testing.md`. For the production/deployment plan, see
`docs/production-deployment-plan.md`. For the public Render demo deployment, see
`docs/render-deployment.md`.

## Product Flow

```mermaid
%%{init: {"theme": "base", "themeVariables": {"loopLineColor": "#6841c5", "loopTextColor": "#4b2c91"}}}%%
sequenceDiagram
  autonumber
  actor Borrower
  participant Loan as LoanPositionToken
  participant Market as OutcomeToken YES or NO market
  actor Lenders
  actor Traders
  participant CLOB as CLOB + trade settlement
  participant Keeper as Off-chain keeper / resolver

  Borrower->>Loan: createLoan(P, interestBps, collateralBps, deadlines)
  Loan->>Market: createProtoMarket(loanId, requiredCollateral)
  Borrower->>Market: depositBorrowerCollateral(C)
  Note right of Market: Pre-activation until loan funding and borrower collateral are present
  Lenders->>Loan: fund(loanId, amount) until P is funded
  Loan-->>Lenders: mint lender position shares
  Traders->>Market: depositPairCollateral(x USDC)
  Note over Traders,Market: Pair mint rule: x USDC mints x YES plus x NO after activation
  Lenders->>Loan: optional withdrawFunding() before loan withdraw freeze deadline
  Keeper->>Loan: activate(loanId)
  Loan-->>Borrower: transfer principal P
  Loan->>Market: activateMarket()
  Market-->>Borrower: mint borrower YES
  Market-->>Loan: mint loan-held NO
  Traders->>Market: mintActivatedPair(marketId)
  Market-->>Traders: mint deposited YES + NO pairs
  Note right of Market: Winning outcome tokens redeem 1 USDC each. Losing tokens redeem 0.
  loop Trading period until repayment deadline
    Borrower->>CLOB: sell YES orders
    Traders->>CLOB: BUY or SELL YES or NO limit orders
    CLOB->>Market: settle matched outcome transfer
    CLOB-->>Traders: settle USDC between matched traders
  end
  alt Repayment on time - YES wins
    Borrower->>Loan: depositToLoan(R)
    Keeper->>Loan: settleRepaid(loanId)
    Loan->>Market: resolve(YES)
    Note right of Loan: Loan state changes only after R is credited. Lenders claim from contract balance.
    Lenders->>Loan: claim repayment share
    Traders->>Market: redeem winning YES at 1 USDC each
  else Repayment missing or late - NO wins
    Keeper->>Loan: markDefaulted(loanId)
    Loan->>Market: resolve(NO)
    Keeper->>Loan: redeemDefaultCollateral()
    Loan->>Market: redeem loan-held NO at 1 USDC each
    Lenders->>Loan: claim default recovery
    Traders->>Market: redeem winning NO at 1 USDC each
  end
```

Example:

- Borrower wants `$1,000` principal.
- Borrower chooses `5%` interest and `100%` collateral ratio.
- Required repayment is `$1,050`.
- Borrower commits `$1,000` collateral because `collateralBps = 10,000` is applied to principal.
- Lenders fund `$1,000` and receive lender positions representing their share of repayment/recovery.
- The YES/NO market represents the question: "Will the required `$1,050` repayment arrive before the deadline?"
- Independent market participants can also deposit pair collateral: `$1` mints `1 YES + 1 NO` after activation.
- When the loan starts, the borrower receives transferable YES shares and can sell them to traders.
- Selling YES lets the borrower recover part of the posted collateral value, while YES buyers take repayment/default exposure.
- If repayment arrives on time, YES wins: each winning YES redeems `$1`, NO redeems `$0`, and lenders claim repayment.
- If repayment does not arrive on time, NO wins: each winning NO redeems `$1`, YES redeems `$0`, and lender recovery comes from the loan-held NO payout.

## Architecture

![StopDown Loans architecture](docs/assets/architecture.d2.svg)

## Repository Map

```text
contracts/              Production Solidity contracts
backend/src/            CLOB API, matching, repositories, keepers, ARC readers
frontend/src/           Production React app and wallet-agnostic chain calls
mocks/                  Demo/test substitutes only
mocks/backend/          Fixture-backed reviewer API
mocks/contracts/        Solidity test doubles
scripts/                Local and ARC walkthrough scripts
test/, backend/test/    Contract, backend, and local E2E verification
docs/                   Protocol, CLOB, deployment, and submission notes
```

## Quick Demo

Demo modes:

| Mode | Use it for | Stateful? |
| --- | --- | --- |
| UI demo | Reviewer walkthrough of screens without live ARC deployment. | UI-only: fixture-backed responses, no persisted protocol state. |
| Local protocol demos | Contract-level lending/outcome/exchange behavior. | Yes, inside Hardhat execution. |
| ARC testnet | Production-like deployment and wallet flow. | Yes, on ARC testnet. |

```powershell
corepack npm ci
npm.cmd run build:frontend
npm.cmd run typecheck:backend
npm.cmd run test:backend
npm.cmd run demo:reviewer
```

Open `http://127.0.0.1:5173/#overview`.

The demo API is intentionally non-production. It lets reviewers inspect read-only frontend screens
without requiring a live ARC deployment or funded wallets. It uses fixture-backed read models and
does not provide wallet actions or persist real protocol/orderbook state. Use the live ARC stack with
an injected or Circle wallet for transaction and signature testing.

Historical ARC testnet deployment addresses are recorded in `docs/arc-testnet-deployment.md`. They
prove the earlier borrower-controlled `collateralBps` path, but a new deployment is required after
changing the collateral-ratio base from repayment amount to principal. The earlier evidence remains:
`LOAN_ID=3` is the current clean reviewer loan: it was created, collateralized, funded, activated,
and traded through the backend CLOB executor/reconciliation path.

The frontend uses hash routes for reviewable deep links:

- `#loans` for the loan list;
- `#loans/<loanId>` for one loan;
- `#exchange` for the market list;
- `#exchange/<outcomeToken>:<marketId>` for one YES/NO market.

For read-only UI inspection without a browser wallet, use the committed demo env:

```powershell
npm.cmd run demo:reviewer
```

`demo:reviewer` starts the fixture-backed demo API and the normal Vite frontend in demo mode. The
frontend loads `frontend/.env.demo`, which points read requests at the fixture API. Wallet actions
remain unavailable unless the browser provides an injected wallet or the backend has Circle
credentials. Manual UI testing steps are documented in `docs/manual-testing.md`.

For stateful local protocol checks:

```powershell
npm.cmd run demo:happy-path
```

Or run individual scenarios:

```powershell
npm.cmd run demo:local:repaid
npm.cmd run demo:local:default
```

`demo:local:clob-trade` also exercises the CLOB backend persistence path and requires PostgreSQL
on `DATABASE_URL`.

## Local Backend Runbook

### 1. Install dependencies

```powershell
corepack npm ci
```

The repository pins npm through `packageManager` and commits a cross-platform lockfile. Use
Corepack here so Windows development and the Node 22 production image resolve the same graph.

Before publishing, run the complete contracts/backend/frontend/Docker preflight:

```powershell
corepack npm run release:check
```

### 2. Configure environment

Copy `.env.example` to `.env` for backend runtime configuration. Backend scripts load only this
ignored root `.env`, while already exported environment variables take precedence. Hardhat ARC and
App Kit commands load their own ignored files under `config/env/`.

```powershell
Copy-Item .env.example .env
```

Required values:

- `DATABASE_URL`: PostgreSQL connection string. The local Docker Compose default is
  `postgres://stopdown:stopdown@localhost:55432/stopdown`;
- `ARC_RPC_URL`: ARC RPC endpoint;
- `ARC_CHAIN_ID`: ARC chain id;
- `OUTCOME_EXCHANGE_ADDRESS`: deployed `OutcomeExchange`;
- `LOAN_POSITION_TOKEN_BYTECODE_HASH`, `OUTCOME_TOKEN_BYTECODE_HASH`,
  `OUTCOME_EXCHANGE_BYTECODE_HASH`: runtime hashes printed by the deploy script. Production startup
  fails before migrations or indexing when an address points to different bytecode;
- `USDC_ADDRESS`: deployed USDC token;
- `EXECUTOR_PRIVATE_KEY`: optional backend operator key. If empty, API and background readers run,
  but settlement and lending lifecycle transactions are not submitted.

Token amounts in backend APIs are integer strings in base units. Prices use integer `priceUnits`
with `PRICE_SCALE = 1_000_000`; the API never uses floating point financial values.

For database migration and backend smoke checks, only `DATABASE_URL` is required. Running the full
CLOB backend also requires ARC RPC and deployed contract addresses.

### 3. Start PostgreSQL

```powershell
npm.cmd run db:up
```

This uses `docker-compose.yml` and requires Docker Desktop to be running.

If this fails with `dockerDesktopLinuxEngine` pipe errors, Docker CLI is installed but Docker
Desktop's Linux engine is not running. Start Docker Desktop and rerun `npm.cmd run db:up`.

### 4. Run migrations

```powershell
npm.cmd run db:migrate
```

The backend stores orderbook state and loan snapshots in PostgreSQL. `GET /v1/loans` and
`GET /v1/markets` are snapshot reads; background sync refreshes them from ARC. RPC throttling is
reported as `RATE_LIMITED` instead of a generic backend failure.

Optional connectivity check:

```powershell
npm.cmd run db:check
```

Runtime smoke check against the local PostgreSQL database:

```powershell
npm.cmd run smoke:backend
```

This starts an in-process HTTP/WebSocket server on a random local port, writes smoke data to
PostgreSQL, and verifies the read API plus initial book feed. It does not submit orders on-chain.

For the default Docker Compose database on port `55432`, one command runs migrations, checks the
schema, and runs the backend smoke:

```powershell
npm.cmd run smoke:backend:local
```

### 5. Start CLOB backend

```powershell
npm.cmd run dev:clob
```

Default HTTP port is `3000`. Override it with `PORT`.

The server starts:

- public HTTP API;
- WebSocket book feed;
- expired order sweep;
- `OutcomeExchange` event reconciliation loop;
- submitted transaction receipt sweep;
- market config event sweep;
- executor loop if `EXECUTOR_PRIVATE_KEY` is set;
- lending keeper loop if `EXECUTOR_PRIVATE_KEY` is set.

The lending keeper reads recent loans and calls permissionless lifecycle functions when contract
conditions are already satisfied: `activate`, repayment-state marking, `cancelExpiredLoan`,
`markDefaulted`, and `redeemDefaultCollateral`. It uses `LENDING_KEEPER_INTERVAL_MS` and
`LENDING_KEEPER_SCAN_LIMIT`; defaults are `3000` and `100`.

For local frontend/order-admission testing against a rate-limited public ARC RPC, run the API
without background sweeps, reconciliation, executor, or keeper loops:

```powershell
npm.cmd run dev:clob:api-only
```

This still validates orders against ARC reads, but it avoids spending public RPC quota on background
workers while testing orderbook reads and `POST /v1/orders`.

Public ARC RPC can rate-limit live admission and settlement reads. For production-like CLOB testing,
prefer a less rate-limited RPC endpoint or run backend workers with conservative intervals and a
recent `RECONCILIATION_START_BLOCK`.

### 6. Start the frontend

The frontend talks to the CLOB HTTP/WebSocket API and to an injected browser wallet on ARC.

Copy the separate frontend environment template:

```powershell
Copy-Item frontend\.env.example frontend\.env
```

Required frontend values:

- `VITE_ARC_CHAIN_ID`: must match `ARC_CHAIN_ID` / wallet network;
- `VITE_CLOB_API_URL`: CLOB HTTP base URL, default `http://127.0.0.1:3000`;
- `VITE_CLOB_WS_URL`: CLOB WebSocket URL, default `ws://127.0.0.1:3000/v1/ws`;
- `VITE_LOAN_POSITION_TOKEN_ADDRESS`, `VITE_OUTCOME_TOKEN_ADDRESS`,
  `VITE_OUTCOME_EXCHANGE_ADDRESS`, `VITE_USDC_ADDRESS`: must match the backend and deployed
  contracts. The topbar health badge reports `Frontend config missing`, `Chain mismatch`, or
  `Contract mismatch` when these drift.

Vite also loads root `.env` for `VITE_*` keys, so keeping one aligned root `.env` is enough for
local full-stack work.

After deploying the current ARC testnet bytecode, copy the reviewer env template and replace its
address placeholders with deploy-script output:

```powershell
Copy-Item frontend\.env.arc-testnet.example frontend\.env.local
```

`frontend/.env.local` is gitignored. Do not put private keys into frontend env files.

Start the UI after `dev:clob` is running:

```powershell
npm.cmd run dev:frontend
```

Default UI URL is `http://127.0.0.1:5173`.

Production build and local preview:

```powershell
npm.cmd run build:frontend
npm.cmd run preview:frontend
```

The wallet must be on ARC testnet (`5042002`) with an injected provider. The backend never stores
user private keys; order submission and cancellations are EIP-712 signed in the browser.

The frontend contains no mock wallet or embedded private key. Wallet actions require either an
injected EIP-1193 wallet or configured Circle User-Controlled Wallet credentials. The fixture API is
read-only UI support and does not replace ARC state or contract deployment.

### 7. Deploy to ARC testnet

ARC testnet uses USDC as the native gas token. The deployer wallet must have testnet USDC before
deployment.

Required deploy env:

```powershell
Copy-Item config\env\arc-deploy.env.example config\env\arc-deploy.env
# Then set ARC_RPC_URL and DEPLOYER_PRIVATE_KEY in config\env\arc-deploy.env.
```

Deployment and verification commands load `config/env/arc-deploy.env`, not the backend `.env`.
Keeping `DEPLOYER_PRIVATE_KEY` empty in the committed template is intentional.

Optional deploy env:

```powershell
$env:COLLATERAL_TOKEN_ADDRESS='0x3600000000000000000000000000000000000000'
$env:ERC1155_METADATA_URI=''
```

Deploy contracts:

```powershell
npm.cmd run deploy:arc-testnet
```

The deploy script deploys `LoanPositionToken`, `OutcomeToken`, and `OutcomeExchange`, configures the
loan contract's outcome token once, authorizes the deployer as the first exchange operator, and
prints backend env values.

`ERC1155_METADATA_URI` is optional and affects only future deployments. An empty value leaves the
ERC-1155 metadata URI unset without changing mint, transfer, merge, redeem, or settlement behavior.

After deployment, verify the deployed wiring:

```powershell
$env:LOAN_POSITION_TOKEN_ADDRESS='0x...'
$env:OUTCOME_TOKEN_ADDRESS='0x...'
$env:OUTCOME_EXCHANGE_ADDRESS='0x...'
$env:USDC_ADDRESS='0x3600000000000000000000000000000000000000'
$env:EXPECTED_OWNER_ADDRESS='0x...'
$env:EXPECTED_OPERATOR_ADDRESS='0x...'
npm.cmd run verify:arc-deployment
```

`EXPECTED_OWNER_ADDRESS` and `EXPECTED_OPERATOR_ADDRESS` are optional. If provided, the verifier also
checks owner and operator role wiring.

Then check backend readiness against the deployed exchange and PostgreSQL:

```powershell
$env:DATABASE_URL='postgres://stopdown:stopdown@localhost:55432/stopdown'
$env:ARC_RPC_URL='https://rpc.testnet.arc.network'
$env:ARC_CHAIN_ID='5042002'
$env:LOAN_POSITION_TOKEN_ADDRESS='0x...'
$env:OUTCOME_EXCHANGE_ADDRESS='0x...'
$env:USDC_ADDRESS='0x3600000000000000000000000000000000000000'
$env:OUTCOME_TOKEN_ADDRESS='0x...'
npm.cmd run arc:postdeploy-check
```

The post-deploy check reads ARC RPC, checks the RPC chain id, verifies that `LoanPositionToken`
responds to `nextLoanId()`, verifies `OutcomeExchange.usdc() == USDC_ADDRESS`, connects to
PostgreSQL, and prints the market-config command template for the next loan-created `marketId`.

Create the first demo loan and proto market:

```powershell
$env:LOAN_POSITION_TOKEN_ADDRESS='0x...'
$env:OUTCOME_TOKEN_ADDRESS='0x...'
$env:DEPLOYER_PRIVATE_KEY='0x...' # borrower signer for this command
$env:LOAN_PRINCIPAL='1000000000'
$env:LOAN_INTEREST_BPS='500'
$env:LOAN_COLLATERAL_BPS='10000'
$env:LOAN_WITHDRAW_FREEZE_DEADLINE='1780000000'
$env:LOAN_ACTIVATION_DEADLINE='1780003600'
$env:LOAN_REPAYMENT_DEADLINE='1782595600'
npm.cmd run arc:create-demo-loan
```

This command only calls `LoanPositionToken.createLoan`, reads the emitted `loanId` and `marketId`,
checks the proto market, and prints the `market-config:upsert` command. It does not deposit borrower
collateral; borrower collateral approval/deposit is a separate user action.

Minimal ARC lending demo after `arc:create-demo-loan`:

Create the ignored walkthrough configuration before running the commands:

```powershell
Copy-Item config\env\arc-demo.env.example config\env\arc-demo.env
```

```powershell
# borrower signer
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:LOAN_ID='1'
npm.cmd run arc:borrower-collateral

# lender signer
$env:DEPLOYER_PRIVATE_KEY='0x...'
npm.cmd run arc:lender-fund

# any signer, after loan withdraw freeze deadline
npm.cmd run arc:activate-loan

# operator/seller signer, while loan is active
npm.cmd run arc:demo-trade-active-loan

# payer/borrower signer, before repayment deadline
$env:DEPLOYER_PRIVATE_KEY='0x...'
npm.cmd run arc:repay-settle

# lender signer
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:POSITION_ID='1'
npm.cmd run arc:lender-claim

# borrower signer
$env:DEPLOYER_PRIVATE_KEY='0x...'
npm.cmd run arc:borrower-redeem-yes
```

These commands are demo walkthrough helpers. Each command uses `DEPLOYER_PRIVATE_KEY` as the current
actor key for that step; the backend still never stores user private keys.
The complete walkthrough variable list is in `config/env/arc-demo.env.example`; the ARC demo npm
commands load its ignored `arc-demo.env` counterpart directly.

The ARC trade demo signs one borrower SELL order and one temporary-buyer BUY order, then settles
them through `OutcomeExchange.matchOrders`. It is intentionally direct on-chain settlement; the
product path still uses the CLOB backend for orderbook storage, matching, WebSocket updates, and
reconciliation.

### 8. Create or update a market config

Orders are accepted only for markets that have a backend CLOB config.

```powershell
npm.cmd run market-config:upsert -- --outcome-token 0x0000000000000000000000000000000000000000 --market-id 0x0000000000000000000000000000000000000000000000000000000000000000 --default-tick-units 10000 --edge-tick-units 1000 --lower-edge-price-units 100000 --upper-edge-price-units 900000
```

Optional flags:

- `--clob-enabled true|false`;
- `--min-order-outcome-amount`;
- `--max-order-outcome-amount`.

To inspect an existing market config:

```powershell
npm.cmd run market-config:get -- --outcome-token 0x0000000000000000000000000000000000000000 --market-id 0x0000000000000000000000000000000000000000000000000000000000000000
```

To update only tick and price-bound settings for new orders:

```powershell
npm.cmd run market-config:update-ticks -- --outcome-token 0x0000000000000000000000000000000000000000 --market-id 0x0000000000000000000000000000000000000000000000000000000000000000 --default-tick-units 10000 --edge-tick-units 1000 --lower-edge-price-units 100000 --upper-edge-price-units 900000
```

To resume accepting new orders for an existing configured market:

```powershell
npm.cmd run market-config:open -- --outcome-token 0x0000000000000000000000000000000000000000 --market-id 0x0000000000000000000000000000000000000000000000000000000000000000
```

To stop accepting new orders for a configured market:

```powershell
npm.cmd run market-config:close -- --outcome-token 0x0000000000000000000000000000000000000000 --market-id 0x0000000000000000000000000000000000000000000000000000000000000000
```

### 9. Smoke-test API surface

Public HTTP endpoints:

- `GET /v1/books/{outcomeToken}/{marketId}/{outcome}`;
- `GET /v1/books/{outcomeToken}/{marketId}/{outcome}/best`;
- `GET /v1/market-configs/{outcomeToken}/{marketId}`;
- `GET /v1/orders/{orderHash}`;
- `GET /v1/orders?maker={maker}&status={status}&limit={limit}&cursor={cursor}`;
- `GET /v1/trades?outcomeToken={outcomeToken}&marketId={marketId}&outcome={outcome}`;
- `GET /v1/reservations?maker={maker}`;
- `POST /v1/orders`;
- `POST /v1/orders/{orderHash}/cancel`.

WebSocket feed:

- `/v1/ws`;
- subscribe with `{"type":"subscribe","outcomeToken":"0x...","marketId":"0x...","outcome":"YES"}`.

### 10. Full local UI demo against ARC

Typical path after contracts are deployed and verified:

1. Put deployed addresses into root `.env` for both backend (`LOAN_POSITION_TOKEN_ADDRESS`,
   `OUTCOME_TOKEN_ADDRESS`, `OUTCOME_EXCHANGE_ADDRESS`, `USDC_ADDRESS`) and frontend (`VITE_*`
   mirrors of the same values plus `VITE_ARC_CHAIN_ID`, `VITE_CLOB_API_URL`, `VITE_CLOB_WS_URL`).
2. Start Postgres, migrate, and run `dev:clob`.
3. Upsert a market config for each loan `marketId` that should accept orders.
4. Start `dev:frontend`, connect an injected wallet on ARC testnet, and exercise create / fund /
   activate / trade / claim flows in the UI.

CLI demo helpers in section 7 remain useful for scripted walkthroughs without the browser.

## Verification

Backend checks:

```powershell
npm.cmd run typecheck:backend
npm.cmd run test:backend
```

Frontend checks:

```powershell
npm.cmd run build:frontend
```

Solidity checks:

```powershell
npm.cmd run build
npm.cmd test
```

Local EVM plus PostgreSQL CLOB e2e:

```powershell
npm.cmd run test:e2e:local
```

Without `DATABASE_URL`, this command still verifies the local EVM fixture and skips the PostgreSQL
HTTP cases. With `DATABASE_URL`, it also submits a signed maker SELL order and a taker BUY order
through `POST /v1/orders` using real local EVM market, balance, allowance, approval, token-id, and
fill-state reads. The taker order must create a matched trade and trade fill. The e2e then executes
that matched trade through the backend executor path, reconciles emitted `OutcomeExchange` events,
and verifies on-chain `filledAmounts`, outcome token balances, USDC balances, confirmed trade state,
mined settlement attempt state, and reservation release. It also includes a WebSocket feed scenario
that subscribes to the local book, observes book deltas after maker/taker submissions, and observes
matched plus confirmed trade feed messages.

If Hardhat cannot access its compiler cache in the local sandbox, rerun the build with host permission.

## Demo Scripts Plan

Demo scripts are not a replacement for tests. They are reproducible product-flow walkthroughs for
local demos, hackathon judging, and manual protocol inspection without requiring the browser UI.

Available demo scripts:

- `demo:local:repaid`: borrower creates a loan, deposits borrower collateral, lender funds, loan
  activates, borrower repays, loan resolves to YES, lender claims repayment, borrower redeems YES;
- `demo:local:default`: borrower creates a loan, deposits borrower collateral, lender funds, loan
  activates, repayment deadline passes, loan resolves to NO, held NO collateral is redeemed into the
  lender recovery pool, lender claims recovery;
- `demo:local:clob-trade`: active market exists, maker/taker sign orders, backend admits and matches
  them, executor settles on-chain, reconciliation confirms the trade, WebSocket publishes updates.

Timing, cancellation, split positions, partial claims, and invalid-state behavior remain primarily
test-suite coverage rather than demo-script coverage.

Run the local repaid demo:

```powershell
npm.cmd run demo:local:repaid
```

Run the local default demo:

```powershell
npm.cmd run demo:local:default
```

Run the local CLOB trade demo after PostgreSQL is running:

```powershell
npm.cmd run db:up
npm.cmd run smoke:backend:local
npm.cmd run demo:local:clob-trade
```

## Current Boundaries

- ARC is the settlement chain.
- Orders are off-chain EIP-712 signed limit orders.
- Matching is centralized in the backend.
- Settlement is non-custodial and performed by `OutcomeExchange`.
- The backend does not store or control user private keys.
- Circle User-Controlled Wallet Social Login is implemented as an optional retail path. It creates
  an ARC Testnet EOA, executes protocol transactions through user-approved challenges, and signs the
  same EIP-712 orders as injected wallets. Market makers can keep using any compatible signer.
- Circle is treated as a wallet and gas UX layer, not as CLOB core infrastructure; see
  `docs/circle-integration-strategy.md`.
- ARC App Kit is integrated through an estimate-first ARC USDC funding command; it remains outside
  lending accounting and CLOB matching.
- Market config reads are public. Admin/authenticated market-config write endpoints are intentionally not exposed yet; admin auth is still a separate design decision.

## Useful Specs

- `docs/mid-submission.md`
- `docs/lending-side-spec.md`
- `docs/outcome-layer-spec.md`
- `docs/exchange-settlement-spec.md`
- `docs/clob-matching-spec.md`
- `docs/circle-integration-strategy.md`
- `docs/manual-testing.md`

## Publication Safety

Before publishing, verify that no local secrets are staged:

```powershell
git status --short --ignored
git add --dry-run .
```

Expected ignored local files include `.env`, `frontend/.env`, `node_modules`, `artifacts`, `cache`,
`frontend/dist`, and `*.log`.

Initial GitHub push:

```powershell
git add .
git commit -m "Initial StopDown Loans MVP"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```
