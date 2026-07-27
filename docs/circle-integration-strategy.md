# Circle Integration Strategy

This document defines where Circle belongs in StopDown Loans and what is intentionally left out of
the current MVP implementation.

## Decision

Circle is a wallet and gas UX layer, not part of the matching engine.

The CLOB backend remains wallet-agnostic:

- users sign EIP-712 orders;
- users submit loan/outcome transactions from their own wallet;
- backend verifies signatures and submits matched orders through the exchange executor;
- backend does not store user private keys.

This keeps the protocol compatible with injected wallets, bot signers, custody providers, and Circle
wallets at the same time.

## Product Roles

| Role | MVP path | Circle target | Why |
| --- | --- | --- | --- |
| Borrower | Injected EVM wallet on ARC | Circle User-Controlled Wallet | Borrower needs understandable onboarding and explicit approval for loan creation, collateral deposit, repayment, and YES trading. |
| Lender | Injected EVM wallet on ARC | Circle User-Controlled Wallet | Lender should own the wallet and approve funding/claim actions directly. |
| Retail YES/NO trader | Injected EVM wallet on ARC | Circle User-Controlled Wallet plus possible gas sponsorship | Retail traders benefit from embedded wallet UX and fewer gas-token steps. |
| Market maker | Any EIP-712 capable signer | Optional only | Market makers need low-latency automated signing and should not be forced through an embedded retail wallet. |
| Backend executor | Local operator key in MVP | Future managed custody/HSM/Circle Developer-Controlled Wallet if suitable | Executor only submits matched signed orders and keeper transactions; it does not custody user funds. |

## User-Controlled Wallet Path

Circle User-Controlled Wallets are the preferred future path for non-power users.

Expected behavior:

1. User signs in through the Circle-supported auth flow.
2. Frontend obtains the user's wallet address.
3. Frontend shows ARC network, USDC balance, gas readiness, and allowance status.
4. User approves the same contract calls used by the injected-wallet path.
5. User signs the same EIP-712 order payloads used by the injected-wallet path.
6. Backend receives signed orders through the existing `POST /v1/orders` API.

The important engineering boundary is that Circle replaces the wallet UX, not the order format.

## Gas UX Path

Circle Gas Station or Paymaster is a future UX improvement.

Potential use cases:

- sponsor gas for retail users creating small orders;
- reduce onboarding friction for users who hold ARC USDC but not enough native gas;
- keep market entry smoother for borrowers and lenders.

This should be added only after confirming the exact ARC testnet/mainnet support, account type
requirements, and policy controls for the contracts used by StopDown.

## Executor Path

The current backend executor is a hot operator key configured by `EXECUTOR_PRIVATE_KEY`.

Accepted MVP trade-off:

- simple to run locally;
- easy to verify on ARC testnet;
- executor cannot fabricate user intent because `OutcomeExchange` requires maker signatures;
- executor compromise is still operationally serious because it can submit allowed keeper/exchange
  transactions and spend its own gas.

Future alternatives:

- managed custody or HSM-backed signer;
- Circle Developer-Controlled Wallet if transaction latency, chain support, and signing workflow fit;
- multi-operator setup with monitoring and emergency disable procedures.

## What Must Not Happen

- StopDown backend must not store retail user private keys.
- Circle integration must not introduce a second order format.
- Market makers must not be forced into the retail wallet path.
- Demo mock signer must not be described as custody, wallet security, or live protocol behavior.
- Gas sponsorship must not hide contract approvals, order signing, or repayment obligations from the
  user.

## Implementation Placeholder

Current status:

- implemented: injected-wallet path;
- implemented: backend executor key path;
- implemented: centralized demo mock signer for no-wallet UI review;
- documented: Circle User-Controlled Wallet target;
- documented: Circle gas UX target;
- not implemented: Circle frontend onboarding/signing;
- not implemented: Circle gas sponsorship;
- not implemented: managed executor custody.

Before implementing Circle in code, decide one concrete product flow:

- borrower onboarding;
- lender onboarding;
- retail trader onboarding;
- gas sponsorship;
- executor custody.

Do not implement all of them at once.
