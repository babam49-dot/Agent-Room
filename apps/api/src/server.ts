import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { DevAuthProvider, verifyRealtimeToken, uuidv7, applyEvent, createInitialRunState } from '@agentroom/core';
import { RunRepository, SEEDED_DATA, inMemoryDb } from '@agentroom/db';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  const jwtSecret = process.env.REALTIME_JWT_SECRET || 'dev-secret-key';
  const authProvider = new DevAuthProvider(jwtSecret);
  const repository = new RunRepository(process.env.DATABASE_URL);

  // Register plugins
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.register(websocket);

  // Health endpoints
  app.get('/healthz', async () => {
    return {
      status: 'ok',
      service: 'agentroom-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/readyz', async () => {
    return {
      status: 'ready',
      checks: {
        api: 'ok',
        auth: 'ok',
        database: 'ok',
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Auth & Dev User Switcher
  app.get('/v1/auth/users', async () => {
    return {
      users: SEEDED_DATA.users,
      org: SEEDED_DATA.org,
    };
  });

  app.post('/v1/realtime-token', async (request, reply) => {
    const body = (request.body as { userId?: string }) || {};
    const userId = body.userId || SEEDED_DATA.users[0]!.id;
    const token = await authProvider.generateDevToken(userId);
    const user = await authProvider.authenticate(token);

    return {
      token,
      user,
      expiresIn: 86400,
    };
  });

  app.get('/v1/auth/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } });
      return;
    }

    const user = await authProvider.authenticate(authHeader);
    if (!user) {
      reply.code(401).send({ error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired' } });
      return;
    }

    return { user };
  });

  // Projects
  app.get('/v1/projects', async (request, reply) => {
    return {
      projects: [
        {
          ...SEEDED_DATA.project,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });

  app.get('/v1/projects/:id/runs', async (request, reply) => {
    const params = request.params as { id: string };
    const run = await repository.getRun(SEEDED_DATA.run.id);

    return {
      runs: run ? [run] : [SEEDED_DATA.run],
    };
  });

  // Runs
  app.get('/v1/runs/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const run = await repository.getRun(params.id);
    if (!run) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
      return;
    }

    // Build state snapshot
    const events = await repository.getEvents(params.id, 0, 10000);
    let state = createInitialRunState(params.id, run.orgId || SEEDED_DATA.org.id, run.projectId || SEEDED_DATA.project.id);
    state.title = run.title;
    state.goal = run.goal;
    state.status = run.status;
    state.model = run.model;

    for (const ev of events) {
      state = applyEvent(state, ev);
    }

    return {
      run,
      state,
      lastSeq: state.lastSeq,
    };
  });

  app.get('/v1/runs/:id/events', async (request, reply) => {
    const params = request.params as { id: string };
    const query = (request.query as { after?: string; limit?: string }) || {};
    const after = Number(query.after || 0);
    const limit = Number(query.limit || 500);

    const events = await repository.getEvents(params.id, after, limit);
    return {
      events,
      after,
      count: events.length,
    };
  });

  app.post('/v1/projects/:id/runs', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { title: string; goal: string; model?: string }) || {};
    const newRunId = uuidv7();

    const newRun = {
      id: newRunId,
      orgId: SEEDED_DATA.org.id,
      projectId: params.id,
      title: body.title || 'New Agent Run',
      goal: body.goal || 'Complete task',
      model: body.model || 'claude-sonnet-5-5',
      status: 'queued' as const,
      driverType: 'agent' as const,
      driverUserId: null,
      createdBy: SEEDED_DATA.users[0]!.id,
      lastSeq: 0,
      lastAppliedSeq: 0,
      createdAt: new Date(),
    };

    inMemoryDb.runs.set(newRunId, newRun);

    return {
      run: newRun,
    };
  });

  return app;
}
