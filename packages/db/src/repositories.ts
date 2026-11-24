import { uuidv7 } from '@agentroom/core';
import type { EventEnvelope, DraftEvent } from '@agentroom/core';
import { redactPayload } from '@agentroom/core';
import { createDbPool, createDrizzleClient } from './client.js';
import * as schema from './schema.js';
import { eq, and, gt, sql } from 'drizzle-orm';

export interface EventPublisher {
  publish(channel: string, message: string): Promise<void>;
}

// In-Memory fallback store for local development when PostgreSQL is not yet running
class InMemoryStore {
  organizations = new Map<string, any>();
  users = new Map<string, any>();
  memberships = new Map<string, any>();
  projects = new Map<string, any>();
  runs = new Map<string, any>();
  events = new Map<string, EventEnvelope[]>(); // runId -> envelopes
  approvals = new Map<string, any>();
  comments = new Map<string, any>();
  contextBlocks = new Map<string, any>();
  contextVersions = new Map<string, any>();
  policies = new Map<string, any>();
  blobs = new Map<string, any>();
  knowledgeItems = new Map<string, any>();
}

export const inMemoryDb = new InMemoryStore();

export class RunRepository {
  private isPostgresAvailable: boolean | null = null;
  private pool: any = null;
  private drizzle: any = null;

  constructor(
    private connectionString?: string,
    private publisher?: EventPublisher
  ) {}

  private async getDrizzle() {
    if (this.isPostgresAvailable === false) return null;
    if (!this.pool) {
      try {
        this.pool = createDbPool(this.connectionString);
        this.drizzle = createDrizzleClient(this.pool);
        // Quick probe
        const client = await this.pool.connect();
        client.release();
        this.isPostgresAvailable = true;
        return this.drizzle;
      } catch (err) {
        console.warn('[DB] PostgreSQL connection unavailable, falling back to in-memory store:', (err as Error).message);
        this.isPostgresAvailable = false;
        return null;
      }
    }
    return this.drizzle;
  }

  async appendEvent(runId: string, draft: DraftEvent): Promise<EventEnvelope> {
    const eventId = draft.id || uuidv7();
    const createdAt = new Date().toISOString();
    const cleanPayload = redactPayload(draft.payload);

    const db = await this.getDrizzle();

    if (db && this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Check idempotency
        const existing = await client.query('SELECT * FROM events WHERE id = $1', [eventId]);
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          const row = existing.rows[0];
          return {
            id: row.id,
            runId: row.run_id,
            seq: Number(row.seq),
            type: row.type,
            actorType: row.actor_type,
            actorId: row.actor_id,
            stepIndex: row.step_index,
            payload: row.payload,
            createdAt: row.created_at.toISOString(),
          };
        }

        // 1. Atomic row lock and gapless sequence increment
        const runRes = await client.query(
          'UPDATE runs SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq, org_id',
          [runId]
        );

        if (runRes.rows.length === 0) {
          throw new Error(`Run ${runId} not found`);
        }

        const nextSeq = Number(runRes.rows[0].last_seq);
        const orgId = runRes.rows[0].org_id;

        // 2. Insert event
        await client.query(
          `INSERT INTO events (run_id, seq, id, org_id, type, actor_type, actor_id, step_index, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            runId,
            nextSeq,
            eventId,
            orgId,
            draft.type,
            draft.actorType,
            draft.actorId,
            draft.stepIndex ?? null,
            JSON.stringify(cleanPayload),
            createdAt,
          ]
        );

        // 3. Projections inside transaction
        if (draft.type === 'run.status_changed') {
          const payload = cleanPayload as any;
          await client.query('UPDATE runs SET status = $1 WHERE id = $2', [payload.to, runId]);
        }

        await client.query('COMMIT');

        const envelope: EventEnvelope = {
          id: eventId,
          runId,
          seq: nextSeq,
          type: draft.type,
          actorType: draft.actorType,
          actorId: draft.actorId,
          stepIndex: draft.stepIndex ?? null,
          payload: cleanPayload,
          createdAt,
        };

        // 4. Publish after commit
        if (this.publisher) {
          await this.publisher.publish(`run:${runId}:events`, JSON.stringify(envelope));
        }

        return envelope;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    // In-memory implementation
    const run = inMemoryDb.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found in in-memory store`);
    }

    // Check idempotency
    const existingEvents = inMemoryDb.events.get(runId) || [];
    const match = existingEvents.find((e) => e.id === eventId);
    if (match) return match;

    run.lastSeq = (run.lastSeq || 0) + 1;
    const nextSeq = run.lastSeq;

    const envelope: EventEnvelope = {
      id: eventId,
      runId,
      seq: nextSeq,
      type: draft.type,
      actorType: draft.actorType,
      actorId: draft.actorId,
      stepIndex: draft.stepIndex ?? null,
      payload: cleanPayload,
      createdAt,
    };

    existingEvents.push(envelope);
    inMemoryDb.events.set(runId, existingEvents);

    if (draft.type === 'run.status_changed') {
      run.status = (cleanPayload as any).to;
    }

    if (this.publisher) {
      await this.publisher.publish(`run:${runId}:events`, JSON.stringify(envelope));
    }

    return envelope;
  }

  async getRun(runId: string, orgId?: string) {
    const db = await this.getDrizzle();
    if (db) {
      const condition = orgId
        ? and(eq(schema.runs.id, runId), eq(schema.runs.orgId, orgId))
        : eq(schema.runs.id, runId);
      const rows = await db.select().from(schema.runs).where(condition).limit(1);
      return rows[0] || null;
    }

    const run = inMemoryDb.runs.get(runId);
    if (!run) return null;
    if (orgId && run.orgId !== orgId) return null;
    return run;
  }

  async getEvents(runId: string, after: number = 0, limit: number = 500): Promise<EventEnvelope[]> {
    const db = await this.getDrizzle();
    if (db) {
      const rows = await db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.runId, runId), gt(schema.events.seq, after)))
        .orderBy(schema.events.seq)
        .limit(limit);

      return rows.map((r: any) => ({
        id: r.id,
        runId: r.runId,
        seq: r.seq,
        type: r.type,
        actorType: r.actorType,
        actorId: r.actorId,
        stepIndex: r.stepIndex,
        payload: r.payload,
        createdAt: r.createdAt.toISOString(),
      }));
    }

    const list = inMemoryDb.events.get(runId) || [];
    return list.filter((e) => e.seq > after).slice(0, limit);
  }
}
