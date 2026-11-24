import { inMemoryDb } from './repositories.js';
import { createDbPool } from './client.js';

export async function resetDatabase() {
  console.log('[DB] Resetting database...');
  inMemoryDb.events.clear();
  inMemoryDb.runs.clear();
  inMemoryDb.projects.clear();
  inMemoryDb.users.clear();
  inMemoryDb.memberships.clear();
  inMemoryDb.organizations.clear();

  try {
    const pool = createDbPool();
    const client = await pool.connect();
    await client.query(`
      DROP TABLE IF EXISTS knowledge_items CASCADE;
      DROP TABLE IF EXISTS blobs CASCADE;
      DROP TABLE IF EXISTS policies CASCADE;
      DROP TABLE IF EXISTS handoffs CASCADE;
      DROP TABLE IF EXISTS comments CASCADE;
      DROP TABLE IF EXISTS approvals CASCADE;
      DROP TABLE IF EXISTS context_block_versions CASCADE;
      DROP TABLE IF EXISTS context_blocks CASCADE;
      DROP TABLE IF EXISTS events CASCADE;
      DROP TABLE IF EXISTS runs CASCADE;
      DROP TABLE IF EXISTS projects CASCADE;
      DROP TABLE IF EXISTS memberships CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS organizations CASCADE;
    `);
    client.release();
    await pool.end();
    console.log('[DB] PostgreSQL tables dropped.');
  } catch (err) {
    console.log('[DB] Reset applied to in-memory store.');
  }
}

if (process.argv[1]?.endsWith('reset.ts')) {
  resetDatabase().catch(console.error);
}
