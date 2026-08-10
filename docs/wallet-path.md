# Wallet Path

This document defines the live wallet paths for the MVP.
Circle-specific integration boundaries are detailed in `docs/circle-integration-strategy.md`.

## Current Live ARC Path

The production-like MVP path is wallet-agnostic and uses injected EVM providers through Wagmi:

- Wagmi discovers all EIP-6963 providers and lists each wallet separately;
- the user selects a connector, which owns the account, chain state, and EIP-1193 provider used by
  subsequent actions;
- Wagmi connects or switches the selected wallet to ARC testnet `5042002`, adding the chain when
  the wallet does not know it;
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

## Retail Circle Wallet

Circle User-Controlled Wallets are the implemented recommended optional path for retail borrowers,
lenders, and traders.

Reason:

- users should not expose private keys to StopDown;
- embedded wallet UX is better for non-power users;
- the backend can remain wallet-agnostic because it only needs signatures and transaction hashes.

Circle integration behavior:

- use Circle wallet as a frontend/onboarding option;
- request the same EIP-712 order signatures used by injected wallets;
- submit the same contract transactions used by injected wallets;
- optionally add Circle gas UX after chain/account support is confirmed;
- keep market maker and bot flows open to any compatible signer.

This is implemented through a unified EIP-1193-compatible frontend provider. Circle credentials and
Google OAuth redirect configuration are still required to verify it on a hosted deployment.

## Market Maker Path

Market makers should not be forced through embedded retail wallets.

Accepted paths:

- local bot signer;
- injected wallet for manual testing;
- institutional/custody signer;
- Circle wallet only if its latency and API constraints fit the maker strategy.

The CLOB backend accepts signed orders, not wallet sessions. That keeps the matching engine independent from wallet vendor choice.

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

- verify Circle User-Controlled Wallet Social Login and one ARC transaction on the public demo;
- add ARC App Kit onboarding/fund-flow integration where it improves USDC bridging, sending, or
  unified-balance readiness;
- add a documented real-wallet browser walkthrough with screenshots or recording;
- add frontend checks that distinguish missing gas, missing USDC, missing allowance, wrong chain, and missing injected wallet more clearly;
- add production operator key management instead of a local hot executor key;
- add hosted backend deployment with secret management and monitoring.
