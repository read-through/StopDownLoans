# Manual Testing Guide

This guide is for a manual tester who needs to inspect the StopDown UI without setting up a real ARC wallet.

## What This Tests

The mock path tests:

- screen navigation;
- loan list and loan detail layout;
- market list and market detail layout;
- order ticket validation and submit flow;
- portfolio wallet state screens;
- mock transaction/signature handling.

It does not prove live ARC transactions. For live ARC testing, use `docs/arc-testnet-runbook.md`.

## Start Mock UI

Open two terminals from the repository root.

Terminal 1:

```powershell
npm.cmd run demo:api
```

Expected output:

```text
Demo CLOB API listening on http://127.0.0.1:3000
```

Terminal 2:

```powershell
npm.cmd run demo:frontend
```

Expected output contains a local Vite URL, usually:

```text
http://127.0.0.1:5173/
```

Open that URL in a browser.

`demo:frontend` loads `frontend/.env.demo`, which enables:

```ini
VITE_ENABLE_MOCK_WALLET=true
```

## Wallet Behavior

The tester does not install MetaMask and does not enter a private key.

Click `Connect wallet`.

Expected:

- wallet button changes from `No wallet` to a shortened address;
- Portfolio page shows wallet readiness;
- no browser wallet popup appears, because the mock signer handles requests inside the app.

The mock signer uses a public local demo key from `mocks/frontend/mockWallet.ts`. It is not a custody model and must not be used as production behavior.

## Basic Screen Checklist

### Overview

Open:

```text
http://127.0.0.1:5173/#overview
```

Check:

- page loads without `request failed`;
- top navigation is visible;
- protocol overview cards are readable.

### Create Loan

Open:

```text
http://127.0.0.1:5173/#create
```

Check:

- create-loan form is visible;
- wallet can be connected;
- submitting returns a mock transaction hash or visible action status.

The reviewer API is fixture-backed, so a created loan will not be appended to the demo loan list.

### Loans

Open:

```text
http://127.0.0.1:5173/#loans
```

Check:

- loan list is visible;
- pagination/load-more controls do not break layout;
- clicking a loan opens a single-loan detail route;
- loan detail shows funding, collateral, activation, repayment/default sections.

### Exchange

Open:

```text
http://127.0.0.1:5173/#exchange
```

Check:

- market list is visible;
- clicking a market opens a single-market detail route;
- orderbook, recent trades, and order ticket are visible;
- order outcome can switch between YES and NO if the UI exposes the control.

Submit a mock order:

1. Connect wallet.
2. Choose market.
3. Enter order amount and price.
4. Submit order.

Expected:

- UI does not ask for MetaMask;
- order submission completes or returns a visible mock order state;
- demo API may broadcast a book update.

### Portfolio

Open:

```text
http://127.0.0.1:5173/#portfolio
```

Check:

- wallet readiness panel is visible;
- balances, open orders, lender positions, and reservations sections render;
- cancel/claim actions either show mock status or disabled state with a clear reason.

## Expected Demo Limitations

- Demo API data is static.
- Mock transaction hashes are fake.
- Mock `eth_call` returns canned balances/allowances.
- Mock order submission does not prove live ARC settlement.
- This path is for UI review and manual product inspection only.

## Production-Like Manual Test

For a real wallet test:

1. Copy `frontend/.env.arc-testnet.example` to `frontend/.env.local`.
2. Run the backend and frontend from `docs/arc-testnet-runbook.md`.
3. Open the app in a browser with an injected EVM wallet.
4. Connect wallet.
5. Switch to ARC testnet chain `5042002`.
6. Use ARC testnet USDC for gas, funding, collateral, and orders.

In production-like mode, keep:

```ini
VITE_ENABLE_MOCK_WALLET=false
```
