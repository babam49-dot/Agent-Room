# Architectural Decisions Log (DECISIONS.md)

| Date | ID | Decision | Rationale | Alternatives Considered |
|------|----|----------|-----------|-------------------------|
| 2026-11-24 | DEC-001 | Monorepo structure with pnpm workspaces + Turborepo | Standard, high performance, strict workspace boundaries per Section 5 | npm/yarn workspaces, Nx |
| 2026-11-24 | DEC-002 | TypeScript Strict Mode + ESM throughout | Strict type safety, prevents `any`, seamless shared types across web/api/worker | CommonJS |
| 2026-11-24 | DEC-003 | UUIDv7 (uuid v7 / uuidv7) for time-ordered IDs | Time-ordered keys improve database index performance and provide natural chronological sorting | UUIDv4, ULID |
| 2026-11-24 | DEC-004 | Fastify for API + SSE + WebSocket | High performance, lightweight, native connection handling for SSE and WS | Express (slower, poor SSE/WS integration), Next.js route handlers (cannot hold persistent connections reliably) |
| 2026-11-24 | DEC-005 | Drizzle ORM with Postgres 16 | Close to SQL, strongly typed, low overhead, supports triggers and JSONB | Prisma (heavy engine, slower migrations) |
| 2026-11-24 | DEC-006 | Claude-inspired UI design system | Warm neutral surfaces, clean typography, monospace tool outputs, accessible focus rings, responsive timeline and graph view | Generic Tailwind templates |
| 2026-11-24 | DEC-007 | AuthProvider with AUTH_DEV_BYPASS | Enables immediate multi-user local testing (Sara, Ahmed, Lina) with instant user switcher without external Clerk account requirement | Hardcoded auth, mock cookies |
| 2026-11-24 | DEC-008 | Gapless sequence locking using `FOR UPDATE` on `runs.last_seq` | Guarantees gapless event ordering per run and enforces event immutability via DB trigger | Optimistic concurrency (can produce gaps) |
| 2026-11-25 | DEC-009 | Fastify `reply.hijack()` for Server-Sent Events | Fastify raw socket control is required to stream chunked SSE lines continuously without waiting for route handler completion | Native node http server, Express |
