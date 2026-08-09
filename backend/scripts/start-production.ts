await import("./migrate.js");

const { createArcPublicClient } = await import("../src/clob/chain/arc.js");
const { loadClobBackendConfig } = await import("../src/clob/config.js");
const { withTransaction } = await import("../src/clob/db/client.js");
const { bootstrapReconciliationCursor } = await import(
  "../src/clob/reconciliationBootstrap.js"
);

const config = loadClobBackendConfig();
const publicClient = createArcPublicClient({ rpcUrl: config.arcRpcUrl });
const bootstrap = await withTransaction((dbClient) =>
  bootstrapReconciliationCursor({
    dbClient,
    publicClient,
    confirmationDepth: config.reconciliationConfirmationDepth,
  })
);

console.log(
  `Reconciliation cursor ${bootstrap.status} at block ${bootstrap.blockNumber.toString()}`
);

await import("./serve-clob.js");
