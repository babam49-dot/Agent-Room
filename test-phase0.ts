import { buildServer } from './apps/api/src/server.js';
import { seedDatabase } from './packages/db/src/seed.js';

async function verifyPhase0() {
  console.log('=== VERIFYING PHASE 0 FOUNDATIONS ===\n');

  // 1. Seed database
  console.log('[1/4] Seeding database...');
  await seedDatabase();
  console.log('  ✓ Seeded organization, 3 users (Sara, Ahmed, Lina), and sample run.\n');

  // 2. Build Fastify server
  console.log('[2/4] Initializing Fastify API server...');
  const app = buildServer();
  await app.ready();
  console.log('  ✓ Fastify server initialized with CORS, WebSocket, and Zod provider.\n');

  // 3. Test Health Endpoints
  console.log('[3/4] Testing Health & Auth Endpoints...');
  const healthRes = await app.inject({ method: 'GET', url: '/healthz' });
  console.log('  GET /healthz ->', healthRes.statusCode, healthRes.json());
  if (healthRes.statusCode !== 200) throw new Error('Health check failed');

  const readyRes = await app.inject({ method: 'GET', url: '/readyz' });
  console.log('  GET /readyz ->', readyRes.statusCode, readyRes.json());
  if (readyRes.statusCode !== 200) throw new Error('Ready check failed');

  const usersRes = await app.inject({ method: 'GET', url: '/v1/auth/users' });
  console.log('  GET /v1/auth/users ->', usersRes.statusCode, `Found ${usersRes.json().users.length} seeded users:`, usersRes.json().users.map((u: any) => `${u.name} (${u.role})`).join(', '));
  if (usersRes.statusCode !== 200) throw new Error('User switcher failed');

  const tokenRes = await app.inject({
    method: 'POST',
    url: '/v1/realtime-token',
    payload: { userId: '01935e40-0002-7000-8000-000000000001' },
  });
  console.log('  POST /v1/realtime-token ->', tokenRes.statusCode, 'Token signed for:', tokenRes.json().user.name, `(${tokenRes.json().user.role})`);
  if (tokenRes.statusCode !== 200) throw new Error('Realtime token generation failed');

  // 4. Test REST Snapshot & Event Endpoints
  console.log('\n[4/4] Testing Projects & Runs Endpoints...');
  const projRes = await app.inject({ method: 'GET', url: '/v1/projects' });
  console.log('  GET /v1/projects ->', projRes.statusCode, 'Project:', projRes.json().projects[0]?.name);

  const runRes = await app.inject({ method: 'GET', url: '/v1/runs/01935e40-0004-7000-8000-000000000001' });
  console.log('  GET /v1/runs/:id ->', runRes.statusCode, 'Run:', runRes.json().run.title, 'Status:', runRes.json().state.status);
  if (runRes.statusCode !== 200) throw new Error('Get run failed');

  await app.close();
  console.log('\n=========================================');
  console.log('✓ ALL PHASE 0 ACCEPTANCE CRITERIA PASSED!');
  console.log('=========================================');
}

verifyPhase0().catch((err) => {
  console.error('Phase 0 verification failed:', err);
  process.exit(1);
});
