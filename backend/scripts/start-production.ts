const { createArcPublicClient } = await import("../src/clob/chain/arc.js");
const { assertContractBytecodeHashes, loadContractBytecodeHashes } = await import(
  "../src/clob/chain/contractBytecode.js"
);
const { loadClobBackendConfig } = await import("../src/clob/config.js");
const { withTransaction } = await import("../src/clob/db/client.js");
const { bootstrapReconciliationCursor } = await import(
  "../src/clob/reconciliationBootstrap.js"
);

const config = loadClobBackendConfig();
const publicClient = createArcPublicClient({ rpcUrl: config.arcRpcUrl });
await assertContractBytecodeHashes({
  publicClient,
  contracts: {
    loanPositionToken: config.loanPositionToken,
    outcomeToken: config.outcomeToken,
    outcomeExchange: config.outcomeExchange,
  },
  expected: loadContractBytecodeHashes(),
});
console.log("Configured ARC contract bytecode hashes verified");

await import("./migrate.js");

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
