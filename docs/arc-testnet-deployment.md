# ARC Testnet Deployment

Status note: current contract deployment was refreshed after the source change that moved
`collateralBps` into borrower-controlled `createLoan(...)` parameters. Fresh current-deployment
loan, activation, direct settlement, and CLOB-backend settlement evidence is recorded below.

Current deployment date: 2026-08-02

Network:

- Chain: ARC Testnet
- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- USDC / collateral token: `0x3600000000000000000000000000000000000000`

Deployer:

- Address: `0xe546fa32c2cD91A815fe6f4B24EDeBd74D2201Ca`

Contracts:

- `LoanPositionToken`: `0x4f8e2d32ad62835353b70f2fa091979d513a43ac`
- `OutcomeToken`: `0x06c08af6a3ad503560f3010105f1ec32052c7f2f`
- `OutcomeExchange`: `0xddba15b2ddadec73f06fab4011b37c100efe6c30`

Verified wiring:

- `LoanPositionToken.outcomeToken == OutcomeToken`
- `LoanPositionToken.usdc == ARC USDC`
- `OutcomeToken.loanPositionToken == LoanPositionToken`
- `OutcomeToken.collateralToken == ARC USDC`
- `OutcomeExchange.usdc == ARC USDC`
- deployer is `LoanPositionToken.owner`
- deployer is `OutcomeExchange.owner`
- deployer is authorized as `OutcomeExchange` operator
- executor `0x147a9B1454e4aC1c23d75cD476B5969a568E94f3` is authorized as `OutcomeExchange` operator

Current verification:

- `verify:arc-deployment` passed on 2026-08-02.
- executor authorization transaction:
  `0xc651b34bec0c646816cb8c11e37a87be08fe7d8f5785816a55ed8634bf436b85`
- `arc:postdeploy-check` read chain id `5042002` and `LoanPositionToken.nextLoanId = 1`, then hit
  public ARC RPC `request limit reached` on a follow-up read. The deployment wiring check above
  passed; the remaining issue is public RPC quota, not a known contract wiring failure.

## Current Demo Loan Evidence

The current walkthrough was executed on 2026-08-02 with the deployer wallet acting as the borrower
and lender for the smallest ARC walkthrough.

Loan parameters:

- Principal: `1 USDC` (`1000000` base units)
- Interest: `5%` (`500` bps)
- Collateral ratio: `100%` of repayment (`10000` bps)
- Required repayment: `1.05 USDC` (`1050000` base units)
- Borrower collateral: `1.05 USDC` (`1050000` base units)
- One loan maps to one market

Current clean reviewer loan:

- `LOAN_ID`: `3`
- `MARKET_ID`: `0x1489a4e8bf6c349a62c1892e03c1206051f11bac3bdf1adaba8aaa6800322ea1`

Transactions:

| Step | Transaction |
| --- | --- |
| Create loan | `0x20ee75626f7d0b36eae19c0ccd1e4876f76459f0c25d338b01b7edef0b1aee25` |
| Approve borrower collateral | `0x9652e31a6890e18ecce1ea25026f7f22364a0cbdfc4273a1dba4ec3b0838743d` |
| Deposit borrower collateral | `0xd58afa4f343d4390bf1be5ac2de8b5bd3f088db663468e90429e8380e9ffd17e` |
| Approve lender funding | `0x1a618b7670256bdd32ffc2fb4d8ca0e074ee04f1fa6d8387b7794c424e63f41b` |
| Fund loan | `0x8714023addb75b33efa59e8c870f2e0b170e8667497327b531d09d9ceddb28a6` |
| Activate loan and market | `0x98dec90ed4d25cec4a6b2ab633a7720852579083df2db04fa3eef820a2be3a6f` |

After activation, `LoanPositionToken.getLoanView(3).state == 2`, meaning `Active`.

An earlier current-deployment `LOAN_ID=1` was created with a bad PowerShell timestamp source that
shifted the withdraw freeze deadline by roughly three hours. It is left on-chain as harmless
evidence of the timestamp pitfall; use `DateTimeOffset.UtcNow.ToUnixTimeSeconds()` for demo
deadlines.

## Current Direct Settlement Evidence

The active loan market was tested through direct `OutcomeExchange.matchOrders` settlement:
borrower sold `0.2 YES` for `0.12 USDC` to a temporary buyer wallet.

Trade transaction:

- `0xa9e913ee1e5e51a4ec4db687c2cfb7d54c8738b89a62db3a3aadff765c0aff95`

Observed deltas:

- Seller YES delta: `-0.2`
- Buyer YES delta: `+0.2`
- Buyer USDC delta: `-0.12`
- `ORDER_FILLED_EVENTS=2`

## Current CLOB Backend Evidence

The clean reviewer active market was registered in the local CLOB database:

```powershell
npm.cmd run market-config:upsert -- --outcome-token 0x06c08af6a3ad503560f3010105f1ec32052c7f2f --market-id 0x1489a4e8bf6c349a62c1892e03c1206051f11bac3bdf1adaba8aaa6800322ea1 --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

Backend CLOB flow:

- backend admitted the maker SELL order;
- backend admitted the taker BUY order;
- backend matched them into `trade_id = 1` on clean reviewer DB;
- executor submitted settlement tx `0x532c31c774c0cd96b1c5aa0e5f3f606a26631dd60f28b2cd625dbf83f3d1f15c`;
- backend reconciliation marked `trade_id = 1` as `CONFIRMED`.

During this run, an executor bug was found and fixed: the backend had been passing an address-only
account from simulation into `walletClient.writeContract`, causing public ARC RPC to receive
`eth_sendTransaction`. The executor now overrides the write request with its local private-key
account, so viem signs locally and sends a raw transaction.

The local database also contained old demo cursors and mock orders from previous runs. For this
specific run, the `outcome_exchange_events` cursor was moved to the block before the fresh CLOB tx
so reconciliation could process the current evidence immediately. A clean reviewer database avoids
that manual cursor recovery.

## Historical Demo Loan Evidence

The evidence below was executed against the previous deployment and is kept as historical protocol
evidence.

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
