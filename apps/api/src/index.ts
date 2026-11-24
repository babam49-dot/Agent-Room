import dotenv from 'dotenv';
import { buildServer } from './server.js';

dotenv.config();

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

const server = buildServer();

async function start() {
  try {
    await server.listen({ port, host });
    console.log(`[API] AgentRoom realtime gateway listening on http://${host}:${port}`);
    console.log(`[API] Health check available at http://${host}:${port}/healthz`);
    console.log(`[API] Dev auth bypass available at http://${host}:${port}/v1/auth/users`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
