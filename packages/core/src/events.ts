import { z } from 'zod';

export const ActorTypeSchema = z.enum(['agent', 'human', 'system']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'awaiting_approval',
  'human_driving',
  'completed',
  'failed',
  'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const DriverTypeSchema = z.enum(['agent', 'human']);
export type DriverType = z.infer<typeof DriverTypeSchema>;

export const PlanItemStatusSchema = z.enum(['pending', 'in_progress', 'done', 'skipped']);
export type PlanItemStatus = z.infer<typeof PlanItemStatusSchema>;

export const PlanItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: PlanItemStatusSchema,
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const ToolRiskSchema = z.enum(['read', 'write', 'exec', 'network', 'meta']);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

// Event Payloads
export const EventPayloadSchemas = {
  'run.created': z.object({
    goal: z.string(),
    projectId: z.string(),
    model: z.string(),
    policyId: z.string().nullable().optional(),
    scriptName: z.string().optional(),
  }),
  'run.started': z.object({
    sandboxId: z.string(),
  }),
  'run.status_changed': z.object({
    from: RunStatusSchema,
    to: RunStatusSchema,
    reason: z.string().optional(),
  }),
  'plan.updated': z.object({
    items: z.array(PlanItemSchema),
  }),
  'message.user': z.object({
    text: z.string(),
    mode: z.enum(['queue', 'interrupt']).default('queue'),
  }),
  'message.assistant': z.object({
    messageId: z.string(),
    text: z.string(),
    stopReason: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
      })
      .optional(),
  }),
  'message.assistant.aborted': z.object({
    messageId: z.string(),
    partialText: z.string(),
    reason: z.string(),
  }),
  'tool.requested': z.object({
    toolCallId: z.string(),
    name: z.string(),
    arguments: z.record(z.any()),
  }),
  'approval.requested': z.object({
    approvalId: z.string(),
    toolCallId: z.string(),
    name: z.string(),
    arguments: z.record(z.any()),
    reason: z.string().optional(),
  }),
  'approval.decided': z.object({
    approvalId: z.string(),
    decision: z.enum(['approved', 'denied']),
    note: z.string().optional(),
  }),
  'tool.started': z.object({
    toolCallId: z.string(),
  }),
  'tool.result': z.object({
    toolCallId: z.string(),
    ok: z.boolean(),
    output: z.string(),
    outputRef: z.string().optional(),
    durationMs: z.number().optional(),
  }),
  'context.edited': z.object({
    blockId: z.string(),
    fromVersion: z.number(),
    toVersion: z.number(),
    summary: z.string(),
    content: z.string().optional(),
  }),
  'context.block_added': z.object({
    blockId: z.string(),
    kind: z.enum(['instructions', 'notes', 'pinned_files', 'memory']),
    title: z.string(),
    content: z.string().optional(),
  }),
  'context.block_removed': z.object({
    blockId: z.string(),
  }),
  'context.compacted': z.object({
    upToSeq: z.number(),
    summary: z.string(),
  }),
  'comment.added': z.object({
    commentId: z.string(),
    targetSeq: z.number(),
    body: z.string(),
    directsAgent: z.boolean().default(false),
  }),
  'comment.resolved': z.object({
    commentId: z.string(),
  }),
  'run.pause_requested': z.object({
    reason: z.string().optional(),
  }),
  'run.paused': z.object({
    atStep: z.number().nullable().optional(),
  }),
  'run.resumed': z.object({
    note: z.string().optional(),
  }),
  'handoff.requested': z.object({
    handoffId: z.string(),
    fromUserId: z.string().nullable(),
    toUserId: z.string(),
    note: z.string().optional(),
  }),
  'handoff.accepted': z.object({
    handoffId: z.string(),
  }),
  'handoff.declined': z.object({
    handoffId: z.string(),
    reason: z.string().optional(),
  }),
  'driver.changed': z.object({
    from: z.object({
      type: DriverTypeSchema,
      userId: z.string().nullable(),
    }),
    to: z.object({
      type: DriverTypeSchema,
      userId: z.string().nullable(),
    }),
  }),
  'run.forked': z.object({
    newRunId: z.string(),
    atSeq: z.number(),
  }),
  'run.completed': z.object({
    summary: z.string().optional(),
  }),
  'run.failed': z.object({
    error: z.string(),
  }),
  'run.cancelled': z.object({
    summary: z.string().optional(),
  }),
  'run.summarized': z.object({
    summary: z.string(),
    knowledgeItemId: z.string(),
  }),
} as const;

export type EventType = keyof typeof EventPayloadSchemas;

export type PayloadOf<T extends EventType> = z.infer<(typeof EventPayloadSchemas)[T]>;

export interface EventEnvelope<T extends EventType = EventType> {
  id: string; // UUIDv7
  runId: string;
  seq: number; // assigned by DB, gapless per run
  type: T;
  actorType: ActorType;
  actorId: string | null;
  stepIndex: number | null;
  payload: PayloadOf<T>;
  createdAt: string; // ISO string
}

export interface DraftEvent<T extends EventType = EventType> {
  id?: string;
  runId: string;
  type: T;
  actorType: ActorType;
  actorId: string | null;
  stepIndex?: number | null;
  payload: PayloadOf<T>;
}
