# ARC Testnet Deployment

Deployment date: 2026-07-25

Network:

- Chain: ARC Testnet
- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- USDC / collateral token: `0x3600000000000000000000000000000000000000`

Deployer:

- Address: `0xe546fa32c2cD91A815fe6f4B24EDeBd74D2201Ca`

Contracts:

- `LoanPositionToken`: `0x7e1a9611f61a40fac7e2f18831a13edf9e8d25e6`
- `OutcomeToken`: `0xfb5d4095bc502bd0774d8e4437b94573fd29028c`
- `OutcomeExchange`: `0x45333a5b06a95a2a84cea9ab67f486558943c626`

Verified wiring:

- `LoanPositionToken.outcomeToken == OutcomeToken`
- `LoanPositionToken.usdc == ARC USDC`
- `OutcomeToken.loanPositionToken == LoanPositionToken`
- `OutcomeToken.collateralToken == ARC USDC`
- `OutcomeExchange.usdc == ARC USDC`
- deployer is `LoanPositionToken.owner`
- deployer is `OutcomeExchange.owner`
- deployer is authorized as `OutcomeExchange` operator

## Demo Loan Evidence

Demo executed on 2026-07-25 with the deployer wallet acting as the borrower and a lender for the
smallest ARC walkthrough.

Loan parameters:

- Principal: `1 USDC` (`1000000` base units)
- Interest: `5%` (`500` bps)
- Required repayment: `1.05 USDC` (`1050000` base units)
- Borrower collateral: `1.05 USDC` (`1050000` base units)
- One loan maps to one market

Created loan:

- `LOAN_ID`: `1`
- `MARKET_ID`: `0xc3851385000c2d86f34b031cfa5e672e6651cce7d7af2fc3e0c9b3365fda5427`

Transactions:

| Step | Transaction |
| --- | --- |
| Create loan | `0xe34f44bb2a6f42895f2d5d1a8308c9d8ba3c04988e42c349c434b62ae3618930` |
| Approve borrower collateral | `0x9960aff18ac84dbc8b05c08260716004b2afe137fcb68e34aeab4dbdbd3c284e` |
| Deposit borrower collateral | `0xa13db8e54f22f8b23f7cdac4b817259e106d531549fcc51d1641d573c9f8e6e4` |
| Approve lender funding | `0xcbc87bd5cea8c0e9f8aaee104e771720b86efaa1ee0b2db789600c63281e23ae` |
| Fund loan | `0xe88c06dc5d28300eb85f525a763e79f552479c8e14f1043c200808ae5a469c42` |
| Activate loan and market | `0x66a7137e344411332ae4a80c41e0120f1f52c3567a5725375de2572fe069a308` |

After activation, `LoanPositionToken.getLoanView(1).state == 2`, meaning `Active`.

## Demo Trade Evidence

The active loan market was also tested through direct `OutcomeExchange.matchOrders` settlement:
borrower sold `0.2 YES` for `0.12 USDC` to a temporary buyer wallet.

Trade transaction:

- `0x4fe309716988dd0f30857683f0661c2d4698bcdc7c0789d375d99cf6a4499551`

Observed deltas:

- Seller YES delta: `-0.2`
- Buyer YES delta: `+0.2`
- Buyer USDC delta: `-0.12`
- Seller USDC delta before gas accounting: `+0.12`
- Seller/operator paid ARC gas for the settlement transaction, so the measured wallet delta was
  lower by gas cost.

This trade was intentionally executed through a script instead of the CLOB backend to isolate the
on-chain settlement check for the already-active loan market. The backend CLOB remains the product
path for orderbook, matching, persistence, reconciliation, and WebSocket updates.

## Live CLOB Backend Evidence

On 2026-07-26, the executor wallet was funded and verified:

- Executor/operator: `0x147a9B1454e4aC1c23d75cD476B5969a568E94f3`
- `arc:live-check` passed database, ARC chain id, operator permission, executor gas balance,
  backend health/sync, linked loan context, and WebSocket book feed checks.

A fresh active loan was created for backend CLOB checks:

- `LOAN_ID`: `3`
- `MARKET_ID`: `0xd5cf42e5e9cb299e61742c19f6f1958e4e737b22c0ca6b1a31ee86f9fcfe4738`
- Principal: `1 USDC`
- Required repayment and borrower collateral: `1.05 USDC`
- State: `Active`

The CLOB backend admitted/matched at least one live trade candidate, but public ARC RPC throttling
prevented final backend settlement during the local run:

- observed backend trade: `trade_id = 1`
- status: `FAILED`
- failure source: ARC RPC `request limit reached` during settlement simulation

This is recorded as an infrastructure limitation of the public RPC endpoint, not as an on-chain
settlement-contract failure. Direct `OutcomeExchange.matchOrders` settlement on ARC was already
verified above.

Another live loan was created on 2026-07-26 with a longer repayment window for reviewer/frontend
checks:

- `LOAN_ID`: `4`
- `MARKET_ID`: `0xd1ee39ba1234d6fb0a71db25f743d2e22b55bb9a9490986e0537a82526b6b4c8`
- Principal: `1 USDC`
- Required repayment and borrower collateral: `1.05 USDC`
- Intended use: active reviewer market for frontend and CLOB checks

Local env values were written to ignored `.env` files after deployment. Keep private keys out of git
and use `.env.example` only as a template.
