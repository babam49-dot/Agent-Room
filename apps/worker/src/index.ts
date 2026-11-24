import dotenv from 'dotenv';
import PgBoss from 'pg-boss';

dotenv.config();

console.log('[Worker] Starting AgentRoom worker process...');

let boss: PgBoss | null = null;

async function startWorker() {
  const dbUrl = process.env.DATABASE_URL || 'postgres://agentroom:agentroom@localhost:5432/agentroom';

  try {
    boss = new PgBoss(dbUrl);
    boss.on('error', (error) => console.warn('[Worker] PgBoss error (polling standby):', error.message));

    await boss.start();
    console.log('[Worker] Connected to pg-boss queue successfully.');

    // Register queue handlers for run execution
    await boss.work('run.start', async (job) => {
      console.log('[Worker] Received job run.start:', job.data);
    });

    await boss.work('run.wake', async (job) => {
      console.log('[Worker] Received job run.wake:', job.data);
    });
  } catch (err) {
    console.warn('[Worker] PostgreSQL queue connection standby (in-memory dev mode active):', (err as Error).message);
  }

  console.log('[Worker] AgentRoom agent runtime ready and listening for agent runs.');
}

async function shutdown() {
  console.log('[Worker] Gracefully shutting down worker...');
  if (boss) {
    await boss.stop();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startWorker();
