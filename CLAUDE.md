# AgentRoom: Master Build Prompt
Built for the Y Combinator Fall 2026 RFS: Multiplayer AI.

What this system does, in one paragraph: a teammate starts a long-running coding agent task in a shared room. Everyone on the team sees the agent plan, call tools, and write code live. Anyone can comment on a step, pause the agent, edit its context, approve or deny risky actions, or take over and drive the task manually, then hand it back. Every action is recorded in an append-only event log, so the whole history is replayable, auditable, and searchable as team knowledge.

## 1. Operating rules for the coding agent
You are a senior full-stack TypeScript engineer building a production-grade MVP. Follow these rules for the entire project.
1. Read this whole document before writing any code. Then write a short plan in PROGRESS.md.
2. Build in thin vertical slices: shared types, then database, then API, then UI, then tests. Never build a layer that nothing uses yet.
3. Do not invent library APIs. Before using a library, read its installed type definitions or official docs. If unsure, write a tiny spike script to verify behavior.
4. TypeScript strict mode everywhere. No any. Validate every external input (HTTP, WebSocket, queue payloads, LLM output, tool arguments) with Zod.
5. The event log is the single source of truth for run state. Never mutate run state without appending an event.
6. Keep business logic in pure functions inside packages/core so that the server, worker, and browser share it.
7. Before saying a task is done: run typecheck, lint, unit tests, and the relevant integration tests. Paste the results into PROGRESS.md.
8. Keep DECISIONS.md (what and why) and PROGRESS.md (checklist per phase) up to date.
9. Do not ask the founder questions unless truly blocked. Otherwise pick the simplest option that satisfies this document and log it.
10. Never commit secrets. Provide .env.example only.
11. Use conventional commits. One logical change per commit.
12. Prefer boring technology and small dependencies. Every new dependency needs a one-line justification in DECISIONS.md.
13. Build the simulator and scripted provider first (Section 9.9) so the whole product can be demoed and tested without spending LLM credits.

## 2. Product definition
### 2.1 One-line pitch
Figma for agent runs: a live shared room where a whole engineering team can watch, steer, and take over long-running AI agent tasks.

### 2.2 The problem
Agent sessions today are single-player. One person prompts one agent in a private chat. Teammates cannot see progress, cannot correct a wrong turn, and cannot continue the work if the owner is away. Context is lost when the chat closes, so the team repeats the same mistakes.

### 2.3 Target user (the wedge)
Engineering teams of 3 to 30 developers who run coding agents on tasks that take 10 minutes to several hours: refactors, migrations, bug investigations, test generation, dependency upgrades, incident debugging. Sales and support are explicitly out of scope for v1.

### 2.4 Jobs to be done
• J1: Start a long-running agent task in a shared workspace.
• J2: Let teammates see the plan, steps, tool calls, and outputs live.
• J3: Let anyone with access redirect, pause, or approve the agent mid-task.
• J4: Hand off a running task from one person to another cleanly.
• J5: Keep a shared history of what the agent did and why.
• J6: Turn finished sessions into a searchable team knowledge base.

### 2.5 Non-goals for v1
Multi-agent orchestration, voice, mobile apps, a code editor replacement, billing, self-hosting packaging, compliance tooling, support or sales workflows.

### 2.6 Product principles
1. The agent is a participant, not the owner. A human can always override it.
2. Nothing happens silently. Every action is visible, attributable, and recorded.
3. Steering must feel instant: under 300 ms from click to visible effect in the UI, and effect on agent behavior within one agent step.
4. Safe by default. Risky tools require approval.
5. Replay everything. Any past moment of a run can be reconstructed from events.

## 3. Glossary
- **Organization**: A team account. All data is scoped to one organization.
- **Project**: A group of related runs, usually mapped to one repository.
- **Run**: One agent task. Has a goal, a status, a driver, and an event log.
- **Event**: An immutable, ordered fact about a run (tool call, message, edit, comment).
- **Step**: One loop iteration: a model call plus the tool calls it requested.
- **Driver**: Who currently controls the run: the agent, or one specific human.
- **Participant**: Anyone viewing or acting on a run: humans and the agent.
- **Context block**: An editable, versioned piece of agent context (instructions, notes, pinned files).
- **Approval**: A pending request for a human to allow or deny a tool call.
- **Handoff**: Transfer of the driver role from one participant to another.
- **Fork**: A new run that starts from an earlier step of an existing run.
- **Policy**: Rules deciding if a tool call is allowed, needs approval, or is denied.
- **Control point**: A place in the agent loop where pending human input is applied.

## 4. Final tech stack
- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript (strict), Node.js 22 LTS
- **Frontend**: Next.js (App Router, latest stable) + React + Tailwind CSS + shadcn/ui
- **Client state**: Zustand + TanStack Query
- **Timeline rendering**: TanStack Virtual
- **Graph view**: React Flow (@xyflow/react)
- **Rich text (context)**: TipTap now, Yjs binding in Phase 5
- **API and realtime service**: Fastify + Zod type provider
- **WebSocket**: ws through @fastify/websocket
- **Event streaming**: Server-Sent Events
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM + drizzle-kit
- **Pub/sub and presence**: Redis 7 (ioredis)
- **Job queue**: pg-boss (Postgres-backed)
- **Agent LLM**: Anthropic API via @anthropic-ai/sdk (claude-sonnet-5-5 default)
- **Sandbox**: Docker via dockerode for MVP, FakeSandbox for tests & demo, E2B later
- **Auth**: Clerk behind AuthProvider interface with local dev bypass
- **Validation**: Zod
- **Testing**: Vitest, Playwright, fast-check
- **UI Theme**: Claude aesthetic (warm neutral, clean typography, monospace outputs, accessible)

## 5. Repository layout
```
agentroom/
  apps/
    web/                 Next.js frontend
    api/                 Fastify: REST, SSE, WebSocket
    worker/              Agent runtime: pg-boss consumers, loop, sandbox
  packages/
    core/                Pure logic: event schemas, reducer, state machine, policy engine
    db/                  Drizzle schema, migrations, repositories
    agent/               Loop, providers (anthropic, scripted), tools, sandbox drivers
    ui/                  Shared React components (timeline, cards, presence)
    config/              tsconfig, eslint, prettier presets
  docker-compose.yml     postgres, redis
  turbo.json
  CLAUDE.md
  PROGRESS.md
  DECISIONS.md
  .env.example
```

## 6. Operating & Acceptance Rules
Refer to Sections 6-18 of the master brief.
All database access is partitioned by org_id.
Gapless seq per run is strictly maintained via atomic transaction row locks.
Replay from events must match server snapshot deterministically.
