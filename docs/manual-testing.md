# Manual Testing Guide

This guide separates read-only UI inspection from real ARC wallet testing. The frontend contains no
mock wallet, private key, fake transaction receipt, or fake EIP-712 signer.

## Read-Only UI Inspection

Use this path to inspect navigation, responsive layout, lists, details, orderbook presentation, and
empty/error states without preparing a wallet:

```powershell
npm.cmd run demo:reviewer
```

Open `http://127.0.0.1:5173/#overview` after Vite prints its ready message.

`demo:reviewer` starts:

- the fixture-backed API from `mocks/backend/serve-demo-api.ts`;
- the normal production frontend entrypoint;
- no wallet provider and no transaction simulation.

Expected wallet behavior:

- `Connect wallet` lists every EIP-6963 browser wallet by name and offers Circle Wallet;
- the dialog reports that no browser wallet exists when no injected provider is available;
- Circle Wallet reports that it is not configured when backend Circle credentials are absent;
- transaction, order-signing, claim, and approval actions remain unavailable without a real wallet.

## Read-Only Screen Checklist

Inspect these routes:

```text
#overview
#create
#loans
#loans/<loanId>
#exchange
#exchange/<outcomeToken>:<marketId>
#portfolio
```

Verify:

- list and detail screens are separate;
- loan and market pagination controls do not resize or overflow the page;
- loan funding, collateral, activation, repayment, orderbook, and outcome sections are readable;
- mobile width has no horizontal page overflow;
- wallet-required actions explain why they are unavailable;
- fixture data is never presented as a confirmed ARC transaction.

## Real Injected-Wallet Test

1. Start PostgreSQL and the live backend as described in `docs/arc-testnet-runbook.md`.
2. Copy `frontend/.env.arc-testnet.example` to `frontend/.env.local`.
3. Run `npm.cmd run dev:frontend`.
4. Open the frontend in Chrome, Brave, or another browser with an EIP-6963 wallet installed.
5. Click `Connect wallet`, then choose the required wallet by name.
6. Approve adding or switching to ARC testnet chain `5042002`.
7. Confirm that Portfolio shows the connected address, USDC, outcome balances, approvals, orders,
   lender positions, and reservations.
8. Execute only actions valid for the connected account and current loan/market lifecycle.

The wallet needs ARC testnet USDC for gas and for funding, collateral, repayment, pair minting, or
BUY orders. StopDown never receives the injected wallet's private key.

## Real Circle-Wallet Test

Configure these backend-only deployment values:

```ini
CIRCLE_API_KEY=...
CIRCLE_APP_ID=...
CIRCLE_GOOGLE_CLIENT_ID=...
CIRCLE_GOOGLE_REDIRECT_URI=...
```

Then:

1. Open `Connect wallet` and choose `Continue with Google`.
2. Complete Google OAuth and the Circle challenge.
3. Confirm that an `ARC-TESTNET` EOA is created or loaded.
4. Execute one protocol transaction and wait for its confirmed ARC transaction hash.
5. Sign one EIP-712 order and verify backend admission under the Circle wallet address.

Circle credentials are deployment-specific. Without all four values the backend deliberately
returns `{ "enabled": false }` and the frontend keeps the Circle option disabled.

## Live Stack Gate

Before transaction testing, run:

```powershell
npm.cmd run arc:live-check
```

Expected evidence:

- PostgreSQL is reachable;
- ARC chain id is `5042002`;
- executor has operator permission and gas;
- backend health and sync are `ok`;
- an active market has linked loan context;
- WebSocket book feed returns a snapshot.

The fixture-backed API is useful only for visual inspection. It does not prove wallet integration,
state mutation, settlement, reconciliation, or keeper behavior.
