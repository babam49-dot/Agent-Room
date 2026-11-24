import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const { Pool } = pg;

export function createDbPool(connectionString?: string) {
  const url = connectionString || process.env.DATABASE_URL || 'postgres://agentroom:agentroom@localhost:5432/agentroom';
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 3000,
  });
  return pool;
}

export function createDrizzleClient(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export type DbClient = ReturnType<typeof createDrizzleClient>;
