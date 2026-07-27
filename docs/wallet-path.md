# Wallet Path

This document defines the wallet paths for the MVP and separates live ARC behavior from demo-only mocks.
Circle-specific integration boundaries are detailed in `docs/circle-integration-strategy.md`.

## Current Live ARC Path

The production-like MVP path is wallet-agnostic and uses an injected EVM provider:

- browser wallet exposes `window.ethereum`;
- frontend requests accounts with `eth_requestAccounts`;
- frontend verifies `eth_chainId` against ARC testnet `5042002`;
- if a connected wallet is on the wrong chain, frontend requests `wallet_switchEthereumChain`;
- frontend sends contract transactions with `eth_sendTransaction`;
- frontend signs orders and cancellations with `eth_signTypedData_v4`;
- backend verifies EIP-712 signatures and never stores user private keys.

Supported user actions through this path:

- borrower creates a loan;
- borrower deposits collateral;
- lender funds a loan;
- borrower/admin user activates eligible loan actions;
- trader approves USDC/outcome-token allowances;
- trader signs BUY/SELL orders;
- trader signs order cancellation;
- holder merges or redeems outcome positions.

## Backend Executor Wallet

The backend executor wallet is not a user wallet.

It is used only to submit already matched, already signed orders to `OutcomeExchange` and to run keeper actions when enabled.

Executor properties:

- configured by local `EXECUTOR_PRIVATE_KEY`;
- must be allowed through `OutcomeExchange.setOperator`;
- needs ARC testnet gas balance;
- does not custody user funds;
- cannot forge user orders because user orders require EIP-712 maker signatures.

For the current ARC testnet runbook, the executor address is:

```text
0x147a9B1454e4aC1c23d75cD476B5969a568E94f3
```

## Retail Wallet Target

Circle User-Controlled Wallets are the planned recommended path for retail borrowers, lenders, and traders.

Reason:

- users should not expose private keys to StopDown;
- embedded wallet UX is better for non-power users;
- the backend can remain wallet-agnostic because it only needs signatures and transaction hashes.

Circle integration target:

- use Circle wallet as a frontend/onboarding option;
- request the same EIP-712 order signatures used by injected wallets;
- submit the same contract transactions used by injected wallets;
- optionally add Circle gas UX after chain/account support is confirmed;
- keep market maker and bot flows open to any compatible signer.

This is not yet implemented in the frontend. The current frontend only talks to injected EVM providers or the explicit demo mock signer.

## Market Maker Path

Market makers should not be forced through embedded retail wallets.

Accepted paths:

- local bot signer;
- injected wallet for manual testing;
- institutional/custody signer;
- Circle wallet only if its latency and API constraints fit the maker strategy.

The CLOB backend accepts signed orders, not wallet sessions. That keeps the matching engine independent from wallet vendor choice.

## Demo Mock Path

The mock signer exists only for local reviewer/demo UI checks when no injected EVM wallet is available.

It is enabled only when:

```ini
VITE_ENABLE_MOCK_WALLET=true
```

The committed demo command uses:

```powershell
npm.cmd run demo:api
npm.cmd run demo:frontend
```

Mock limitations:

- reviewer API reads local fixtures instead of indexed live ARC state;
- mock transactions return demo hashes;
- mock signer does not prove live ARC wallet compatibility;
- mock signer is not a custody model.

## Required Live Wallet Checklist

Before testing a real ARC frontend flow:

1. Browser has an injected EVM wallet.
2. Wallet is switched to ARC testnet chain `5042002`.
3. User wallet has ARC testnet gas.
4. User wallet has ARC USDC for funding, collateral, repayment, or BUY orders.
5. User has approved the relevant contract:
   - `LoanPositionToken` for loan funding/repayment;
   - `OutcomeToken` for pair collateral minting;
   - `OutcomeExchange` for BUY order settlement;
   - `OutcomeExchange` as ERC-1155 operator for SELL order settlement.
6. Backend is running with `executorEnabled=true`.
7. `npm.cmd run arc:live-check` passes.

## Placeholders

The following wallet-related work remains:

- add Circle User-Controlled Wallet frontend integration;
- add ARC onboarding/kit integration where it improves chain setup or funding;
- add automatic ARC chain registration for wallets that do not already know chain `5042002`;
- add a documented real-wallet browser walkthrough with screenshots or recording;
- add frontend checks that distinguish missing gas, missing USDC, missing allowance, wrong chain, and missing injected wallet more clearly;
- add production operator key management instead of a local hot executor key;
- add hosted backend deployment with secret management and monitoring.
