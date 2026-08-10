# Happy Path

This document defines the current reproducible happy path and the real-wallet path for users.

## What Users Do With Wallets

Users do not type private keys into StopDown.

Production-like users connect a wallet through the browser:

1. Open StopDown in a normal browser with an injected EVM wallet, such as MetaMask or Rabby.
2. Click `Connect wallet`.
3. Approve the wallet account request.
4. Switch the wallet to ARC testnet chain `5042002`.
5. Keep enough ARC testnet USDC for gas and protocol actions.
6. Approve the relevant contract only when the UI asks for it.

The backend never stores user private keys. It only receives signed orders, public addresses,
transaction hashes, and indexed on-chain state.

## Browser-Verified Read Path

Start PostgreSQL, the backend, and the frontend in separate terminals:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run dev:clob
npm.cmd run dev:frontend
```

Then run the real Playwright browser check:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:5173'
$env:E2E_API_URL='http://127.0.0.1:3000'
npm.cmd run test:e2e:frontend
```

For a same-origin deployment, only set `E2E_BASE_URL`. The test requires real health, loan, and
market API responses; verifies that every indexed loan has a matching market; opens the Markets
screen; and navigates into the real market detail view. It does not mock API responses.

## Scripted Contract and Settlement Paths

The scripted paths remain useful for deterministic contract and settlement coverage:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run demo:happy-path
```

It runs:

1. `demo:local:repaid`
   - borrower creates a loan;
   - borrower deposits collateral;
   - lender funds;
   - loan activates;
   - borrower repays;
   - YES wins;
   - lender claims repayment;
   - borrower redeems YES collateral.

2. `demo:local:default`
   - borrower creates a loan;
   - borrower deposits collateral;
   - lender funds;
   - loan activates;
   - repayment deadline passes;
   - NO wins;
   - loan contract redeems NO collateral into the lender recovery pool;
   - lender claims recovery.

3. `demo:local:clob-trade`
   - market is activated;
   - seller mints YES/NO from pair collateral;
   - seller places a signed GTC YES sell order;
   - buyer places a signed BUY order;
   - backend matches the orders;
   - executor submits settlement;
   - reconciliation confirms the trade;
   - WebSocket publishes the confirmed trade.

## Current Live ARC Path

The live ARC path is production-like, but still sensitive to public RPC limits:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run dev:clob
npm.cmd run dev:frontend
npm.cmd run arc:live-check
```

Then open:

```text
http://127.0.0.1:5173/#exchange/0x2cf1b7094f0da21b553993484e59ce5176e6177c:<MARKET_ID>
```

For a real browser-wallet test:

1. Connect wallet.
2. Switch to ARC testnet.
3. Approve USDC for BUY orders or approve ERC-1155 operator for SELL orders.
4. Submit an order.
5. Watch the orderbook, trades, and portfolio state.

## Read-Only UI Path

For reviewers without an injected wallet:

```powershell
npm.cmd run demo:api
npm.cmd run demo:frontend
```

This is UI-only. It is useful for navigation and screen review, but it does not prove live ARC
wallet compatibility.

## Not Yet 100%

The remaining production gap is a real browser-wallet recording or walkthrough from the frontend:

- create/fund/activate a fresh ARC loan from UI;
- place and settle a live UI order with real wallet signatures;
- verify claim/redeem from UI;
- run against a stable RPC or backend-owned node setup.
