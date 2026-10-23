import { Pool, type PoolClient } from "pg";

// Pool singleton (sobrevive al hot-reload de Next en dev).
// Es la MISMA base de datos del sistema de evaluación; las tablas de este
// proyecto viven en el schema 'mentoria' y las consultas lo nombran explícito.
// Pool pequeño para no agotar conexiones del Postgres compartido.
declare global {
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export async function query<T = unknown>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

// Ejecuta `fn` dentro de una transacción; hace rollback si lanza.
export async function withTx<T>(
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
