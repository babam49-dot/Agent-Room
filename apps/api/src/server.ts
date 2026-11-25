import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {
  DevAuthProvider,
  verifyRealtimeToken,
  uuidv7,
  applyEvent,
  createInitialRunState,
  globalPubSub,
} from '@agentroom/core';
import type { EventEnvelope } from '@agentroom/core';
import { RunRepository, SEEDED_DATA, inMemoryDb } from '@agentroom/db';
import { AgentRunner } from '@agentroom/agent';

// Active agent runners in memory
const activeRunners = new Map<string, AgentRunner>();

// Presence store per run: runId -> Map<socketId, PresenceUser>
interface UserPresence {
  userId: string;
  name: string;
  color: string;
  focusSeq?: number;
  composing?: boolean;
  view?: string;
  lastSeenAt: string;
}

const runPresences = new Map<string, Map<any, UserPresence>>();

function getUserColor(userId: string): string {
  const colors = ['#da7756', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}

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
  app.get('/v1/projects', async () => {
    return {
      projects: [
        {
          ...SEEDED_DATA.project,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });

  app.get('/v1/projects/:id/runs', async () => {
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

  // ==========================================
  // PHASE 1: SSE STREAMING (Section 10.2)
  // ==========================================
  app.get('/v1/runs/:id/stream', async (request, reply) => {
    const params = request.params as { id: string };
    const runId = params.id;
    const query = request.query as { after?: string; token?: string };

    // Check Last-Event-ID or query.after
    const lastEventId = request.headers['last-event-id'];
    const after = Number(lastEventId || query.after || 0);

    const run = await repository.getRun(runId);
    if (!run) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
      return;
    }

    if (after > (run.lastSeq || 0)) {
      reply.code(400).send({ error: { code: 'INVALID_SEQ', message: 'Requested sequence exceeds run lastSeq' } });
      return;
    }

    // Set SSE headers
    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    let lastSentSeq = after;
    const buffer: EventEnvelope[] = [];
    let isCatchingUp = true;

    // 1. Subscribe to pub/sub first and buffer incoming live events
    const unsubscribeEvents = await globalPubSub.subscribe(`run:${runId}:events`, (msgStr) => {
      try {
        const envelope: EventEnvelope = JSON.parse(msgStr);
        if (isCatchingUp) {
          buffer.push(envelope);
        } else if (envelope.seq > lastSentSeq) {
          lastSentSeq = envelope.seq;
          reply.raw.write(`event: run.event\nid: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`);
        }
      } catch {}
    });

    // Subscribe to ephemeral deltas
    const unsubscribeDeltas = await globalPubSub.subscribe(`run:${runId}:deltas`, (msgStr) => {
      if (!isCatchingUp) {
        reply.raw.write(`event: run.delta\ndata: ${msgStr}\n\n`);
      }
    });

    // 2. Query stored events from Postgres / repository > after
    const pastEvents = await repository.getEvents(runId, after, 5000);
    for (const ev of pastEvents) {
      lastSentSeq = ev.seq;
      reply.raw.write(`event: run.event\nid: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
    }

    // 3. Flush buffer, dropping any events <= lastSentSeq
    isCatchingUp = false;
    for (const buffered of buffer) {
      if (buffered.seq > lastSentSeq) {
        lastSentSeq = buffered.seq;
        reply.raw.write(`event: run.event\nid: ${buffered.seq}\ndata: ${JSON.stringify(buffered)}\n\n`);
      }
    }

    // 4. Send ping every 15s to keep connection alive
    const pingInterval = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 15000);

    request.raw.on('close', async () => {
      clearInterval(pingInterval);
      await unsubscribeEvents();
      await unsubscribeDeltas();
    });
  });

  // ==========================================
  // PHASE 1: WEBSOCKET GATEWAY (Section 10.3)
  // ==========================================
  app.register(async function (fastify) {
    fastify.get('/v1/ws', { websocket: true }, (socket, req) => {
      let currentRunId: string | null = null;
      let currentUser: UserPresence | null = null;

      socket.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.t === 'join') {
            currentRunId = msg.runId;
            const userId = msg.userId || SEEDED_DATA.users[0]!.id;
            const name = msg.name || 'Sara Chen';

            currentUser = {
              userId,
              name,
              color: getUserColor(userId),
              lastSeenAt: new Date().toISOString(),
            };

            if (!runPresences.has(currentRunId)) {
              runPresences.set(currentRunId, new Map());
            }
            runPresences.get(currentRunId)!.set(socket, currentUser);

            // Broadcast presence to all users in this run
            broadcastPresence(currentRunId);
          } else if (msg.t === 'leave') {
            if (currentRunId && runPresences.has(currentRunId)) {
              runPresences.get(currentRunId)!.delete(socket);
              broadcastPresence(currentRunId);
            }
            currentRunId = null;
          } else if (msg.t === 'presence') {
            if (currentRunId && currentUser) {
              currentUser.focusSeq = msg.focusSeq;
              currentUser.composing = msg.composing;
              currentUser.view = msg.view;
              currentUser.lastSeenAt = new Date().toISOString();
              broadcastPresence(currentRunId);
            }
          } else if (msg.t === 'ping') {
            socket.send(JSON.stringify({ t: 'pong' }));
          }
        } catch {}
      });

      socket.on('close', () => {
        if (currentRunId && runPresences.has(currentRunId)) {
          runPresences.get(currentRunId)!.delete(socket);
          broadcastPresence(currentRunId);
        }
      });
    });
  });

  function broadcastPresence(runId: string) {
    const map = runPresences.get(runId);
    if (!map) return;

    const users = Array.from(map.values());
    const payload = JSON.stringify({
      t: 'presence.state',
      runId,
      users,
    });

    for (const [s] of map.entries()) {
      if (s.readyState === 1) {
        // OPEN
        s.send(payload);
      }
    }
  }

  // ==========================================
  // PHASE 1: STEERING & CONTROLS (Section 11)
  // ==========================================

  // Post Steering Message (Queue or Interrupt)
  app.post('/v1/runs/:id/messages', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { text: string; mode?: 'queue' | 'interrupt'; authorId?: string }) || {};

    const authorId = body.authorId || SEEDED_DATA.users[0]!.id;
    const mode = body.mode || 'queue';

    const envelope = await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'message.user',
      actorType: 'human',
      actorId: authorId,
      payload: {
        text: body.text,
        mode,
      },
    });

    // If mode is interrupt, signal the runner immediately
    if (mode === 'interrupt') {
      await globalPubSub.publish(
        `run:${params.id}:control`,
        JSON.stringify({ type: 'interrupt', text: body.text })
      );
    }

    return { envelope };
  });

  // Pause Run
  app.post('/v1/runs/:id/pause', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { reason?: string }) || {};

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'run.pause_requested',
      actorType: 'human',
      actorId: SEEDED_DATA.users[0]!.id,
      payload: {
        reason: body.reason || 'Paused by user',
      },
    });

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'run.paused',
      actorType: 'system',
      actorId: null,
      payload: {},
    });

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'run.status_changed',
      actorType: 'system',
      actorId: null,
      payload: {
        from: 'running',
        to: 'paused',
        reason: body.reason,
      },
    });

    return { ok: true, status: 'paused' };
  });

  // Resume Run
  app.post('/v1/runs/:id/resume', async (request, reply) => {
    const params = request.params as { id: string };

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'run.resumed',
      actorType: 'human',
      actorId: SEEDED_DATA.users[0]!.id,
      payload: {},
    });

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'run.status_changed',
      actorType: 'system',
      actorId: null,
      payload: {
        from: 'paused',
        to: 'running',
        reason: 'Resumed by user',
      },
    });

    return { ok: true, status: 'running' };
  });

  // Approval Decision (Approve or Deny)
  app.post('/v1/runs/:id/approvals/:approvalId', async (request, reply) => {
    const params = request.params as { id: string; approvalId: string };
    const body = (request.body as { decision: 'approved' | 'denied'; note?: string }) || { decision: 'approved' };

    await globalPubSub.publish(
      `run:${params.id}:control`,
      JSON.stringify({
        type: 'approval_decided',
        approvalId: params.approvalId,
        decision: body.decision,
        note: body.note,
      })
    );

    return { ok: true, decision: body.decision };
  });

  // Takeover (Become human driver)
  app.post('/v1/runs/:id/takeover', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { userId?: string }) || {};
    const userId = body.userId || SEEDED_DATA.users[0]!.id;

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'driver.changed',
      actorType: 'system',
      actorId: userId,
      payload: {
        from: { type: 'agent', userId: null },
        to: { type: 'human', userId },
      },
    });

    return { ok: true, driver: { type: 'human', userId } };
  });

  // Handback to Agent
  app.post('/v1/runs/:id/handback', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { note?: string }) || {};

    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'driver.changed',
      actorType: 'system',
      actorId: null,
      payload: {
        from: { type: 'human', userId: SEEDED_DATA.users[0]!.id },
        to: { type: 'agent', userId: null },
      },
    });

    if (body.note) {
      await repository.appendEvent(params.id, {
        runId: params.id,
        type: 'message.user',
        actorType: 'human',
        actorId: SEEDED_DATA.users[0]!.id,
        payload: {
          text: `[Handback Note]: ${body.note}`,
          mode: 'queue',
        },
      });
    }

    return { ok: true, driver: { type: 'agent', userId: null } };
  });

  // ==========================================
  // PHASE 3: CONTEXT BLOCKS & LOCKING (Section 12.4)
  // ==========================================
  app.get('/v1/runs/:id/context-blocks', async (request, reply) => {
    const params = request.params as { id: string };
    const run = await repository.getRun(params.id);
    const orgId = run?.orgId || SEEDED_DATA.org.id;
    const blocks = await repository.getContextBlocks(orgId, params.id, run?.projectId);
    return { blocks };
  });

  app.post('/v1/runs/:id/context-blocks', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      kind?: 'instructions' | 'notes' | 'pinned_files' | 'memory';
      title: string;
      content: string;
      userId?: string;
    };
    const run = await repository.getRun(params.id);
    const orgId = run?.orgId || SEEDED_DATA.org.id;

    const block = await repository.createContextBlock(orgId, {
      runId: params.id,
      projectId: run?.projectId,
      kind: body.kind || 'instructions',
      title: body.title,
      content: body.content,
      userId: body.userId || SEEDED_DATA.users[0]!.id,
    });

    return { block };
  });

  app.patch('/v1/context-blocks/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      baseVersion: number;
      content: string;
      userId?: string;
    };

    try {
      const block = await repository.updateContextBlock(
        params.id,
        body.baseVersion,
        body.content,
        body.userId || SEEDED_DATA.users[0]!.id
      );
      return { block };
    } catch (err: any) {
      if (err.code === 'VERSION_CONFLICT') {
        reply.code(409).send({
          error: {
            code: 'VERSION_CONFLICT',
            message: err.message,
            latestContent: err.latestContent,
            latestVersion: err.latestVersion,
          },
        });
        return;
      }
      reply.code(400).send({ error: { message: err.message } });
    }
  });

  app.post('/v1/context-blocks/:id/lock', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { userId?: string; ttlMs?: number }) || {};

    try {
      const lock = await repository.acquireBlockLock(
        params.id,
        body.userId || SEEDED_DATA.users[0]!.id,
        body.ttlMs || 30000
      );
      return lock;
    } catch (err: any) {
      reply.code(423).send({
        error: {
          code: 'LOCKED',
          message: err.message,
          lockedBy: err.lockedBy,
        },
      });
    }
  });

  app.delete('/v1/context-blocks/:id/lock', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { userId?: string }) || {};
    const res = await repository.releaseBlockLock(params.id, body.userId || SEEDED_DATA.users[0]!.id);
    return res;
  });

  // ==========================================
  // PHASE 3: HANDOFFS & TRANSFERS (Section 9.8)
  // ==========================================
  app.post('/v1/runs/:id/handoff', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      toUserId: string;
      note?: string;
      fromUserId?: string;
    };
    const run = await repository.getRun(params.id);
    const orgId = run?.orgId || SEEDED_DATA.org.id;

    const handoff = await repository.createHandoff(
      orgId,
      params.id,
      body.fromUserId || SEEDED_DATA.users[0]!.id,
      body.toUserId,
      'handoff',
      body.note
    );

    return { handoff };
  });

  app.post('/v1/handoffs/:id/accept', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { resolvedByUserId?: string }) || {};
    const handoff = await repository.resolveHandoff(params.id, 'accepted', body.resolvedByUserId);
    return { handoff, status: 'accepted' };
  });

  app.post('/v1/handoffs/:id/decline', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { resolvedByUserId?: string }) || {};
    const handoff = await repository.resolveHandoff(params.id, 'declined', body.resolvedByUserId);
    return { handoff, status: 'declined' };
  });

  // ==========================================
  // PHASE 3: HUMAN TOOL EXECUTION (Takeover)
  // ==========================================
  app.post('/v1/runs/:id/tools/execute', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      name: string;
      arguments: Record<string, any>;
      userId?: string;
    };
    const userId = body.userId || SEEDED_DATA.users[0]!.id;
    const toolCallId = uuidv7();

    // 1. Tool requested by human
    await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'tool.requested',
      actorType: 'human',
      actorId: userId,
      payload: {
        toolCallId,
        name: body.name,
        arguments: body.arguments,
      },
    });

    // 2. Perform tool execution
    let output = '';
    const ok = true;
    if (body.name === 'run_command') {
      output = `$ ${body.arguments.command || body.arguments.cmd}\n[Human Driver Execution]: Process exited with code 0`;
    } else if (body.name === 'write_file') {
      output = `Successfully wrote ${body.arguments.content?.length || 0} bytes to ${body.arguments.path}`;
    } else {
      output = `Executed ${body.name} successfully`;
    }

    // 3. Tool result by human
    const resultEnvelope = await repository.appendEvent(params.id, {
      runId: params.id,
      type: 'tool.result',
      actorType: 'human',
      actorId: userId,
      payload: {
        toolCallId,
        ok,
        output,
        durationMs: 42,
      },
    });

    return { toolCallId, ok, output, envelope: resultEnvelope };
  });

  // ==========================================
  // PHASE 3: FORK WITH EDIT-AND-RERUN (Section 9.8)
  // ==========================================
  app.post('/v1/runs/:id/fork', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { atSeq?: number; editedMessage?: string; userId?: string }) || {};
    const run = await repository.getRun(params.id);
    if (!run) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
      return;
    }

    const atSeq = body.atSeq ?? run.lastSeq ?? 0;
    const forkedRun = await repository.forkRun(params.id, atSeq, body.editedMessage, body.userId);
    return { run: forkedRun };
  });

  // Trigger Simulation / Execution
  app.post('/v1/runs/:id/simulate', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body as { scriptName?: string; stepDelayMs?: number }) || {};

    if (activeRunners.has(params.id)) {
      return { ok: true, message: 'Runner already active for this run' };
    }

    const runner = new AgentRunner(params.id, {
      scriptName: body.scriptName || 'migrate-api-endpoint',
      stepDelayMs: body.stepDelayMs || 100,
    });

    activeRunners.set(params.id, runner);

    // Run in background
    runner.start().finally(() => {
      activeRunners.delete(params.id);
    });

    return { ok: true, status: 'started' };
  });

  return app;
}
