# Final MVP Roadmap

This document is the source of truth for moving StopDown Loans from mid-submission state to a
final-submission MVP with a working demo.

Current overall progress: **96%**.

## Progress Bar

```text
[###################-] 96%
```

## Area Status

| Area | Current progress | Status | What blocks completion |
| --- | ---: | --- | --- |
| Smart contracts | 98% | The principal-based build is deployed and bytecode-verified; a fresh loan was collateralized, funded, keeper-activated, and settled through the CLOB on ARC. | Production security review and operational role separation. |
| Backend / CLOB / keeper | 96% | Orderbook, matching, persistence, WebSocket feed, executor settlement, reconciliation, retry handling, PostgreSQL rate limits, reviewer DB reset, and production-container smoke verification exist. | Hosted run with production credentials and monitoring evidence. |
| Frontend | 93% | Role/detail/list screens, pagination, injected wallet, Circle user-controlled wallet provider, and lifecycle-specific loan actions exist and pass production-bundle runtime checks. | Real Circle OAuth walkthrough and external-browser pass on the hosted URL. |
| Demo launch | 94% | Local happy paths pass and the current ARC deployment has a confirmed backend-CLOB trade with indexed API state. | Configured public URL and browser wallet-to-trade verification. |
| Production/deployment story | 90% | A production Docker image, same-origin frontend/API/WebSocket server, Render Blueprint, managed PostgreSQL plan, safe reconciliation bootstrap, and local container smoke test are implemented. | Public deployment and external browser verification. |
| ARC integration | 97% | Current contracts pass wiring/bytecode verification and a fresh loan, keeper activation, CLOB settlement, and reconciliation are confirmed on ARC. App Kit has an estimate-first USDC send flow. | Repeat through the hosted browser UI and move beyond the public RPC for production. |
| Circle integration | 88% | Social Login, ARC EOA creation, protocol transaction challenges, status polling, and EIP-712 order/cancel signing are implemented outside the matching core. | Verify the full path with real Circle/Google credentials; gas sponsorship remains optional. |
| Docs / final materials | 97% | README, specs, runbooks, roadmap, submission pack, current/historical ARC evidence, and release preflight are synchronized. | Insert final presentation link and live URL. |

## Verified Work And Current Regression Gate

- The principal-based build is deployed on ARC and verified by contract wiring, ownership,
  operator authorization, and runtime bytecode hashes.
- Current `LOAN_ID=1` was collateralized, funded, keeper-activated, and traded through the backend;
  `trade_id=1` was reconciled as `CONFIRMED` on ARC.
- A historical ARC loan was created, collateralized, funded, activated, and traded before the
  principal-based collateral correction.
- Production startup now verifies runtime bytecode hashes and refuses stale contract addresses.
- Backend CLOB settlement on ARC was confirmed through `trade_id=1` on a clean reviewer database.
- Fixed backend executor signing so public ARC RPC receives raw signed transactions instead of `eth_sendTransaction`.
- Added a regression test for that executor signing path.
- Added `db:reset:reviewer -- --yes` for clean reviewer PostgreSQL state.
- Added frontend ARC chain registration fallback through `wallet_addEthereumChain`.
- Updated ARC/Circle integration boundaries and current evidence docs.
- Added a hackathon submission pack with ARC/Circle alignment, demo order, and 3-minute video script.
- Added and verified an ARC App Kit estimate-first USDC send command.
- Added a production Docker image, same-origin frontend/API/WebSocket serving, and a Render Blueprint.
- Added safe reconciliation bootstrap for a fresh production database and refused unsafe ambiguous startup.
- Pinned the Node/npm/TypeScript build toolchain, regenerated a cross-platform lockfile, and passed a
  clean production Docker build plus container HTTP/UI smoke test against PostgreSQL.
- Added and passed `release:check`, removed production ARC scripts' dependency on `MockUSDC`, and
  limited loan-detail actions to valid lifecycle states.

## Why This Is Not 100% Yet

- The live ARC browser-wallet happy path is not fully verified from the frontend.
- Circle code is implemented, but real Google OAuth and ARC transaction execution are not yet verified.
- ARC App Kit is implemented as an operator/reviewer funding command, not retail wallet UI.
- The hosted deployment has not yet been created and verified from an external browser.
- Final submission still needs a 3-minute video or presentation link.
- The frontend is functional, but not yet polished enough to be treated as a finished product UI.

## Milestones

| Milestone | Meaning | Required evidence |
| --- | --- | --- |
| 80% | Technical MVP is coherent, but demo still needs guidance. | Roadmap is current, docs link to correct runbooks, and known limitations are honest. |
| 85% | One happy path works locally or on ARC testnet. | A clean command sequence produces a visible loan, market, trade, and resolution state. |
| 90% | Frontend is understandable to a new reviewer. | Borrower, lender, trader, loan detail, market detail, and portfolio flows are separated and readable. |
| 95% | Reviewer can run the demo by following instructions. | Demo launch guide includes setup, wallets, expected screens, expected API checks, fallback paths, and clean DB reset. |
| 100% | Final submission is ready. | Demo, docs, final deck/video, production plan, ARC/Circle story, and known placeholders are consistent. |

## Required Work To Reach 100%

1. Run the clean reviewer path.
   - Reset PostgreSQL with `npm.cmd run db:reset:reviewer -- --yes`.
   - Start live CLOB backend and frontend.
   - Register the current active ARC market.
   - Verify health, WebSocket feed, order submission, settlement, and reconciliation.

2. Verify the browser-wallet UI path.
   - Connect an injected EVM wallet.
   - Use the ARC chain-add fallback if ARC is missing from the wallet.
   - Create or inspect a loan.
   - Fund, trade, and inspect portfolio/readiness screens.

3. Finish ARC integration story.
   - Publish only corrected deployment addresses and the corresponding active demo market.
   - Use the frontend ARC chain-add fallback in the browser-wallet walkthrough.
   - Keep the implemented ARC App Kit estimate-first fund-flow command in the reviewer walkthrough.
   - Keep ARC framed as settlement infrastructure and USDC-native wallet/onboarding infrastructure.

4. Verify Circle integration.
   - Configure Circle App ID/API key and Google OAuth redirect URI.
   - Create or load an ARC Testnet EOA through Social Login.
   - Execute one protocol transaction and one EIP-712 order signature.
   - Keep gas sponsorship and executor custody outside this verification.

5. Final publication pass.
   - README top-level final demo path.
   - Hackathon submission pack.
   - Final demo guide.
   - Known limitations.
   - Final presentation/demo notes.
   - Secrets, ignored files, stale addresses, and unsupported claims check.

## Explicit Placeholders

These are acceptable for final submission only if they are clearly labeled:

- production security review;
- governance and upgradeability;
- production oracle policy;
- full hosted production deployment;
- production-grade indexer;
- Circle gas sponsorship;
- Circle Gas Station / Paymaster sponsorship;
- retail ARC App Kit UI beyond the implemented estimate-first funding command;
- market-maker tooling beyond EIP-712 order signing;
- advanced loan negotiation and multiple markets per loan.

## Current Next Step

Prepare final-submission material around the strongest verified path:

1. deterministic local proof with `demo:happy-path`;
2. reviewer UI fallback with `demo:reviewer`;
3. ARC evidence through deployed contracts and confirmed CLOB settlement;
4. implemented Circle Social Login with an honest real-credential verification and Gas Station placeholder story.

Do not raise progress again until one of these is actually verified or recorded.
