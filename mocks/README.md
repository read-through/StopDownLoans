# StopDown Mock Layer

This is the single registry and control surface for non-production mocks and demo-only substitutes.

Mocks may still have implementation files near the layer that uses them, but every mock must be
registered here with:

- purpose;
- implementation path;
- activation switch;
- production status.

Production-like ARC testing must run with every optional mock disabled, except contracts that are
explicitly deployed as testnet demo assets.

## Active Registry

| Mock | Type | Implementation | Activation | Production status |
| --- | --- | --- | --- | --- |
| frontend mock wallet | frontend runtime signer | `mocks/frontend/mockWallet.ts`, installed through `mocks/frontend/main.demo.tsx` | `npm.cmd run demo:frontend` / Vite `--mode demo` with `VITE_ENABLE_MOCK_WALLET=true` | disabled by default; never production |
| demo CLOB API | backend demo server | `mocks/backend/serve-demo-api.ts` | `npm.cmd run demo:api` | local reviewer/demo only |
| MockUSDC | Solidity test/demo token | `mocks/contracts/MockUSDC.sol` | Hardhat tests/local demos/testnet demo deploys | replace with real ARC USDC for production-like deploys |
| MockOutcomeToken | Solidity test double | `mocks/contracts/MockOutcomeToken.sol` | Hardhat lending tests | tests only |
| local demo scripts | scripted local scenarios | `scripts/demo-local-*.ts` | `npm.cmd run demo:local:*` | local verification only |

## Rules

- New mocks must be added to this registry before being used.
- Optional runtime mocks must be off by default in `.env.example`.
- Mocks must use obvious names: `mock`, `demo`, or `test`.
- No user private keys belong in mocks.
- Public demo private keys are allowed only when clearly labeled as public demo data.
- Full ARC validation path is deployment + real wallet + real backend config.
- Production frontend entrypoint is `frontend/src/main.tsx`; it must not import `mocks/*`.
- Demo frontend entrypoint is `mocks/frontend/main.demo.tsx`; it is the only allowed frontend entrypoint that may install frontend mocks.
