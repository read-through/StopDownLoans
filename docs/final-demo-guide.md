# Final Demo Guide

This guide defines the final-submission demo path for reviewers.

It separates three things that should not be confused:

- **local protocol proof**: deterministic scripts that prove lending, outcomes, CLOB matching, and
  settlement behavior;
- **live ARC path**: production-like run against deployed ARC testnet contracts and real wallets;
- **mock UI fallback**: reviewer-friendly screen inspection when no injected ARC wallet is available.

## Recommended Reviewer Order

### 1. Prove the protocol locally

Use this first because it is deterministic and does not depend on public ARC RPC limits.

```powershell
npm.cmd install
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run demo:happy-path
```

Expected result:

- repaid loan path completes;
- default loan path completes;
- local CLOB trade path completes;
- script prints `StopDown local happy path completed.`

This proves:

- borrower collateral;
- lender funding;
- loan activation;
- YES resolution after repayment;
- NO resolution after default;
- lender claim surface;
- outcome token redemption;
- signed order matching and settlement flow.

### 2. Inspect the frontend with the demo fallback

Use this to review navigation and screen structure without a browser wallet.

From the repository root:

```powershell
npm.cmd run demo:reviewer
```

Open:

```text
http://127.0.0.1:5173/#overview
```

If the wrapper is not suitable for the review environment, use the two-terminal fallback.

Terminal 1:

```powershell
npm.cmd run demo:api
```

Terminal 2:

```powershell
npm.cmd run demo:frontend
```

Then open:

```text
http://127.0.0.1:5173/
```

Expected reviewer screens:

- Overview;
- Create Loan;
- Loans list;
- single loan detail;
- Markets/Exchange list;
- single loan-linked market detail;
- Portfolio.

Expected limitation:

- the demo API is fixture-backed;
- mock wallet transactions produce demo hashes;
- this path is for UI review, not live ARC settlement proof.

### 3. Run the live ARC readiness check

Use this to verify that the local backend can talk to the deployed ARC contracts.

Follow `docs/arc-testnet-runbook.md`, then run:

```powershell
npm.cmd run arc:live-check
```

Expected result:

- PostgreSQL connection passes;
- ARC chain id is correct;
- executor wallet is configured;
- executor has operator permission;
- backend health responds;
- `/v1/markets` returns linked market context;
- WebSocket book feed responds.

If public ARC RPC returns `request limit reached`, use the conservative worker interval settings in
`docs/arc-testnet-runbook.md` or switch to a less rate-limited RPC endpoint.

### 4. Optional live browser-wallet test

Use this when a reviewer has an injected EVM wallet on ARC testnet.

1. Copy `frontend/.env.arc-testnet.example` to `frontend/.env.local`.
2. Start PostgreSQL and migrate.
3. Run `npm.cmd run dev:clob`.
4. Run `npm.cmd run dev:frontend`.
5. Open the app in a normal browser.
6. Connect wallet.
7. Switch to ARC testnet chain `5042002`.
8. Approve USDC for BUY orders or approve `OutcomeExchange` for ERC-1155 SELL orders.
9. Submit an order on a loan-linked market.
10. Watch orderbook, trades, and portfolio state.

This is the most production-like path, but it depends on:

- a funded ARC testnet wallet;
- public RPC stability or a better RPC endpoint;
- deployed contract addresses in `.env` and frontend env;
- executor wallet gas and operator permission.

## Current Primary Demo Choice

For final submission, the safest primary demo is:

1. `demo:happy-path` as protocol proof;
2. `demo:api` + `demo:frontend` as UI inspection;
3. `arc:live-check` as ARC integration proof.

The live browser-wallet path should be shown if available, but should not be the only proof path
until RPC limits and wallet setup are made reviewer-safe.

## What Still Needs Work Before Final Submission

- Improve frontend clarity and visual quality.
- Make the final demo path visible from README top section.
- Add a production/deployment plan.
- Decide whether Circle remains a documented placeholder or gets one concrete implemented flow.
- Add one final walkthrough record: screenshots, short video, or terminal transcript.

## What Must Not Be Claimed

- Do not claim the mock UI fallback proves live ARC settlement.
- Do not claim Circle wallets are implemented until they are actually wired into the frontend.
- Do not claim production readiness before hosted backend, managed DB, secrets, monitoring, and
  security review exist.
- Do not claim public ARC RPC is sufficient for production-like reliability without evidence.
