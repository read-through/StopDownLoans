# Known Limitations And Cleanup List

This document separates intentional MVP shortcuts from finished protocol behavior.

## Must Fix After Mid-Submission

- The principal-based ARC deployment now has a confirmed loan/CLOB walkthrough, but the same path
  is not yet verified from the hosted public frontend with a reviewer-controlled wallet.

| Priority | Area | Current shortcut | Why it exists | Better target |
| --- | --- | --- | --- | --- |
| 10 | Real wallet frontend walkthrough | ARC contracts, a demo loan, activation, direct on-chain YES trade, and the Circle provider code are verified, but a hosted Social Login path still needs real credentials. | OAuth and Circle application configuration are deployment-specific. | Repeat create/fund/activate/trade from the public UI with a Circle or injected ARC wallet. |
| 9 | Production backend deployment | The production Docker image now builds and serves frontend/API against local PostgreSQL, but it is not deployed as a hosted service. | MVP submission focuses on repo, contracts, ARC evidence, and local reproducibility. | Deploy the existing image with managed PostgreSQL, RPC configuration, operator key management, monitoring, and logs. |
| 9 | Public ARC RPC rate limiting | List pages now read loan/market data from PostgreSQL snapshots and HTTP surfaces `RATE_LIMITED` as a `429`, but live admission, settlement simulation, reconciliation, keepers, and snapshot sync still depend on ARC RPC. | Public endpoint throttling affects contract reads and transaction simulation. | Use a less rate-limited ARC RPC endpoint or hosted/backend-owned node setup for the live browser trading walkthrough. |
| 8 | Circle wallet verification | Circle Social Login, ARC EOA creation, contract challenges, and EIP-712 signing are implemented, but not yet exercised with production Circle/Google credentials. | Credentials and redirect configuration are deployment-specific secrets. | Verify one complete login, protocol transaction, and signed order on the public demo. |
| 8 | Circle gas UX | Gas sponsorship / Paymaster flow is not implemented. | Needs exact ARC support, account-type constraints, and policy setup before coding. | Add Circle Gas Station or Paymaster only as a UX layer around existing user transactions, not as matching-core logic. |
| 8 | Keeper/operator deployment | Keeper logic exists, but production operator deployment/monitoring is not complete. | MVP focuses on lifecycle behavior, not operations. | Add operator runbook, monitoring, alerts, and failure recovery procedures. |
| 7 | Oracle/repayment monitoring | Repayment/default can be triggered by functions/keeper logic, but production repayment wallet monitoring is not complete. | Strict MVP resolves based on credited funds and deadlines. | Add production repayment wallet monitoring, indexing, and operational visibility. |
| 7 | Demo API | `mocks/backend/serve-demo-api.ts` returns fixture-backed read data and does not accept wallet transactions. | It lets reviewers inspect screens without live ARC deployment or funded wallets. | Use the real CLOB backend connected to PostgreSQL, ARC RPC, deployed contracts, and keeper/executor configuration for production-like UI testing. |
| 6 | Security controls | Owner/operator model, auth, rate limits, abuse controls, and audit are not production-ready. | Governance/security hardening was explicitly out of MVP scope. | Add access-control review, rate limiting, monitoring, security review, and audit. |

## Intentional MVP Boundaries

- Off-chain orderbook: contracts settle signed orders, but do not store the orderbook.
- Loan/market list reads use a PostgreSQL snapshot model. This reduces frontend RPC pressure, but a production indexer is still the stronger long-term source of truth.
- Fixed-rate lending: borrower creates the loan request; negotiated offers can be added later at the frontend/backend layer.
- One market per loan for now: future versions can add multiple repayment events per loan.
- USDC integer accounting: frontend/backend APIs use base-unit integer strings and integer `priceUnits`, not floats.
- Non-wallet test/demo substitutes are centralized under `mocks/`; the frontend has no mock signer.
- ARC testnet evidence is recorded in `docs/arc-testnet-deployment.md`; the active demo loan is intentionally left unresolved so the market can still be inspected.
- Wallet paths are separated in `docs/wallet-path.md`: injected wallet, Circle retail wallet, backend executor, and market maker.
- Circle integration scope is separated in `docs/circle-integration-strategy.md`: wallet UX, gas UX, and possible executor custody are separate decisions.

## Not Mocks

Test-local fakes such as `fakePublicClient`, `fakeWalletClient`, and `dummyInput` remain inside unit tests.
They are not runtime/demo mocks and should not be treated as product behavior.
