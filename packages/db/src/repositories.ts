import { uuidv7, globalPubSub } from '@agentroom/core';
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
  handoffs = new Map<string, any>();
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
  ) {
    if (!this.publisher) {
      this.publisher = globalPubSub;
    }
  }

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

  // ==========================================
  // PHASE 3: CONTEXT BLOCKS & VERSIONING
  // ==========================================
  async getContextBlocks(orgId: string, runId?: string, projectId?: string) {
    const db = await this.getDrizzle();
    if (db) {
      // Postgres implementation
      const rows = await db
        .select()
        .from(schema.contextBlocks)
        .where(
          and(
            eq(schema.contextBlocks.orgId, orgId),
            runId ? eq(schema.contextBlocks.runId, runId) : sql`TRUE`,
            projectId ? eq(schema.contextBlocks.projectId, projectId) : sql`TRUE`
          )
        );
      return rows;
    }

    const blocks: any[] = [];
    for (const b of inMemoryDb.contextBlocks.values()) {
      if (b.orgId === orgId) {
        if (!runId && !projectId) {
          blocks.push(b);
        } else if (runId && b.runId === runId) {
          blocks.push(b);
        } else if (projectId && b.projectId === projectId) {
          blocks.push(b);
        }
      }
    }
    return blocks;
  }

  async createContextBlock(orgId: string, data: {
    runId?: string;
    projectId?: string;
    kind: 'instructions' | 'notes' | 'pinned_files' | 'memory';
    title: string;
    content: string;
    userId?: string;
  }) {
    const blockId = uuidv7();
    const now = new Date();

    const block = {
      id: blockId,
      orgId,
      runId: data.runId || null,
      projectId: data.projectId || null,
      kind: data.kind,
      title: data.title,
      position: 0,
      currentVersion: 1,
      enabled: true,
      content: data.content,
      lockedBy: null,
      lockExpiresAt: null,
      createdAt: now,
    };

    inMemoryDb.contextBlocks.set(blockId, block);
    inMemoryDb.contextVersions.set(`${blockId}:1`, {
      blockId,
      version: 1,
      content: data.content,
      editedBy: data.userId || null,
      createdAt: now,
    });

    if (data.runId) {
      await this.appendEvent(data.runId, {
        runId: data.runId,
        type: 'context.block_added',
        actorType: 'human',
        actorId: data.userId || null,
        payload: {
          blockId,
          kind: data.kind,
          title: data.title,
          content: data.content,
        },
      });
    }

    return block;
  }

  async updateContextBlock(
    blockId: string,
    baseVersion: number,
    content: string,
    userId: string
  ) {
    const block = inMemoryDb.contextBlocks.get(blockId);
    if (!block) {
      throw new Error(`Context block ${blockId} not found`);
    }

    // Version conflict check (Section 12.4)
    if (block.currentVersion !== baseVersion) {
      const err: any = new Error(`Conflict: Base version ${baseVersion} does not match current version ${block.currentVersion}`);
      err.code = 'VERSION_CONFLICT';
      err.latestContent = block.content;
      err.latestVersion = block.currentVersion;
      throw err;
    }

    const nextVersion = block.currentVersion + 1;
    const fromVersion = block.currentVersion;
    block.currentVersion = nextVersion;
    block.content = content;

    inMemoryDb.contextVersions.set(`${blockId}:${nextVersion}`, {
      blockId,
      version: nextVersion,
      content,
      editedBy: userId,
      createdAt: new Date(),
    });

    // Append context.edited event if attached to a run
    if (block.runId) {
      await this.appendEvent(block.runId, {
        runId: block.runId,
        type: 'context.edited',
        actorType: 'human',
        actorId: userId,
        payload: {
          blockId,
          fromVersion,
          toVersion: nextVersion,
          summary: `Context block ${block.title} updated by user to v${nextVersion}`,
          content,
        },
      });
    }

    return block;
  }

  async acquireBlockLock(blockId: string, userId: string, ttlMs: number = 30000) {
    const block = inMemoryDb.contextBlocks.get(blockId);
    if (!block) throw new Error(`Context block ${blockId} not found`);

    const now = Date.now();
    if (block.lockedBy && block.lockedBy !== userId && block.lockExpiresAt && new Date(block.lockExpiresAt).getTime() > now) {
      const err: any = new Error(`Block is locked by another user`);
      err.code = 'LOCKED';
      err.lockedBy = block.lockedBy;
      throw err;
    }

    block.lockedBy = userId;
    block.lockExpiresAt = new Date(now + ttlMs);
    return { locked: true, lockedBy: userId, expiresAt: block.lockExpiresAt };
  }

  async releaseBlockLock(blockId: string, userId: string) {
    const block = inMemoryDb.contextBlocks.get(blockId);
    if (!block) return { released: true };

    if (block.lockedBy === userId) {
      block.lockedBy = null;
      block.lockExpiresAt = null;
    }
    return { released: true };
  }

  // ==========================================
  // PHASE 3: HANDOFFS & DRIVER TRANSFERS
  // ==========================================
  async createHandoff(orgId: string, runId: string, fromUserId: string | null, toUserId: string, kind: 'takeover' | 'handoff' | 'handback_to_agent', note?: string) {
    const handoffId = uuidv7();
    const handoff = {
      id: handoffId,
      orgId,
      runId,
      fromUserId,
      toUserId,
      kind,
      status: 'requested',
      note: note || '',
      createdAt: new Date(),
    };
    inMemoryDb.handoffs.set(handoffId, handoff);

    await this.appendEvent(runId, {
      runId,
      type: 'handoff.requested',
      actorType: 'human',
      actorId: fromUserId,
      payload: {
        handoffId,
        fromUserId,
        toUserId,
        note,
      },
    });

    return handoff;
  }

  async resolveHandoff(handoffId: string, status: 'accepted' | 'declined', resolvedByUserId?: string) {
    const handoff = inMemoryDb.handoffs.get(handoffId);
    if (!handoff) throw new Error(`Handoff ${handoffId} not found`);

    handoff.status = status;
    handoff.resolvedAt = new Date();

    if (status === 'accepted') {
      await this.appendEvent(handoff.runId, {
        runId: handoff.runId,
        type: 'handoff.accepted',
        actorType: 'human',
        actorId: resolvedByUserId || handoff.toUserId,
        payload: {
          handoffId,
        },
      });

      // Change driver to the recipient
      await this.appendEvent(handoff.runId, {
        runId: handoff.runId,
        type: 'driver.changed',
        actorType: 'system',
        actorId: null,
        payload: {
          from: { type: 'human', userId: handoff.fromUserId },
          to: { type: 'human', userId: handoff.toUserId },
        },
      });
    } else {
      await this.appendEvent(handoff.runId, {
        runId: handoff.runId,
        type: 'handoff.declined',
        actorType: 'human',
        actorId: resolvedByUserId || handoff.toUserId,
        payload: {
          handoffId,
          reason: 'Declined by recipient',
        },
      });
    }

    return handoff;
  }

  // ==========================================
  // PHASE 3: FORK WITH EDIT-AND-RERUN (Section 9.8)
  // ==========================================
  async forkRun(parentRunId: string, atSeq: number, editedMessage?: string, userId?: string) {
    const parentRun = inMemoryDb.runs.get(parentRunId);
    if (!parentRun) throw new Error(`Parent run ${parentRunId} not found`);

    const newRunId = uuidv7();
    const now = new Date();

    // 1. Create forked run
    const forkedRun = {
      ...parentRun,
      id: newRunId,
      title: `${parentRun.title} (Fork from Step ${atSeq})`,
      status: 'queued',
      parentRunId,
      forkedAtSeq: atSeq,
      lastSeq: 0,
      lastAppliedSeq: 0,
      createdAt: now,
    };
    inMemoryDb.runs.set(newRunId, forkedRun);

    // 2. Copy events 1..atSeq with new IDs
    const parentEvents = inMemoryDb.events.get(parentRunId) || [];
    const eventsToCopy = parentEvents.filter((e) => e.seq <= atSeq);
    const newEvents: EventEnvelope[] = [];

    for (const ev of eventsToCopy) {
      forkedRun.lastSeq++;
      const copiedEvent: EventEnvelope = {
        ...ev,
        id: uuidv7(),
        runId: newRunId,
        seq: forkedRun.lastSeq,
        createdAt: now.toISOString(),
      };
      newEvents.push(copiedEvent);
    }
    inMemoryDb.events.set(newRunId, newEvents);

    // 3. If editedMessage, append user message at fork point
    if (editedMessage) {
      await this.appendEvent(newRunId, {
        runId: newRunId,
        type: 'message.user',
        actorType: 'human',
        actorId: userId || null,
        payload: {
          text: editedMessage,
          mode: 'queue',
        },
      });
    }

    // 4. Bidirectional link: append run.forked to parent
    await this.appendEvent(parentRunId, {
      runId: parentRunId,
      type: 'run.forked',
      actorType: 'system',
      actorId: null,
      payload: {
        newRunId,
        atSeq,
      },
    });

    return forkedRun;
  }
}
