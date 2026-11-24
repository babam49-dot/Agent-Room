import type {
  DriverType,
  EventEnvelope,
  PlanItem,
  RunStatus,
} from './events.js';

export interface StepToolCall {
  toolCallId: string;
  name: string;
  arguments: Record<string, any>;
  status: 'requested' | 'awaiting_approval' | 'approved' | 'denied' | 'running' | 'completed' | 'failed' | 'skipped';
  approvalId?: string;
  approvalNote?: string;
  ok?: boolean;
  output?: string;
  outputRef?: string;
  durationMs?: number;
}

export interface RunStep {
  stepIndex: number;
  message?: {
    messageId: string;
    text: string;
    aborted?: boolean;
    abortReason?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
  };
  toolCalls: StepToolCall[];
  comments: Array<{
    commentId: string;
    targetSeq: number;
    authorId: string;
    body: string;
    directsAgent: boolean;
    resolved: boolean;
  }>;
}

export interface ContextBlockState {
  blockId: string;
  kind: 'instructions' | 'notes' | 'pinned_files' | 'memory';
  title: string;
  content: string;
  version: number;
  lockedBy?: string | null;
  lockExpiresAt?: string | null;
}

export interface RunState {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  goal: string;
  model: string;
  policyId?: string | null;
  sandboxId?: string | null;
  status: RunStatus;
  driver: {
    type: DriverType;
    userId: string | null;
  };
  lastSeq: number;
  lastAppliedSeq: number;
  plan: PlanItem[];
  steps: RunStep[];
  contextBlocks: Record<string, ContextBlockState>;
  pendingApprovals: Record<string, {
    approvalId: string;
    toolCallId: string;
    name: string;
    arguments: Record<string, any>;
    reason?: string;
    requestedAt: string;
  }>;
  summary?: string;
  error?: string;
}

export function createInitialRunState(runId: string, orgId: string = '', projectId: string = ''): RunState {
  return {
    id: runId,
    orgId,
    projectId,
    title: '',
    goal: '',
    model: 'claude-sonnet-5-5',
    policyId: null,
    sandboxId: null,
    status: 'queued',
    driver: {
      type: 'agent',
      userId: null,
    },
    lastSeq: 0,
    lastAppliedSeq: 0,
    plan: [],
    steps: [],
    contextBlocks: {},
    pendingApprovals: {},
  };
}

function ensureStep(state: RunState, stepIndex: number | null): RunStep {
  const index = stepIndex ?? (state.steps.length > 0 ? state.steps[state.steps.length - 1]!.stepIndex : 0);
  let step = state.steps.find((s) => s.stepIndex === index);
  if (!step) {
    step = {
      stepIndex: index,
      toolCalls: [],
      comments: [],
    };
    state.steps.push(step);
    state.steps.sort((a, b) => a.stepIndex - b.stepIndex);
  }
  return step;
}

