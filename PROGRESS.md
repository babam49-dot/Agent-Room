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

## Phase 1: Shared Live Run Viewer (Status: COMPLETE ✓)
- [x] Task 1.1: packages/core event schemas & pure reducer (`applyEvent`) + state machine (2h)
- [x] Task 1.2: packages/db `appendEvent` transaction with atomic `runs.last_seq` lock and Redis publication (2h)
- [x] Task 1.3: packages/agent ScriptedProvider, FakeSandbox, and AgentRunner implementation (2h)
- [x] Task 1.4: apps/api REST endpoints for run creation, snapshot, event history (2h)
- [x] Task 1.5: apps/api SSE endpoint (`/v1/runs/:runId/stream`) with buffer + Last-Event-ID catchup + raw socket hijack (2h)
- [x] Task 1.6: apps/api WebSocket gateway for presence & ephemeral focus (`/v1/ws`) (1.5h)
- [x] Task 1.7: apps/worker & agent loop runner integration with control channel listeners (2h)
- [x] Task 1.8: apps/web Claude-style run screen timeline with live SSE, presence indicators, auto-scroll, jump to live & steering composer (2.5h)
- [x] Task 1.9: Multi-client synchronization test & 10,000-event stress test validation (2h)

### Phase 1 Acceptance Test Results:
```text
====================================================
   VERIFYING PHASE 1: SHARED LIVE RUN VIEWER        
====================================================

[Test 1/4] Two Clients Connecting to Live SSE Stream:
  ✓ Client 1 received 32 events.
  ✓ Client 2 received 32 events.
  ✓ Both clients saw identical, strictly ordered events (synchronized in real-time within <300ms).

[Test 2/4] Reconnection with Last-Event-ID catchup:
  ✓ Reconnected client with after=3 received 23 catchup events.
  ✓ Zero duplicate events, zero missing events on resume.

[Test 3/4] Replay Test: applyEvent(events) === Server Snapshot:
  ✓ Replayed 26 events from immutable log.
  ✓ Replayed state matches server snapshot identically at lastSeq=26 (status: completed).

[Test 4/4] Performance Test: 10,000-event Reducer Throughput:
  ✓ Pure reducer processed 10,000 events in memory with zero degradation.
```
