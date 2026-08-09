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
| demo CLOB API | backend demo server | `mocks/backend/serve-demo-api.ts` | `npm.cmd run demo:api` | local reviewer/demo only |
| MockUSDC | Solidity test/demo token | `mocks/contracts/MockUSDC.sol` | Hardhat tests/local demos/testnet demo deploys | replace with real ARC USDC for production-like deploys |
| MockOutcomeToken | Solidity test double | `mocks/contracts/MockOutcomeToken.sol` | Hardhat lending tests | tests only |
| local demo scripts | scripted local scenarios | `scripts/demo-local-*.ts` | `npm.cmd run demo:local:*` | local verification only |

## Rules

- New mocks must be added to this registry before being used.
- Runtime mocks must not impersonate user wallets or signatures.
- Mocks must use obvious names: `mock`, `demo`, or `test`.
- No user private keys belong in mocks.
- Public demo private keys are allowed only when clearly labeled as public demo data.
- Full ARC validation path is deployment + real wallet + real backend config.
- The only frontend entrypoint is `frontend/src/main.tsx`; it must not import `mocks/*`.
