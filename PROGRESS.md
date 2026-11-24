# AgentRoom Progress & Checklist (PROGRESS.md)

## Phase 0: Foundations (Status: COMPLETE ✓)
- [x] Task 0.1: Initialize Git repo and monorepo root structure (pnpm workspace, turbo.json, root package.json, tsconfig.base.json) (1h)
- [x] Task 0.2: Configure docker-compose.yml for Postgres 16 and Redis 7 with persistent volume & health checks (0.5h)
- [x] Task 0.3: Create packages/config (shared tsconfig presets, eslint/prettier) (0.5h)
- [x] Task 0.4: Create packages/core foundational exports: UUIDv7 generator, base event types, environment schema (1h)
- [x] Task 0.5: Create packages/db with Drizzle ORM schema for all tables (organizations, users, memberships, projects, runs, events with immutability trigger, context blocks, approvals, comments, handoffs, policies, blobs, knowledge items) (2h)
- [x] Task 0.6: Setup database migrations and seed script with test org, 3 users (Sara, Ahmed, Lina), sample project (1h)
- [x] Task 0.7: Implement AuthProvider interface with AUTH_DEV_BYPASS and mock user switcher token generator (1h)
- [x] Task 0.8: Setup apps/api baseline with Fastify, health endpoints (/healthz, /readyz), CORS, Zod type provider (1.5h)
- [x] Task 0.9: Setup apps/worker baseline with pg-boss initialization and runner skeleton (1h)
- [x] Task 0.10: Setup apps/web baseline with Next.js App Router, Tailwind CSS, Claude-inspired theme, user switcher, health/dashboard smoke test (2h)
- [x] Task 0.11: Verification & Phase 0 acceptance validation (pnpm dev starts everything, seeded users sign in, health checks pass) (1h)

### Phase 0 Test Results:
```text
✓ packages/core/src/__tests__/core.test.ts (8 tests passed)
  - UUIDv7 Generator (RFC 9562 format & chronological ordering)
  - State Machine (allowed transitions & terminal status locking)
  - Policy Engine (safe allowlist, rm -rf deny, approval triggers)
  - Secret Redactor (Anthropic sk-ant-* and private key stripping)
  - Shared Reducer applyEvent (deterministic state rebuilding)
  - Realtime Auth Tokens (HMAC-SHA256 5-minute JWT verification)

✓ test-phase0.ts:
  - GET /healthz -> 200 OK
  - GET /readyz -> 200 OK
  - GET /v1/auth/users -> 200 OK (Sara Chen, Ahmed Hassan, Lina Mori)
  - POST /v1/realtime-token -> 200 OK (JWT issued)
  - GET /v1/projects -> 200 OK
  - GET /v1/runs/:id -> 200 OK
```

## Phase 1: Shared Live Run Viewer (Status: Next Phase)
- [x] Task 1.1: packages/core event schemas & pure reducer (`applyEvent`) + state machine (2h)
- [x] Task 1.2: packages/db `appendEvent` transaction with atomic `runs.last_seq` lock and Redis publication (2h)
- [x] Task 1.3: packages/agent ScriptedProvider and FakeSandbox implementation (2h)
- [x] Task 1.4: apps/api REST endpoints for run creation, snapshot, event history (2h)
- [ ] Task 1.5: apps/api SSE endpoint (`/v1/runs/:runId/stream`) with Redis subscription + buffer + Last-Event-ID catchup (2h)
- [ ] Task 1.6: apps/api WebSocket gateway for presence & ephemeral focus (1.5h)
- [ ] Task 1.7: apps/worker loop integration for ScriptedProvider (2h)
- [x] Task 1.8: apps/web Claude-style run screen timeline with presence indicators, auto-scroll & steering composer (2.5h)
- [ ] Task 1.9: Multi-client synchronization test & 10,000-event stress test validation (2h)
