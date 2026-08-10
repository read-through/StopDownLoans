# Render Demo Deployment

The repository contains a `render.yaml` Blueprint for a public ARC testnet demo:

- one Docker web service serving the React frontend, CLOB HTTP API, WebSocket feed, executor, and
  lending keeper;
- one managed PostgreSQL database;
- migrations and safe reconciliation cursor bootstrap before the HTTP server opens;
- mocks disabled;
- freshly deployed ARC contract addresses compiled into the frontend and supplied to the backend,
  plus runtime bytecode hashes required by production startup.

## Deploy

1. Push the repository to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Render reads `render.yaml` and creates `stopdown-loans` plus `stopdown-db`.
4. Open `stopdown-loans -> Environment` and add `EXECUTOR_PRIVATE_KEY` manually. Enter the funded
   ARC testnet operator key, then choose `Save, rebuild, and deploy`. Do not add the key to
   `render.yaml`, `.env.example`, README, or frontend variables.
5. Wait for the database and web service deploys to finish.
6. Open `https://<render-service-host>/v1/health` and verify:
   - `status == "ok"`;
   - `chainId == 5042002`;
   - `executorEnabled == true`;
   - `sync.status == "ok"`;
   - `sync.lagBlocks` falls after startup.
7. Open `https://<render-service-host>/` and connect an injected EVM wallet configured for ARC
   testnet.

## Market Registration

The loan snapshot sync automatically creates a default CLOB market config for every indexed loan.
The registration is idempotent and does not overwrite an existing operator-managed config. After a
loan transaction is confirmed, `/v1/loans` and `/v1/markets` should expose the linked records within
one `LOAN_SNAPSHOT_SYNC_INTERVAL_MS` cycle.

The command below remains an operator override for changing the default market parameters; it is
not part of the normal loan happy path:

```sh
node dist/backend/scripts/market-config.js --outcome-token <CURRENT_OUTCOME_TOKEN> --market-id <CURRENT_MARKET_ID> --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

Do not treat the market as indexed until `/v1/markets` returns the loan's exact `marketId` and linked
`loanId`. The frontend refreshes index-backed reads every 15 seconds, but PostgreSQL remains the
source of truth for the CLOB.

## Free-Tier Limits

This Blueprint is a hackathon demo deployment, not an always-on production deployment:

- the free web service can sleep after 15 minutes without inbound HTTP or WebSocket traffic;
- keeper and executor loops do not run while the service is asleep;
- the first request after sleep can take about one minute;
- free Render PostgreSQL expires after 30 days and has no backups.

Open the site several minutes before recording and keep the WebSocket-connected exchange screen
open. An always-on instance is required before treating the keeper as continuously available.
