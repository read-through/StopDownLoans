# Production Deployment Plan

This document describes how the MVP should move from local/demo execution to a production-like
deployment.

It is a plan, not a claim that the current repository is production-ready.

## Target Runtime Components

| Component | MVP local state | Production target |
| --- | --- | --- |
| Frontend | Vite dev server or static build | Hosted static app behind HTTPS and a stable domain |
| CLOB backend | Local `npm.cmd run dev:clob` process | Hosted Node.js service with health checks, logs, and restart policy |
| PostgreSQL | Docker Compose local database | Managed PostgreSQL with backups, migrations, and restricted credentials |
| ARC RPC | Public ARC RPC endpoint | Dedicated or less rate-limited RPC endpoint; production indexer where possible |
| Keeper | Runs inside backend process | Separate worker process with monitoring and alerting |
| Exchange executor | Hot local operator key | Managed operator key, HSM, or custody-backed signer if latency and chain support fit |
| User wallets | Injected EVM wallet or Circle User-Controlled Wallet | User-controlled wallets; Circle User-Controlled Wallets are the preferred retail path |
| Mocks | `mocks/` demo/test substitutes | Disabled in production-like deployments |

## Deployment Shape

```text
Browser / wallet
  -> hosted frontend
  -> CLOB HTTP + WebSocket backend
  -> PostgreSQL
  -> ARC RPC / indexer
  -> ARC contracts

Keeper worker
  -> PostgreSQL
  -> ARC RPC
  -> LoanPositionToken / OutcomeToken

Executor worker
  -> PostgreSQL settlement attempts
  -> ARC RPC
  -> OutcomeExchange
```

## Required Environment

Backend:

```ini
DATABASE_URL=...
ARC_RPC_URL=...
ARC_CHAIN_ID=...
LOAN_POSITION_TOKEN_ADDRESS=...
OUTCOME_TOKEN_ADDRESS=...
OUTCOME_EXCHANGE_ADDRESS=...
USDC_ADDRESS=...
EXECUTOR_PRIVATE_KEY=...
PORT=...
```

Frontend:

```ini
VITE_ARC_CHAIN_ID=...
VITE_CLOB_API_URL=...
VITE_CLOB_WS_URL=...
VITE_LOAN_POSITION_TOKEN_ADDRESS=...
VITE_OUTCOME_TOKEN_ADDRESS=...
VITE_OUTCOME_EXCHANGE_ADDRESS=...
VITE_USDC_ADDRESS=...
```

The frontend has no mock wallet path. User signatures come only from an injected wallet or a
configured Circle User-Controlled Wallet.

## Operational Requirements

### Database

- run migrations before backend start;
- restrict DB credentials to the backend service;
- back up order, reservation, trade, settlement attempt, and snapshot tables;
- keep migration history immutable after deployment.

### RPC / indexing

Public RPC is acceptable for MVP checks, but not enough for a reliable final product.

Production target:

- dedicated or higher-rate ARC RPC endpoint;
- conservative worker intervals;
- reconciliation cursor monitoring;
- clear `RATE_LIMITED` error handling at HTTP boundaries;
- eventual indexer service for chain events and loan snapshots.

### Keeper

The keeper should be separated from the public HTTP server once the demo moves beyond local MVP.

Responsibilities:

- activate funded loans after conditions are met;
- mark repaid loans when repayment is credited before deadline;
- mark defaulted loans after deadline when repayment is missing;
- redeem loan-held NO collateral after default;
- retry recoverable failures;
- log every lifecycle action.

### Executor

The executor submits matched signed orders to `OutcomeExchange`.

It does not custody user funds and cannot fabricate maker intent because orders are EIP-712 signed.

Production risks still remain:

- operator key compromise;
- gas exhaustion;
- RPC failure;
- stuck submitted transactions;
- mismatch between DB settlement state and chain events.

Required hardening:

- managed key or HSM/custody-backed signer;
- gas balance monitoring;
- retry and final failure cleanup alerts;
- reconciliation drift alerts;
- emergency disable procedure for settlement submission.

### Frontend

The final frontend must feel like a product, not an internal console.

Required improvements:

- borrower flow: create loan, understand collateral, track activation and repayment;
- lender flow: browse loans, fund, claim, understand recovery;
- trader flow: browse markets, trade YES/NO, understand outcome and redeemability;
- single loan detail separated from all-loans list;
- single market detail separated from all-markets list;
- portfolio page with positions, claims, orders, and wallet readiness;
- clear empty/loading/error/rate-limit states.

## ARC Integration

ARC is the settlement chain.

Current MVP already uses:

- ARC chain id;
- ARC USDC;
- EVM-compatible Solidity contracts deployed to ARC testnet;
- ARC RPC for reads and transaction submission;
- on-chain settlement through `OutcomeExchange`.

Final-submission target:

- stable ARC testnet walkthrough;
- documented active demo market;
- explicit RPC/indexing plan;
- ARC kits identified for onboarding/deployment ergonomics or implemented in one concrete flow.

## Circle Integration

Circle is a wallet and gas UX layer, not CLOB core infrastructure.

Preferred production direction:

- Circle User-Controlled Wallets for retail borrowers, lenders, and traders;
- injected wallets still supported for power users;
- market makers can use any EIP-712 capable signer;
- backend executor remains separate from retail wallet UX;
- gas sponsorship is added only after ARC/account support is confirmed.

For final submission, Circle must be either:

- implemented in one narrow frontend onboarding/signing flow; or
- clearly labeled as the planned retail wallet path with exact integration boundaries.

## Launch Checklist

Before calling a deployment production-like:

- frontend build passes;
- backend typecheck passes;
- backend tests pass;
- contract tests pass;
- DB migrations run on a clean database;
- health endpoint is green;
- `/v1/loans` and `/v1/markets` return snapshot data;
- WebSocket book feed works;
- executor has operator permission and gas;
- keeper lifecycle actions are logged;
- mocks are disabled;
- secrets are not committed;
- known limitations are current.
