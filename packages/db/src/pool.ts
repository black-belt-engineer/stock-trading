import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export async function closePool(pool: Pool): Promise<void> {
  await pool.end();
}

export async function pingPool(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
