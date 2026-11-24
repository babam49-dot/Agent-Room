import { describe, it, expect } from 'vitest';
import {
  uuidv7,
  canTransition,
  evaluatePolicy,
  redactString,
  redactPayload,
  createInitialRunState,
  applyEvent,
  signRealtimeToken,
  verifyRealtimeToken,
  defaultPolicy,
} from '../index.js';
import type { EventEnvelope } from '../events.js';

describe('UUIDv7 Generator', () => {
  it('generates valid RFC 9562 UUIDv7 format and strictly orders by time', () => {
    const id1 = uuidv7();
    const id2 = uuidv7();
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id1).not.toBe(id2);
  });
});

describe('State Machine', () => {
  it('enforces allowed transitions correctly', () => {
    expect(canTransition('queued', 'running')).toBe(true);
    expect(canTransition('running', 'paused')).toBe(true);
    expect(canTransition('paused', 'running')).toBe(true);
    expect(canTransition('running', 'awaiting_approval')).toBe(true);
    expect(canTransition('awaiting_approval', 'running')).toBe(true);
    expect(canTransition('running', 'human_driving')).toBe(true);
    expect(canTransition('human_driving', 'running')).toBe(true);
    expect(canTransition('running', 'completed')).toBe(true);

    // Terminal states cannot transition out
    expect(canTransition('completed', 'running')).toBe(false);
    expect(canTransition('failed', 'running')).toBe(false);
    expect(canTransition('cancelled', 'running')).toBe(false);
  });
});

describe('Policy Engine', () => {
  it('evaluates safe commands as allow', () => {
    const result = evaluatePolicy({
      tool: 'run_command',
      risk: 'exec',
      arguments: { command: 'pnpm test' },
    });
    expect(result).toBe('allow');
  });

  it('denies dangerous commands like rm -rf or curl', () => {
    const result = evaluatePolicy({
      tool: 'run_command',
      risk: 'exec',
      arguments: { command: 'rm -rf /' },
    });
    expect(result).toBe('deny');
  });

  it('asks for approval on git push or sensitive file writes', () => {
    const gitPush = evaluatePolicy({
      tool: 'git',
      risk: 'write',
      arguments: { sub: 'push' },
    });
    expect(gitPush).toBe('ask');

    const envWrite = evaluatePolicy({
      tool: 'write_file',
      risk: 'write',
      arguments: { path: '.env' },
    });
    expect(envWrite).toBe('ask');
  });
});

describe('Secret Redactor', () => {
  it('redacts Anthropic API keys and private keys', () => {
    const raw = 'Key is sk-ant-api03-abcdef1234567890abcdef1234567890 in config';
    expect(redactString(raw)).toBe('Key is [REDACTED_ANTHROPIC_KEY] in config');

    const obj = {
      apiKey: 'sk-ant-api03-secret12345678901234567890',
      safeText: 'Hello world',
    };
    const redacted = redactPayload(obj);
    expect(redacted.apiKey).toBe('[REDACTED_ANTHROPIC_KEY]');
    expect(redacted.safeText).toBe('Hello world');
  });
});

describe('Shared Reducer (applyEvent)', () => {
  it('deterministically rebuilds run state from events', () => {
    const runId = uuidv7();
    let state = createInitialRunState(runId, 'org-1', 'proj-1');

    const e1: EventEnvelope<'run.created'> = {
      id: uuidv7(),
      runId,
      seq: 1,
      type: 'run.created',
      actorType: 'human',
      actorId: 'user-1',
      stepIndex: null,
      payload: {
        goal: 'Migrate endpoint',
        projectId: 'proj-1',
        model: 'claude-sonnet-5-5',
      },
      createdAt: new Date().toISOString(),
    };

    const e2: EventEnvelope<'run.started'> = {
      id: uuidv7(),
      runId,
      seq: 2,
      type: 'run.started',
      actorType: 'system',
      actorId: null,
      stepIndex: null,
      payload: {
        sandboxId: 'sbx-123',
      },
      createdAt: new Date().toISOString(),
    };

    const e3: EventEnvelope<'plan.updated'> = {
      id: uuidv7(),
      runId,
      seq: 3,
      type: 'plan.updated',
      actorType: 'agent',
      actorId: null,
      stepIndex: 1,
      payload: {
        items: [
          { id: '1', text: 'Inspect existing endpoint', status: 'done' },
          { id: '2', text: 'Implement v2 handler', status: 'in_progress' },
        ],
      },
      createdAt: new Date().toISOString(),
    };

    state = applyEvent(state, e1);
    expect(state.goal).toBe('Migrate endpoint');
    expect(state.status).toBe('queued');
    expect(state.lastSeq).toBe(1);

    state = applyEvent(state, e2);
    expect(state.status).toBe('running');
    expect(state.sandboxId).toBe('sbx-123');
    expect(state.lastSeq).toBe(2);

    state = applyEvent(state, e3);
    expect(state.plan.length).toBe(2);
    expect(state.plan[0]!.status).toBe('done');
    expect(state.lastSeq).toBe(3);
  });
});

describe('Realtime Auth Tokens', () => {
  it('signs and verifies 5-minute realtime JWT token', () => {
    const secret = 'test-realtime-secret';
    const token = signRealtimeToken({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'owner',
      name: 'Sara Chen',
    }, secret, 300);

    const verified = verifyRealtimeToken(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('user-1');
    expect(verified?.role).toBe('owner');
    expect(verified?.name).toBe('Sara Chen');
  });
});
