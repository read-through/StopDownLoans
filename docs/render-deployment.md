# Render Demo Deployment

The repository contains a `render.yaml` Blueprint for a public ARC testnet demo:

- one Docker web service serving the React frontend, CLOB HTTP API, WebSocket feed, executor, and
  lending keeper;
- one managed PostgreSQL database;
- migrations and safe reconciliation cursor bootstrap before the HTTP server opens;
- mocks disabled;
- current ARC testnet contract addresses compiled into the frontend and supplied to the backend.

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

The Blueprint's `initialDeployHook` registers the active reviewer market after the first successful
service deployment. Confirm that `/v1/markets` returns the market below before submitting orders.
The hook uses the idempotent command below. A paid Render service can rerun it from its shell:

```sh
node dist/backend/scripts/market-config.js --outcome-token 0x06c08af6a3ad503560f3010105f1ec32052c7f2f --market-id 0x1489a4e8bf6c349a62c1892e03c1206051f11bac3bdf1adaba8aaa6800322ea1 --default-tick-units 1000 --edge-tick-units 100 --lower-edge-price-units 100000 --upper-edge-price-units 900000 --min-order-outcome-amount 1
```

The Free tier does not provide a service shell or one-off jobs. On Free, confirm that the initial
hook succeeded in the deploy logs and that `/v1/markets` contains the reviewer market. If the hook
did not run, fix the deployment and recreate the demo service instead of assuming a manual shell is
available.

## Free-Tier Limits

This Blueprint is a hackathon demo deployment, not an always-on production deployment:

- the free web service can sleep after 15 minutes without inbound HTTP or WebSocket traffic;
- keeper and executor loops do not run while the service is asleep;
- the first request after sleep can take about one minute;
- free Render PostgreSQL expires after 30 days and has no backups.

Open the site several minutes before recording and keep the WebSocket-connected exchange screen
open. An always-on instance is required before treating the keeper as continuously available.
