import type { RunStatus } from './events.js';

export const ALLOWED_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['paused', 'awaiting_approval', 'human_driving', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'human_driving', 'cancelled', 'failed'],
  awaiting_approval: ['running', 'human_driving', 'cancelled', 'failed'],
  human_driving: ['running', 'paused', 'completed', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function isTerminal(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
