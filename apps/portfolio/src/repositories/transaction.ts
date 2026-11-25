import type { Pool, PoolClient } from "pg";

/** Runs `work` in one transaction on one connection: committed when it returns, rolled back when it throws. */
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Serialises the writes of one user until the transaction ends. Two adds at once could otherwise
 * both see 99 rows and pass the cap, or take the same position. Different users rarely share a
 * hash; when they do, they only wait for each other.
 */
export async function lockUser(client: PoolClient, userId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`portfolio:${userId}`]);
}
