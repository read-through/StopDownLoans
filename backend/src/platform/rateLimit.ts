import { createHash } from "node:crypto";
import type { DbClient } from "../clob/db/client.js";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export type RateLimitCleanupConfig = {
  intervalMs: number;
  batchLimit: number;
};

type RateLimitRow = {
  request_count: number;
  expires_at: Date;
};

export async function consumeRateLimit(
  client: DbClient,
  input: {
    scope: string;
    subject: string;
    limit: number;
    windowMs: number;
    now?: Date;
  },
): Promise<RateLimitResult> {
  validateInput(input);

  const now = input.now ?? new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / input.windowMs) * input.windowMs);
  const resetAt = new Date(windowStartedAt.getTime() + input.windowMs);
  const subjectHash = createHash("sha256").update(input.subject).digest();
  const result = await client.query<RateLimitRow>(
    `
      INSERT INTO rate_limit_windows (
        scope,
        subject_hash,
        window_started_at,
        request_count,
        expires_at
      )
      VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (scope, subject_hash, window_started_at)
      DO UPDATE SET
        request_count = rate_limit_windows.request_count + 1,
        updated_at = now()
      WHERE rate_limit_windows.request_count < $5
      RETURNING request_count, expires_at
    `,
    [input.scope, subjectHash, windowStartedAt, resetAt, input.limit],
  );

  if (result.rowCount === 0) {
    return { allowed: false, limit: input.limit, remaining: 0, resetAt };
  }

  const count = result.rows[0].request_count;
  return {
    allowed: true,
    limit: input.limit,
    remaining: Math.max(0, input.limit - count),
    resetAt: result.rows[0].expires_at,
  };
}

export async function deleteExpiredRateLimitWindows(
  client: DbClient,
  input: { before?: Date; limit?: number } = {},
): Promise<number> {
  const limit = input.limit ?? 1_000;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("Rate-limit cleanup limit must be a positive safe integer.");
  }

  const result = await client.query(
    `
      DELETE FROM rate_limit_windows
      WHERE ctid IN (
        SELECT ctid
        FROM rate_limit_windows
        WHERE expires_at <= $1
        ORDER BY expires_at ASC
        LIMIT $2
      )
    `,
    [input.before ?? new Date(), limit],
  );

  return result.rowCount ?? 0;
}

export function loadRateLimitCleanupConfig(env: NodeJS.ProcessEnv = process.env): RateLimitCleanupConfig {
  return {
    intervalMs: parsePositiveInteger(
      env.RATE_LIMIT_CLEANUP_INTERVAL_MS ?? "600000",
      "RATE_LIMIT_CLEANUP_INTERVAL_MS",
    ),
    batchLimit: parsePositiveInteger(
      env.RATE_LIMIT_CLEANUP_BATCH_LIMIT ?? "1000",
      "RATE_LIMIT_CLEANUP_BATCH_LIMIT",
    ),
  };
}

export function startRateLimitCleanupLoop(options: {
  intervalMs: number;
  cleanup: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("Rate-limit cleanup interval must be a positive safe integer.");
  }

  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    options.cleanup().then(
      () => {
        running = false;
      },
      (error) => {
        running = false;
        options.onError?.(error);
      },
    );
  }, options.intervalMs);

  return () => clearInterval(timer);
}

function validateInput(input: {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
}): void {
  if (input.scope.trim() === "" || input.scope.length > 100) {
    throw new Error("Rate-limit scope must contain 1 to 100 characters.");
  }
  if (input.subject === "") {
    throw new Error("Rate-limit subject is required.");
  }
  if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
    throw new Error("Rate-limit limit must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(input.windowMs) || input.windowMs <= 0) {
    throw new Error("Rate-limit windowMs must be a positive safe integer.");
  }
}

function parsePositiveInteger(value: string, key: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${key} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${key} must be a positive safe integer.`);
  }
  return parsed;
}
