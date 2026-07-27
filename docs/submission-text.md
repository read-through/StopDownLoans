# StopDown Loans Submission Text

StopDown Loans is a prediction-backed lending MVP on ARC. A borrower creates a fixed-rate loan, posts repayment-linked collateral, and receives transferable YES outcome shares for the question of whether the required repayment arrives before the deadline. Lenders fund the loan in parts and receive transferable lender positions, while traders can buy or sell YES/NO exposure through signed limit orders settled on-chain.

The current prototype includes Solidity contracts for loan positions, outcome tokens, and on-chain order settlement; a TypeScript CLOB backend for signed order admission, matching, reservations, reconciliation, and WebSocket book updates; and a Vite/React frontend with separate screens for creating loans, reviewing loans, viewing one loan, viewing all markets, trading one market, and portfolio actions.

The local backend smoke path also runs against Docker PostgreSQL: migrations, schema checks, HTTP
read endpoints, best bid/ask, book reads, and WebSocket subscription all pass through
`npm.cmd run smoke:backend:local`.

ARC is used as the settlement chain. The contracts are deployed on ARC testnet:

- `LoanPositionToken`: `0x7e1a9611f61a40fac7e2f18831a13edf9e8d25e6`
- `OutcomeToken`: `0xfb5d4095bc502bd0774d8e4437b94573fd29028c`
- `OutcomeExchange`: `0x45333a5b06a95a2a84cea9ab67f486558943c626`
- ARC USDC: `0x3600000000000000000000000000000000000000`

The ARC walkthrough created `LOAN_ID=1` with principal `1 USDC`, repayment `1.05 USDC`, and borrower collateral `1.05 USDC`. The linked market is `0xc3851385000c2d86f34b031cfa5e672e6651cce7d7af2fc3e0c9b3365fda5427`. The loan was created, collateralized, funded, and activated on ARC, and a direct on-chain `OutcomeExchange` trade sold `0.2 YES` for `0.12 USDC`.

Important transaction hashes:

- Create loan: `0xe34f44bb2a6f42895f2d5d1a8308c9d8ba3c04988e42c349c434b62ae3618930`
- Deposit borrower collateral: `0xa13db8e54f22f8b23f7cdac4b817259e106d531549fcc51d1641d573c9f8e6e4`
- Fund loan: `0xe88c06dc5d28300eb85f525a763e79f552479c8e14f1043c200808ae5a469c42`
- Activate loan and market: `0x66a7137e344411332ae4a80c41e0120f1f52c3567a5725375de2572fe069a308`
- Trade `0.2 YES`: `0x4fe309716988dd0f30857683f0661c2d4698bcdc7c0789d375d99cf6a4499551`

For reviewers without an injected ARC wallet, the repo includes a local UI demo path:

```powershell
npm.cmd install
npm.cmd run demo:api
npm.cmd run demo:frontend
```

This opens a fixture-backed reviewer API plus a mock-wallet frontend flow. The mock signer is only a reviewer/demo helper and is centralized under `mocks/`; it is not a custody model and is not intended for production.

Circle User-Controlled Wallets are planned as the recommended retail wallet path for borrowers, lenders, and traders. Circle Gas Station / Paymaster is the planned gas UX layer after ARC/account support is verified. The backend remains wallet-agnostic: users sign EIP-712 orders and transactions from their own wallet, and market makers can use any compatible signer. ARC kits are planned for onboarding/frontend/deployment ergonomics where they reduce product friction; the current MVP already uses ARC as the settlement chain and ARC USDC as the protocol asset.

Known placeholders: the reviewer API uses local fixtures instead of indexed live ARC state, the production backend is not hosted, the browser UI has not yet been exercised end-to-end with a real ARC wallet, keeper/oracle operations are not productionized, and security/auth/rate-limiting/governance are intentionally outside this MVP.
