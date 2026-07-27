import pg from "pg";

const { Pool } = pg;

export type DbClient = pg.PoolClient | pg.Pool;

let pool: pg.Pool | undefined;

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

export function getPool(): pg.Pool {
  if (pool !== undefined) {
    return pool;
  }

  pool = new Pool({
    connectionString: getDatabaseUrl(),
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool === undefined) {
    return;
  }

  await pool.end();
  pool = undefined;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