export function applyEvent(state: RunState, e: EventEnvelope): RunState {
  // Deep clone or functional update
  const next: RunState = {
    ...state,
    lastSeq: Math.max(state.lastSeq, e.seq),
    plan: [...state.plan],
    steps: state.steps.map((s) => ({
      ...s,
      toolCalls: s.toolCalls.map((tc) => ({ ...tc })),
      comments: s.comments.map((c) => ({ ...c })),
    })),
    contextBlocks: { ...state.contextBlocks },
    pendingApprovals: { ...state.pendingApprovals },
    driver: { ...state.driver },
  };

  switch (e.type) {
    case 'run.created': {
      next.goal = e.payload.goal;
      next.projectId = e.payload.projectId;
      next.model = e.payload.model;
      next.policyId = e.payload.policyId ?? null;
      next.status = 'queued';
      break;
    }

    case 'run.started': {
      next.sandboxId = e.payload.sandboxId;
      next.status = 'running';
      break;
    }

    case 'run.status_changed': {
      next.status = e.payload.to;
      break;
    }

    case 'plan.updated': {
      next.plan = e.payload.items;
      break;
    }

    case 'message.assistant': {
      const step = ensureStep(next, e.stepIndex);
      step.message = {
        messageId: e.payload.messageId,
        text: e.payload.text,
        usage: e.payload.usage,
      };
      break;
    }

    case 'message.assistant.aborted': {
      const step = ensureStep(next, e.stepIndex);
      step.message = {
        messageId: e.payload.messageId,
        text: e.payload.partialText,
        aborted: true,
        abortReason: e.payload.reason,
      };
      break;
    }

    case 'tool.requested': {
      const step = ensureStep(next, e.stepIndex);
      let call = step.toolCalls.find((tc) => tc.toolCallId === e.payload.toolCallId);
      if (!call) {
        call = {
          toolCallId: e.payload.toolCallId,
          name: e.payload.name,
          arguments: e.payload.arguments,
          status: 'requested',
        };
        step.toolCalls.push(call);
      }
      break;
    }

    case 'approval.requested': {
      const step = ensureStep(next, e.stepIndex);
      const call = step.toolCalls.find((tc) => tc.toolCallId === e.payload.toolCallId);
      if (call) {
        call.status = 'awaiting_approval';
        call.approvalId = e.payload.approvalId;
      }
      next.pendingApprovals[e.payload.approvalId] = {
        approvalId: e.payload.approvalId,
        toolCallId: e.payload.toolCallId,
        name: e.payload.name,
        arguments: e.payload.arguments,
        reason: e.payload.reason,
        requestedAt: e.createdAt,
      };
      next.status = 'awaiting_approval';
      break;
    }

    case 'approval.decided': {
      const approval = next.pendingApprovals[e.payload.approvalId];
      if (approval) {
        for (const step of next.steps) {
          const call = step.toolCalls.find((tc) => tc.toolCallId === approval.toolCallId);
          if (call) {
            call.status = e.payload.decision === 'approved' ? 'approved' : 'denied';
            call.approvalNote = e.payload.note;
            break;
          }
        }
        delete next.pendingApprovals[e.payload.approvalId];
      }
      if (Object.keys(next.pendingApprovals).length === 0 && next.status === 'awaiting_approval') {
        next.status = 'running';
      }
      break;
    }

    case 'tool.started': {
      const step = ensureStep(next, e.stepIndex);
      const call = step.toolCalls.find((tc) => tc.toolCallId === e.payload.toolCallId);
      if (call) {
        call.status = 'running';
      }
      break;
    }

    case 'tool.result': {
      const step = ensureStep(next, e.stepIndex);
      let call = step.toolCalls.find((tc) => tc.toolCallId === e.payload.toolCallId);
      if (!call) {
        call = {
          toolCallId: e.payload.toolCallId,
          name: 'unknown',
          arguments: {},
          status: 'completed',
        };
        step.toolCalls.push(call);
      }
      call.status = e.payload.ok ? 'completed' : 'failed';
      call.ok = e.payload.ok;
      call.output = e.payload.output;
      call.outputRef = e.payload.outputRef;
      call.durationMs = e.payload.durationMs;
      break;
    }

    case 'context.block_added': {
      next.contextBlocks[e.payload.blockId] = {
        blockId: e.payload.blockId,
        kind: e.payload.kind,
        title: e.payload.title,
        content: e.payload.content ?? '',
        version: 1,
      };
      break;
    }

    case 'context.edited': {
      const block = next.contextBlocks[e.payload.blockId];
      if (block) {
        block.version = e.payload.toVersion;
        if (e.payload.content !== undefined) {
          block.content = e.payload.content;
        }
      }
      break;
    }

    case 'context.block_removed': {
      delete next.contextBlocks[e.payload.blockId];
      break;
    }

    case 'comment.added': {
      // Find step containing targetSeq or default to latest
      const step = next.steps[next.steps.length - 1] ?? ensureStep(next, 0);
      step.comments.push({
        commentId: e.payload.commentId,
        targetSeq: e.payload.targetSeq,
        authorId: e.actorId ?? 'unknown',
        body: e.payload.body,
        directsAgent: e.payload.directsAgent,
        resolved: false,
      });
      break;
    }

    case 'comment.resolved': {
      for (const step of next.steps) {
        const comment = step.comments.find((c) => c.commentId === e.payload.commentId);
        if (comment) {
          comment.resolved = true;
          break;
        }
      }
      break;
    }

    case 'run.paused': {
      next.status = 'paused';
      break;
    }

    case 'run.resumed': {
      next.status = 'running';
      break;
    }

    case 'driver.changed': {
      next.driver = {
        type: e.payload.to.type,
        userId: e.payload.to.userId,
      };
      if (next.driver.type === 'human') {
        next.status = 'human_driving';
      } else if (next.status === 'human_driving') {
        next.status = 'running';
      }
      break;
    }

    case 'run.completed': {
      next.status = 'completed';
      next.summary = e.payload.summary;
      break;
    }

    case 'run.failed': {
      next.status = 'failed';
      next.error = e.payload.error;
      break;
    }

    case 'run.cancelled': {
      next.status = 'cancelled';
      next.summary = e.payload.summary;
      break;
    }

    case 'run.summarized': {
      next.summary = e.payload.summary;
      break;
    }

    default:
      break;
  }

  return next;
}
