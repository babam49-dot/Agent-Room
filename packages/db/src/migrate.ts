import { createDbPool } from './client.js';

export async function runMigrations() {
  console.log('[DB] Running migrations...');
  try {
    const pool = createDbPool();
    const client = await pool.connect();
    
    // Migration SQL creating tables if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS memberships (
        org_id UUID NOT NULL REFERENCES organizations(id),
        user_id UUID NOT NULL REFERENCES users(id),
        role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
        PRIMARY KEY (org_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        description TEXT,
        repo_url TEXT,
        default_policy_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS runs (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        project_id UUID NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','running','paused','awaiting_approval','human_driving','completed','failed','cancelled')),
        driver_type TEXT NOT NULL DEFAULT 'agent' CHECK (driver_type IN ('agent','human')),
        driver_user_id UUID REFERENCES users(id),
        created_by UUID NOT NULL REFERENCES users(id),
        parent_run_id UUID REFERENCES runs(id),
        forked_at_seq BIGINT,
        last_seq BIGINT NOT NULL DEFAULT 0,
        last_applied_seq BIGINT NOT NULL DEFAULT 0,
        worker_heartbeat_at TIMESTAMPTZ,
        model TEXT NOT NULL,
        policy_id UUID,
        sandbox_id TEXT,
        summary TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS events (
        run_id UUID NOT NULL REFERENCES runs(id),
        seq BIGINT NOT NULL,
        id UUID NOT NULL UNIQUE,
        org_id UUID NOT NULL,
        type TEXT NOT NULL,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('agent','human','system')),
        actor_id UUID,
        step_index INT,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (run_id, seq)
      );

      CREATE TABLE IF NOT EXISTS context_blocks (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        run_id UUID REFERENCES runs(id),
        project_id UUID REFERENCES projects(id),
        kind TEXT NOT NULL CHECK (kind IN ('instructions','notes','pinned_files','memory')),
        title TEXT NOT NULL,
        position INT NOT NULL DEFAULT 0,
        current_version INT NOT NULL DEFAULT 1,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        locked_by UUID REFERENCES users(id),
        lock_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS context_block_versions (
        block_id UUID NOT NULL REFERENCES context_blocks(id),
        version INT NOT NULL,
        content TEXT NOT NULL,
        edited_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (block_id, version)
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        run_id UUID NOT NULL REFERENCES runs(id),
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        arguments JSONB NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
        decided_by UUID REFERENCES users(id),
        decision_note TEXT,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        run_id UUID NOT NULL REFERENCES runs(id),
        target_seq BIGINT NOT NULL,
        parent_id UUID REFERENCES comments(id),
        author_id UUID NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        directs_agent BOOLEAN NOT NULL DEFAULT FALSE,
        resolved BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS handoffs (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        run_id UUID NOT NULL REFERENCES runs(id),
        from_user_id UUID REFERENCES users(id),
        to_user_id UUID REFERENCES users(id),
        kind TEXT NOT NULL CHECK (kind IN ('takeover','handoff','handback_to_agent')),
        status TEXT NOT NULL CHECK (status IN ('requested','accepted','declined','completed')),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS policies (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        rules JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blobs (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        run_id UUID NOT NULL REFERENCES runs(id),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS knowledge_items (
        id UUID PRIMARY KEY,
        org_id UUID NOT NULL REFERENCES organizations(id),
        project_id UUID REFERENCES projects(id),
        run_id UUID REFERENCES runs(id),
        title TEXT NOT NULL,
        body_md TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add immutable event trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION forbid_event_mutation() RETURNS TRIGGER AS $$
      BEGIN RAISE EXCEPTION 'events are append-only'; END; $$ LANGUAGE plpgsql;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'events_immutable') THEN
          CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON events
          FOR EACH ROW EXECUTE FUNCTION forbid_event_mutation();
        END IF;
      END $$;
    `);

    client.release();
    await pool.end();
    console.log('[DB] Migrations applied successfully to PostgreSQL.');
  } catch (err) {
    console.log('[DB] Migration skipped for external PG:', (err as Error).message);
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations().catch(console.error);
}
