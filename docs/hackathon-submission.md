# ARC Hackathon Submission Pack

This document is the single reviewer-facing checklist for ARC Hackathon submission material.

## Submission Links

Fill these before final submission:

| Field | Value |
| --- | --- |
| Repository | Add the public GitHub repository URL in the submission form |
| Demo video or presentation | Add the final video or presentation URL in the submission form |
| Live frontend URL | Optional; add only if hosted before final submission |
| ARC deployment evidence | `docs/arc-testnet-deployment.md` |
| Final demo guide | `docs/final-demo-guide.md` |
| Known limitations | `docs/known-limitations.md` |

## One-Line Description

StopDown Loans is a prediction-backed lending MVP on ARC where each fixed-rate loan creates a
YES/NO repayment market, allowing traders to price and hedge borrower repayment risk while lenders
fund the loan.

## Best Submission Angle

Primary angle: **DeFi on ARC through prediction-backed credit markets**.

Do not lead with wallet tooling. Wallets and gas UX are important, but the differentiated product is
credit risk pricing through loan-linked outcome markets. Circle and ARC should be presented as the
stablecoin settlement and onboarding stack that makes this product practical.

## Problem

Traditional crypto lending usually treats collateral and risk pricing as separate systems. A
borrower either overcollateralizes or cannot borrow. StopDown connects lending to an outcome market:
the market for "will this loan be repaid on time?" gives traders a direct way to price default risk,
and gives borrowers a path to sell YES exposure after posting collateral.

## What The MVP Demonstrates

- Borrower creates a loan with `principal`, `interestBps`, `collateralBps`, and deadlines.
- Borrower deposits loan-linked collateral.
- Lenders fund the principal and receive transferable lender positions.
- Loan activation atomically releases principal and activates the linked YES/NO market.
- Borrower receives transferable YES shares; the loan contract receives NO shares.
- Any trader can deposit pair collateral and mint equal YES/NO pairs after activation.
- Signed CLOB orders are matched by the backend and settled by `OutcomeExchange` on ARC.
- If repayment arrives on time, YES redeems for `1 USDC` each and NO redeems for `0`.
- If repayment is missing or late, NO redeems for `1 USDC` each and YES redeems for `0`.
- Lenders claim from the same loan recovery pool, whether funds come from repayment or redeemed NO.

## ARC Integration

Implemented:

- The principal-based Solidity contracts are deployed on ARC testnet and verified by wiring,
  ownership, operator authorization, and runtime bytecode hashes.
- ARC USDC is the lending, collateral, repayment, outcome redemption, and exchange settlement asset.
- The frontend includes an injected-wallet ARC chain registration fallback through
  `wallet_addEthereumChain`.
- The backend CLOB executor submitted a real ARC settlement transaction and reconciled it as
  confirmed.
- ARC App Kit is integrated through an estimate-first ARC USDC funding command for operators and
  reviewers.

Evidence:

- Contracts and transaction hashes: `docs/arc-testnet-deployment.md`.
- Live ARC runbook: `docs/arc-testnet-runbook.md`.
- Current reviewer loan: `LOAN_ID=1`.
- Current reviewer market:
  `0x6e8253fd6ce77d36451771ac0e198053588fc1bb3cc48cb9a5cbbe0e838563c7`.
- Current confirmed CLOB settlement:
  `0x1ad1d471c2794dbdc4debd340681902ab436fa1a549fe3a1d38a4a51e0187c44`.
- Historical reviewer loan: `LOAN_ID=3`.
- Historical reviewer market:
  `0x1489a4e8bf6c349a62c1892e03c1206051f11bac3bdf1adaba8aaa6800322ea1`.

Remaining ARC work:

- repeat the current confirmed path from the hosted public frontend with a reviewer wallet;
- expand the existing App Kit command into optional retail onboarding and unified balance UI;
- move from public RPC to a production-grade RPC/indexer setup for live UI demos and operations.

## Circle Integration

Circle is intentionally scoped as a wallet and gas UX layer, not as matching-core infrastructure.

Implemented now:

- wallet architecture is separated so the backend does not store user private keys;
- EIP-712 signed order format is wallet-agnostic;
- Circle User-Controlled Wallets and Paymaster/Gas UX boundaries are documented.
- Circle Social Login initializes an ARC Testnet EOA without exposing user keys to StopDown.
- Circle challenge APIs execute protocol calls and sign the existing EIP-712 CLOB order format.

Still to verify or add:

- verify the Social Login and transaction path with real hosted credentials;
- keep market makers free to use their own bot signers;
- add gas sponsorship only after ARC support and policy constraints are verified.

Do not claim Circle Gas Station/Paymaster or production credential verification is complete.

## Demo Order For Reviewers

1. Run deterministic local proof:

```powershell
corepack npm ci
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run demo:happy-path
```

2. Inspect frontend without wallet dependency:

```powershell
npm.cmd run demo:reviewer
```

Open:

```text
http://127.0.0.1:5173/#overview
```

3. Verify live ARC readiness:

```powershell
npm.cmd run arc:live-check
```

Use `docs/arc-testnet-runbook.md` for required `.env` values and conservative RPC settings.

## Three-Minute Video Script

### 0:00-0:25 - Product Problem

Crypto lending usually requires high collateral because repayment risk is hard to price. StopDown
turns each loan into a repayment prediction market, so risk can be traded, insured, and observed.

### 0:25-0:55 - Concrete Example

Borrower requests `1,000 USDC`, chooses `5%` interest and `100%` collateral ratio. Required repayment
is `1,050 USDC`, while borrower posts `1,000 USDC` because collateral ratio is based on principal. When the loan activates,
borrower receives YES shares and the loan contract receives NO shares.

### 0:55-1:25 - Why It Is Useful

Borrower can sell YES shares to recover part of the posted collateral value. YES buyers take
repayment exposure. Lenders receive fixed-rate loan positions and default recovery through the NO
side. Traders get a clean market for borrower repayment risk.

### 1:25-2:10 - Technical Demo

Show:

- separated borrower, lender, exchange, and portfolio screens;
- one loan detail and its linked market detail;
- CLOB orderbook and signed limit order submission;
- local `demo:happy-path` output;
- ARC deployment evidence and current settlement transaction.

### 2:10-2:40 - ARC And Circle

ARC is the settlement chain and ARC USDC is the protocol asset. Circle Social Login provides the
optional retail ARC wallet and signs the existing EIP-712 format; Gas Station remains future work.

### 2:40-3:00 - Honest MVP Boundary

This is not production-ready. The MVP proves contracts, outcome settlement, CLOB matching, ARC
deployment, and a reviewer UI path. Remaining work is hosted Circle credential verification,
production RPC/indexer, monitoring, and security review.

## Claims To Avoid

- Do not claim production readiness.
- Do not claim Circle has been verified with production credentials yet.
- Do not claim the fixture-backed UI path proves live ARC settlement.
- Do not claim public ARC RPC is production-grade enough for operations.
- Do not imply the backend stores user private keys.

## Final Pre-Submit Checklist

- Repository is public or accessible to reviewers.
- `.env`, private keys, caches, build artifacts, and `node_modules` are not committed.
- `README.md` links to this document, final demo guide, known limitations, and ARC evidence.
- `corepack npm run release:check` passes contracts, backend, builds, production audit, Docker, and
  Git whitespace checks.
- Demo video or presentation link is added above.
- Optional live frontend URL is added above if available.
