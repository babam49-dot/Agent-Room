import { uuidv7 } from '@agentroom/core';
import { inMemoryDb } from './repositories.js';
import { createDbPool, createDrizzleClient } from './client.js';
import * as schema from './schema.js';

export const SEEDED_DATA = {
  org: {
    id: '01935e40-0001-7000-8000-000000000001',
    name: 'Acme Engineering',
    slug: 'acme-engineering',
  },
  users: [
    {
      id: '01935e40-0002-7000-8000-000000000001',
      externalId: 'user_sara',
      name: 'Sara Chen',
      email: 'sara@acme.corp',
      role: 'owner' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&fit=crop',
    },
    {
      id: '01935e40-0002-7000-8000-000000000002',
      externalId: 'user_ahmed',
      name: 'Ahmed Hassan',
      email: 'ahmed@acme.corp',
      role: 'admin' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&fit=crop',
    },
    {
      id: '01935e40-0002-7000-8000-000000000003',
      externalId: 'user_lina',
      name: 'Lina Mori',
      email: 'lina@acme.corp',
      role: 'member' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop',
    },
  ],
  project: {
    id: '01935e40-0003-7000-8000-000000000001',
    name: 'Payments v2 Service',
    description: 'High throughput payments ingestion service migration to v2 REST spec',
    repoUrl: 'https://github.com/acme/payments-service',
  },
  run: {
    id: '01935e40-0004-7000-8000-000000000001',
    title: 'Migrate the payments endpoint to v2',
    goal: 'Migrate legacy /v1/charge endpoint to idempotent /v2/payments, update tests, and verify schema backward compatibility.',
    model: 'claude-sonnet-5-5',
    status: 'running',
  },
};

export async function seedDatabase(connectionString?: string) {
  // Always populate in-memory store
  const { org, users, project, run } = SEEDED_DATA;

  inMemoryDb.organizations.set(org.id, { ...org, createdAt: new Date() });

  for (const u of users) {
    inMemoryDb.users.set(u.id, {
      id: u.id,
      externalId: u.externalId,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      createdAt: new Date(),
    });
    inMemoryDb.memberships.set(`${org.id}:${u.id}`, {
      orgId: org.id,
      userId: u.id,
      role: u.role,
    });
  }

  inMemoryDb.projects.set(project.id, {
    id: project.id,
    orgId: org.id,
    name: project.name,
    description: project.description,
    repoUrl: project.repoUrl,
    createdAt: new Date(),
  });

  inMemoryDb.runs.set(run.id, {
    id: run.id,
    orgId: org.id,
    projectId: project.id,
    title: run.title,
    goal: run.goal,
    model: run.model,
    status: run.status,
    driverType: 'agent',
    driverUserId: null,
    createdBy: users[0]!.id,
    lastSeq: 0,
    lastAppliedSeq: 0,
    createdAt: new Date(),
  });

  const defaultInstructions =
    'Keep backwards compatibility for legacy v1 payloads.\nEnsure all money fields use integer cents (e.g. amountInCents).\nNever touch the internal billing ledger directly.';
  inMemoryDb.contextBlocks.set('cb-001', {
    id: 'cb-001',
    orgId: org.id,
    runId: run.id,
    projectId: project.id,
    kind: 'instructions',
    title: 'Project Instructions',
    position: 0,
    currentVersion: 1,
    enabled: true,
    content: defaultInstructions,
    lockedBy: null,
    lockExpiresAt: null,
    createdAt: new Date(),
  });
  inMemoryDb.contextVersions.set('cb-001:1', {
    blockId: 'cb-001',
    version: 1,
    content: defaultInstructions,
    editedBy: users[0]!.id,
    createdAt: new Date(),
  });

  // Attempt PostgreSQL seed if connected
  try {
    const pool = createDbPool(connectionString);
    const db = createDrizzleClient(pool);

    // Upsert org
    await db.insert(schema.organizations).values({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }).onConflictDoNothing();

    // Upsert users & memberships
    for (const u of users) {
      await db.insert(schema.users).values({
        id: u.id,
        externalId: u.externalId,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
      }).onConflictDoNothing();

      await db.insert(schema.memberships).values({
        orgId: org.id,
        userId: u.id,
        role: u.role,
      }).onConflictDoNothing();
    }

    // Upsert project
    await db.insert(schema.projects).values({
      id: project.id,
      orgId: org.id,
      name: project.name,
      description: project.description,
      repoUrl: project.repoUrl,
    }).onConflictDoNothing();

    // Upsert run
    await db.insert(schema.runs).values({
      id: run.id,
      orgId: org.id,
      projectId: project.id,
      title: run.title,
      goal: run.goal,
      model: run.model,
      status: run.status as any,
      driverType: 'agent',
      createdBy: users[0]!.id,
      lastSeq: 0,
      lastAppliedSeq: 0,
    }).onConflictDoNothing();

    await pool.end();
    console.log('[DB] PostgreSQL successfully seeded with Acme Engineering, 3 users, project, and run.');
  } catch (err) {
    console.log('[DB] Seed applied to in-memory store (PostgreSQL unavailable).');
  }

  return SEEDED_DATA;
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase().catch(console.error);
}
