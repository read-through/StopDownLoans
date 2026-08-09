import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DbClient } from "../../src/clob/db/client.js";
import {
  consumeRateLimit,
  deleteExpiredRateLimitWindows,
  loadRateLimitCleanupConfig,
  startRateLimitCleanupLoop,
} from "../../src/platform/rateLimit.js";

describe("PostgreSQL rate limiter", () => {
  it("uses an atomic fixed window and never sends the raw subject to PostgreSQL", async () => {
    const now = new Date("2026-08-09T12:34:45.000Z");
    let capturedValues: unknown[] = [];
    const client = dbClient(async (_sql, values) => {
      capturedValues = values;
      return queryResult([{ request_count: 2, expires_at: new Date("2026-08-09T12:35:00.000Z") }]);
    });

    const result = await consumeRateLimit(client, {
      scope: "circle-social-login",
      subject: "203.0.113.10",
      limit: 5,
      windowMs: 60_000,
      now,
    });

    assert.deepEqual(result, {
      allowed: true,
      limit: 5,
      remaining: 3,
      resetAt: new Date("2026-08-09T12:35:00.000Z"),
    });
    assert.equal(capturedValues[0], "circle-social-login");
    assert.ok(Buffer.isBuffer(capturedValues[1]));
    assert.equal((capturedValues[1] as Buffer).length, 32);
    assert.ok(!capturedValues.includes("203.0.113.10"));
    assert.deepEqual(capturedValues[2], new Date("2026-08-09T12:34:00.000Z"));
  });

  it("denies a request when the atomic upsert cannot increment past the limit", async () => {
    const client = dbClient(async () => queryResult([]));
    const result = await consumeRateLimit(client, {
      scope: "circle-social-login",
      subject: "203.0.113.10",
      limit: 5,
      windowMs: 60_000,
      now: new Date("2026-08-09T12:34:45.000Z"),
    });

    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
    assert.deepEqual(result.resetAt, new Date("2026-08-09T12:35:00.000Z"));
  });

  it("deletes expired windows in bounded batches", async () => {
    const client = dbClient(async () => ({ ...queryResult([]), rowCount: 7 }));
    assert.equal(
      await deleteExpiredRateLimitWindows(client, {
        before: new Date("2026-08-09T12:00:00.000Z"),
        limit: 100,
      }),
      7,
    );
  });

  it("loads cleanup defaults independently from CLOB config", () => {
    assert.deepEqual(loadRateLimitCleanupConfig({}), {
      intervalMs: 600_000,
      batchLimit: 1_000,
    });
  });

  it("does not overlap cleanup passes", async () => {
    let calls = 0;
    let finish: (() => void) | undefined;
    const stop = startRateLimitCleanupLoop({
      intervalMs: 5,
      cleanup: () => {
        calls += 1;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 18));
    assert.equal(calls, 1);
    finish?.();
    stop();
  });
});

function dbClient(
  query: (sql: string, values: unknown[]) => Promise<ReturnType<typeof queryResult>>,
): DbClient {
  return { query } as unknown as DbClient;
}

function queryResult(rows: unknown[]) {
  return {
    command: "",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}
