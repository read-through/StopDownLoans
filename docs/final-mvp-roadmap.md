# Final MVP Roadmap

This document is the source of truth for moving StopDown Loans from mid-submission state to a
final-submission MVP with a working demo.

Current overall progress: **96%**.

## Progress Bar

```text
[#########.] 96%
```

## Area Status

| Area | Current progress | Status | What blocks completion |
| --- | ---: | --- | --- |
| Smart contracts | 95% | Lending, outcome token, and exchange settlement contracts are tested locally and deployed on ARC. Current ARC loan/trade evidence exists. | Real browser-wallet walkthrough and optional live repay/default evidence. |
| Backend / CLOB / keeper | 92% | Orderbook, matching, persistence, WebSocket feed, executor settlement, reconciliation, retry handling, and reviewer DB reset exist. | Clean reviewer run-through from reset to live CLOB confirmation without manual cursor edits. |
| Frontend | 82% | Role screens, loan/market detail screens, pagination states, wallet readiness, and ARC chain-add fallback exist. | Real browser-wallet UI walkthrough and final visual polish. |
| Demo launch | 92% | Reviewer demo wrapper, local happy path, clean DB reset, ARC loan activation, direct trade, and backend CLOB settlement evidence exist. | One clean scripted reviewer sequence and one browser UI pass. |
| Production/deployment story | 70% | Local stack, production boundaries, DB/RPC/keeper/secrets plan, and runbooks are documented. | Hosted frontend/backend decision and stable RPC/indexer choice. |
| ARC integration | 92% | ARC is the settlement chain, ARC USDC is the protocol asset, current contracts are deployed, current live loan/trade evidence exists, and frontend can add ARC chain to wallets. | ARC App Kit remains planned for USDC bridge/send/unified-balance onboarding unless implemented before final submission. |
| Circle integration | 55% | Circle is documented as the recommended retail wallet/gas UX path and kept outside the matching core. Circle typed-data signing and Paymaster/Gas UX boundaries are defined. | Implement one concrete Circle frontend/onboarding flow or keep it explicitly as final-submission placeholder. |
| Docs / final materials | 90% | README, specs, runbooks, final roadmap, final demo guide, production plan, and current ARC evidence are updated. | Final pass for unsupported claims, presentation link/materials, and known limitations. |

## What Moved From 85% To 96%

- Current contracts were redeployed on ARC after borrower-controlled `collateralBps`.
- A fresh ARC loan was created, collateralized, funded, activated, and traded.
- Backend CLOB settlement on ARC was confirmed through `trade_id=1` on a clean reviewer database.
- Fixed backend executor signing so public ARC RPC receives raw signed transactions instead of `eth_sendTransaction`.
- Added a regression test for that executor signing path.
- Added `db:reset:reviewer -- --yes` for clean reviewer PostgreSQL state.
- Added frontend ARC chain registration fallback through `wallet_addEthereumChain`.
- Updated ARC/Circle integration boundaries and current evidence docs.

## Why This Is Not 100% Yet

- The live ARC browser-wallet happy path is not fully verified from the frontend.
- Circle User-Controlled Wallet integration is still a documented target, not implemented frontend code.
- ARC App Kit is still a planned onboarding/fund-flow layer, not implemented in one concrete flow.
- Hosted production deployment and stable RPC/indexer are still planning items.
- Final submission materials still need one last consistency pass.

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
   - Keep current deployment addresses and active demo market visible.
   - Use the frontend ARC chain-add fallback in the browser-wallet walkthrough.
   - Decide whether to implement one ARC App Kit fund-flow demo or keep App Kit as a clearly scoped placeholder.
   - Keep ARC framed as settlement infrastructure and USDC-native wallet/onboarding infrastructure.

4. Finish Circle integration story.
   - Keep Circle outside matching-core logic.
   - Decide whether final submission includes a minimal Circle User-Controlled Wallet signing/onboarding implementation or a documented placeholder.
   - Present Circle User-Controlled Wallets as the recommended retail path.
   - Keep market makers and backend executor wallet-agnostic.

5. Final publication pass.
   - README top-level final demo path.
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
- Circle wallet integration if not implemented before final submission;
- ARC App Kit fund-flow integration if not implemented before final submission;
- market-maker tooling beyond EIP-712 order signing;
- advanced loan negotiation and multiple markets per loan.

## Next Step

The next implementation step is the clean reviewer path, unless we consciously decide to spend time
on one concrete ARC App Kit or Circle Wallet integration before final submission.
