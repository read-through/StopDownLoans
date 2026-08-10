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

## First Demo Preparation

`render.yaml` cannot pre-register a market until a fresh current-deployment loan exists and its
`marketId` is known. After creating and activating that loan, register it with the idempotent command
below. A paid Render service can run it from its shell:

```sh
node dist/backend/scripts/market-config.js --outcome-token <CURRENT_OUTCOME_TOKEN> --market-id <CURRENT_MARKET_ID> --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

The Free tier does not provide a service shell or one-off jobs. For a Free-tier demo, run the same
command locally against the Render `DATABASE_URL` only if external database access is explicitly
enabled, or add an authenticated market-configuration deployment path before the reviewer demo.
Do not claim the market is registered until `/v1/markets` returns it.

## Free-Tier Limits

This Blueprint is a hackathon demo deployment, not an always-on production deployment:

- the free web service can sleep after 15 minutes without inbound HTTP or WebSocket traffic;
- keeper and executor loops do not run while the service is asleep;
- the first request after sleep can take about one minute;
- free Render PostgreSQL expires after 30 days and has no backups.

Open the site several minutes before recording and keep the WebSocket-connected exchange screen
open. An always-on instance is required before treating the keeper as continuously available.
