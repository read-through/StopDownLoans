# StopDown Loans Submission Text

StopDown Loans is a prediction-backed lending MVP on ARC. A borrower creates a fixed-rate loan, posts repayment-linked collateral, and receives transferable YES outcome shares for the question of whether the required repayment arrives before the deadline. Lenders fund the loan in parts and receive transferable lender positions, while traders can buy or sell YES/NO exposure through signed limit orders settled on-chain.

The current prototype includes Solidity contracts for loan positions, outcome tokens, and on-chain order settlement; a TypeScript CLOB backend for signed order admission, matching, reservations, reconciliation, and WebSocket book updates; and a Vite/React frontend with separate screens for creating loans, reviewing loans, viewing one loan, viewing all markets, trading one market, and portfolio actions.

The local backend smoke path also runs against Docker PostgreSQL: migrations, schema checks, HTTP
read endpoints, best bid/ask, book reads, and WebSocket subscription all pass through
`npm.cmd run smoke:backend:local`.

ARC is used as the settlement chain. The contracts are deployed on ARC testnet:

- `LoanPositionToken`: `0x4f8e2d32ad62835353b70f2fa091979d513a43ac`
- `OutcomeToken`: `0x06c08af6a3ad503560f3010105f1ec32052c7f2f`
- `OutcomeExchange`: `0xddba15b2ddadec73f06fab4011b37c100efe6c30`
- ARC USDC: `0x3600000000000000000000000000000000000000`

The current contracts were redeployed after the borrower-controlled `collateralBps` source change.
A fresh current-deployment ARC walkthrough created `LOAN_ID=3` with principal `1 USDC`,
repayment `1.05 USDC`, and borrower collateral `1.05 USDC`. The linked market is
`0x1489a4e8bf6c349a62c1892e03c1206051f11bac3bdf1adaba8aaa6800322ea1`. That loan was created,
collateralized, funded, and activated on ARC. On a clean reviewer database, the backend CLOB
admitted/matched signed orders into `trade_id=1`; the executor submitted settlement tx
`0x532c31c774c0cd96b1c5aa0e5f3f606a26631dd60f28b2cd625dbf83f3d1f15c`, which was reconciled as
`CONFIRMED`.

Important transaction hashes:

- Create loan: `0x20ee75626f7d0b36eae19c0ccd1e4876f76459f0c25d338b01b7edef0b1aee25`
- Deposit borrower collateral: `0xd58afa4f343d4390bf1be5ac2de8b5bd3f088db663468e90429e8380e9ffd17e`
- Fund loan: `0x8714023addb75b33efa59e8c870f2e0b170e8667497327b531d09d9ceddb28a6`
- Activate loan and market: `0x98dec90ed4d25cec4a6b2ab633a7720852579083df2db04fa3eef820a2be3a6f`
- CLOB backend settlement trade: `0x532c31c774c0cd96b1c5aa0e5f3f606a26631dd60f28b2cd625dbf83f3d1f15c`

For reviewers without an injected ARC wallet, the repo includes a local UI demo path:

```powershell
corepack npm ci
npm.cmd run demo:api
npm.cmd run demo:frontend
```

This opens a fixture-backed reviewer API plus a mock-wallet frontend flow. The mock signer is only a reviewer/demo helper and is centralized under `mocks/`; it is not a custody model and is not intended for production.

Circle User-Controlled Wallet Social Login is implemented as an optional retail path for borrowers, lenders, and traders. It creates an ARC Testnet EOA, executes protocol calls through user-approved Circle challenges, and signs the same EIP-712 orders as injected wallets; StopDown never receives the user key. Circle Gas Station / Paymaster remains future gas UX work. Market makers can use any compatible signer. ARC App Kit is integrated through an estimate-first ARC USDC funding command and remains outside matching.

Known placeholders: the reviewer API fallback uses local fixtures, the production backend is not hosted, Circle Social Login still needs a real hosted-credential walkthrough, keeper/oracle operations are not productionized, and full security/auth/governance hardening is outside this MVP. PostgreSQL-backed login rate limiting is implemented, but it is not a substitute for a full abuse-control review.
