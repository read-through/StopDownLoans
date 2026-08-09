import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DbClient } from "../../src/clob/db/client.js";
import { bootstrapReconciliationCursor } from "../../src/clob/reconciliationBootstrap.js";

describe("bootstrapReconciliationCursor", () => {
  it("keeps an existing cursor without reading ARC", async () => {
    let chainReads = 0;
    const dbClient = createDbClient({ cursor: 42n });

    const result = await bootstrapReconciliationCursor({
      dbClient,
      publicClient: {
        getBlockNumber: async () => {
          chainReads += 1;
          return 100n;
        },
      },
      confirmationDepth: 1n,
    });

    assert.deepEqual(result, { status: "existing", blockNumber: 42n });
    assert.equal(chainReads, 0);
  });

  it("initializes an empty database at the current safe head", async () => {
    const dbClient = createDbClient({ cursor: null, hasTradingState: false });

    const result = await bootstrapReconciliationCursor({
      dbClient,
      publicClient: { getBlockNumber: async () => 100n },
      confirmationDepth: 1n,
    });

    assert.deepEqual(result, { status: "initialized", blockNumber: 99n });
  });

  it("refuses to skip history for a non-empty database without a cursor", async () => {
    const dbClient = createDbClient({ cursor: null, hasTradingState: true });

    await assert.rejects(
      bootstrapReconciliationCursor({
        dbClient,
        publicClient: { getBlockNumber: async () => 100n },
        confirmationDepth: 1n,
      }),
      /missing for a non-empty trading database/
    );
  });
});

function createDbClient(input: {
  cursor: bigint | null;
  hasTradingState?: boolean;
}): DbClient {
  return {
    query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        return queryResult([]);
      }

      if (sql.includes("SELECT block_number")) {
        return queryResult(
          input.cursor === null ? [] : [{ block_number: input.cursor.toString() }]
        );
      }

      if (sql.includes("AS has_trading_state")) {
        return queryResult([{ has_trading_state: input.hasTradingState ?? false }]);
      }

      if (sql.includes("INSERT INTO backend_cursors")) {
        return queryResult([{ block_number: values?.[1] as string }]);
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  } as unknown as DbClient;
}

function queryResult(rows: unknown[]) {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  };
}
