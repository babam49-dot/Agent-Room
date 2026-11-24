import type { ToolRisk } from './events.js';

export type PolicyAction = 'allow' | 'ask' | 'deny';

export interface PolicyRule {
  tool: string;
  match?: {
    command?: string;
    sub?: string;
    path?: string;
  };
  action: PolicyAction;
}

export interface PolicyLimits {
  maxSteps: number;
  maxTokens: number;
  maxMinutes: number;
}

export interface Policy {
  defaults: Record<ToolRisk, PolicyAction>;
  rules: PolicyRule[];
  limits: PolicyLimits;
  approverRole: 'owner' | 'admin' | 'member' | 'viewer';
}

export const defaultPolicy: Policy = {
  defaults: {
    read: 'allow',
    write: 'allow',
    exec: 'ask',
    network: 'deny',
    meta: 'allow',
  },
  rules: [
    {
      tool: 'run_command',
      match: { command: '^(ls|cat|pwd|git status|git diff|pnpm test.*|npm test.*)$' },
      action: 'allow',
    },
    {
      tool: 'run_command',
      match: { command: 'rm -rf|curl|wget|sudo' },
      action: 'deny',
    },
    {
      tool: 'git',
      match: { sub: 'push' },
      action: 'ask',
    },
    {
      tool: 'write_file',
      match: { path: '^(.env|.github/)' },
      action: 'ask',
    },
  ],
  limits: {
    maxSteps: 100,
    maxTokens: 2_000_000,
    maxMinutes: 120,
  },
  approverRole: 'member',
};

export interface ToolCallEvaluation {
  tool: string;
  risk: ToolRisk;
  arguments: Record<string, any>;
}

export function evaluatePolicy(
  call: ToolCallEvaluation,
  policy: Policy = defaultPolicy
): PolicyAction {
  // Rules evaluated top to bottom, first match wins
  for (const rule of policy.rules) {
    if (rule.tool !== call.tool) continue;

    if (!rule.match) {
      return rule.action;
    }

    let matches = true;

    if (rule.match.command && typeof call.arguments.command === 'string') {
      const regex = new RegExp(rule.match.command);
      if (!regex.test(call.arguments.command)) {
        matches = false;
      }
    }

    if (rule.match.sub && typeof call.arguments.sub === 'string') {
      if (rule.match.sub !== call.arguments.sub) {
        matches = false;
      }
    }

    if (rule.match.path && typeof call.arguments.path === 'string') {
      const regex = new RegExp(rule.match.path);
      if (!regex.test(call.arguments.path)) {
        matches = false;
      }
    }

    if (matches) {
      return rule.action;
    }
  }

  // Fallback to defaults by tool risk
  return policy.defaults[call.risk] ?? 'ask';
}
