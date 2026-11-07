import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

// BIGINT (OID 20) arrives as a string by default. All our ids/counts are far below 2^53,
// so parse them as numbers (keeps ids usable in JSON bodies and React keys).
types.setTypeParser(20, (v) => Number(v));

// Single pool per server process (survives Next.js dev hot reloads).
const g = globalThis as unknown as { __pulsePool?: Pool };
export const pool: Pool = g.__pulsePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') g.__pulsePool = pool;

/** Anything that can run a query: the pool or a transaction client. */
export type Db = Pool | PoolClient;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string, params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Runs `fn` inside BEGIN/COMMIT. The acting user id is stored in the
 * transaction-local setting `app.current_user_id`, which the audit trigger
 * (fn_audit_status_change) reads to record WHO changed a status.
 */
export async function withTransaction<T>(
  userId: number | null, fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId === null ? '' : String(userId)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
