import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  externalId: text('external_id').notNull().unique(), // Clerk user id or dev user id
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orgId, table.userId] }),
  ]
);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  repoUrl: text('repo_url'),
  defaultPolicyId: uuid('default_policy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    status: text('status', {
      enum: [
        'queued',
        'running',
        'paused',
        'awaiting_approval',
        'human_driving',
        'completed',
        'failed',
        'cancelled',
      ],
    }).notNull(),
    driverType: text('driver_type', { enum: ['agent', 'human'] })
      .notNull()
      .default('agent'),
    driverUserId: uuid('driver_user_id').references(() => users.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    parentRunId: uuid('parent_run_id'),
    forkedAtSeq: bigint('forked_at_seq', { mode: 'number' }),
    lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
    lastAppliedSeq: bigint('last_applied_seq', { mode: 'number' }).notNull().default(0),
    workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true }),
    model: text('model').notNull(),
    policyId: uuid('policy_id'),
    sandboxId: text('sandbox_id'),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    index('runs_org_project_created_idx').on(table.orgId, table.projectId, table.createdAt),
    index('runs_org_status_idx').on(table.orgId, table.status),
  ]
);

export const events = pgTable(
  'events',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    id: uuid('id').notNull().unique(),
    orgId: uuid('org_id').notNull(),
    type: text('type').notNull(),
    actorType: text('actor_type', { enum: ['agent', 'human', 'system'] }).notNull(),
    actorId: uuid('actor_id'),
    stepIndex: integer('step_index'),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.seq] }),
    index('events_run_type_idx').on(table.runId, table.type),
  ]
);

export const contextBlocks = pgTable('context_blocks', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  runId: uuid('run_id').references(() => runs.id),
  projectId: uuid('project_id').references(() => projects.id),
  kind: text('kind', { enum: ['instructions', 'notes', 'pinned_files', 'memory'] }).notNull(),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
  currentVersion: integer('current_version').notNull().default(1),
  enabled: boolean('enabled').notNull().default(true),
  lockedBy: uuid('locked_by').references(() => users.id),
  lockExpiresAt: timestamp('lock_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contextBlockVersions = pgTable(
  'context_block_versions',
  {
    blockId: uuid('block_id')
      .notNull()
      .references(() => contextBlocks.id),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    editedBy: uuid('edited_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockId, table.version] }),
  ]
);

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  toolCallId: text('tool_call_id').notNull(),
  toolName: text('tool_name').notNull(),
  arguments: jsonb('arguments').notNull(),
  reason: text('reason'),
  status: text('status', { enum: ['pending', 'approved', 'denied', 'expired'] })
    .notNull()
    .default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionNote: text('decision_note'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  targetSeq: bigint('target_seq', { mode: 'number' }).notNull(),
  parentId: uuid('parent_id'),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  directsAgent: boolean('directs_agent').notNull().default(false),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const handoffs = pgTable('handoffs', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  fromUserId: uuid('from_user_id').references(() => users.id),
  toUserId: uuid('to_user_id').references(() => users.id),
  kind: text('kind', { enum: ['takeover', 'handoff', 'handback_to_agent'] }).notNull(),
  status: text('status', { enum: ['requested', 'accepted', 'declined', 'completed'] }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  rules: jsonb('rules').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blobs = pgTable('blobs', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeItems = pgTable('knowledge_items', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  projectId: uuid('project_id').references(() => projects.id),
  runId: uuid('run_id').references(() => runs.id),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull(),
  tags: text('tags').array().notNull().default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
