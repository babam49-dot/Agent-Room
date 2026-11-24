export interface ScriptedStep {
  text: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  stopReason?: string;
  delayMs?: number;
}

export interface ScriptDefinition {
  name: string;
  steps: ScriptedStep[];
  steeringBranches?: Record<string, ScriptedStep[]>; // keyword in user message -> alternative steps
}

export const SCRIPTS: Record<string, ScriptDefinition> = {
  'fix-failing-test': {
    name: 'fix-failing-test',
    steps: [
      {
        text: 'I see a failing test in `tests/auth.test.ts`. I will inspect the test file to understand what assertion is failing.',
        toolCalls: [{ id: 'tc-001', name: 'read_file', arguments: { path: 'tests/auth.test.ts' } }],
      },
      {
        text: 'The test expects a JWT token with an expiration claim `exp`. I will examine `src/auth.ts` where the token is signed.',
        toolCalls: [{ id: 'tc-002', name: 'read_file', arguments: { path: 'src/auth.ts' } }],
      },
      {
        text: 'Found the bug: `signToken` omits the `exp` field when `options.expiresIn` is provided. I will patch `src/auth.ts`.',
        toolCalls: [
          {
            id: 'tc-003',
            name: 'write_file',
            arguments: { path: 'src/auth.ts', content: '// fixed auth logic with exp' },
          },
        ],
      },
      {
        text: 'Now I need to run the test suite to verify the fix.',
        toolCalls: [{ id: 'tc-004', name: 'run_command', arguments: { command: 'pnpm test:auth' } }],
      },
      {
        text: 'All 8 authentication unit tests are now passing. I will run git diff to prepare the final commit.',
        toolCalls: [{ id: 'tc-005', name: 'git', arguments: { sub: 'diff' } }],
      },
      {
        text: 'The fix is complete and verified.',
        toolCalls: [{ id: 'tc-006', name: 'finish', arguments: { summary: 'Fixed missing exp claim in JWT generation' } }],
      },
    ],
  },
  'migrate-api-endpoint': {
    name: 'migrate-api-endpoint',
    steps: [
      {
        text: "I am starting the migration of the payments endpoint to v2. First, let's inspect the legacy /v1/charge implementation.",
        toolCalls: [{ id: 'tc-m1', name: 'read_file', arguments: { path: 'src/routes/charge.ts' } }],
      },
      {
        text: 'The legacy handler parses raw body without schema validation. I will draft `src/routes/paymentsV2.ts`.',
        toolCalls: [{ id: 'tc-m2', name: 'write_file', arguments: { path: 'src/routes/paymentsV2.ts' } }],
      },
      {
        text: 'I am planning to change the response format from `{ success, id }` to `{ data: { paymentId } }`.',
        // Deliberate wrong turn for steering demo!
      },
      {
        text: 'Running migration integration tests to verify backwards compatibility.',
        toolCalls: [{ id: 'tc-m3', name: 'run_command', arguments: { command: 'pnpm test:integration' } }],
      },
      {
        text: 'Migration complete. Ready for team review.',
        toolCalls: [{ id: 'tc-m4', name: 'finish', arguments: { summary: 'Endpoint v2 created with idempotency key support' } }],
      },
    ],
    steeringBranches: {
      'v1 response shape': [
        {
          text: 'Acknowledging team instruction to keep the v1 response shape! Reverting the breaking schema change and keeping `{ success, id, payment }` format for seamless client backward compatibility.',
          toolCalls: [
            {
              id: 'tc-steer-1',
              name: 'write_file',
              arguments: { path: 'src/routes/paymentsV2.ts', content: '// v2 endpoint matching v1 envelope' },
            },
          ],
        },
        {
          text: 'Verified compatibility. Running final integration tests with the preserved response envelope.',
          toolCalls: [{ id: 'tc-steer-2', name: 'run_command', arguments: { command: 'pnpm test' } }],
        },
      ],
    },
  },
  'long-investigation': {
    name: 'long-investigation',
    steps: Array.from({ length: 40 }).map((_, i) => ({
      text: `Investigation step ${i + 1}: tracing memory allocations and analyzing query latencies across services...`,
      toolCalls: [
        {
          id: `tc-long-${i + 1}`,
          name: 'read_file',
          arguments: { path: `logs/service-${(i % 5) + 1}.log` },
        },
      ],
    })),
  },
};

export class ScriptedProvider {
  private currentStep = 0;
  private activeScript: ScriptDefinition;

  constructor(scriptName: string = 'migrate-api-endpoint') {
    this.activeScript = SCRIPTS[scriptName] || SCRIPTS['migrate-api-endpoint']!;
  }

  async stream(req: {
    system: string;
    messages: any[];
    tools: any[];
    signal: AbortSignal;
    onTextDelta?: (t: string) => void;
  }) {
    // Check for steering intervention in messages
    const steeringBranches = this.activeScript.steeringBranches;
    if (steeringBranches) {
      for (const msg of req.messages) {
        if (msg.role === 'user' && typeof msg.content === 'string') {
          for (const [trigger, branch] of Object.entries(steeringBranches)) {
            if (msg.content.toLowerCase().includes(trigger.toLowerCase())) {
              this.activeScript = {
                ...this.activeScript,
                steps: branch,
              };
              this.currentStep = 0;
              break;
            }
          }
        }
      }
    }

    const step = this.activeScript.steps[this.currentStep] || {
      text: 'Plan tasks completed successfully.',
      toolCalls: [],
      stopReason: 'end_turn',
    };

    this.currentStep++;

    // Stream text delta if callback provided
    if (req.onTextDelta && step.text) {
      req.onTextDelta(step.text);
    }

    return {
      text: step.text,
      toolCalls: (step.toolCalls || []).map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
      stopReason: step.stopReason || (step.toolCalls && step.toolCalls.length > 0 ? 'tool_use' : 'end_turn'),
      usage: {
        inputTokens: 120,
        outputTokens: 85,
      },
      aborted: req.signal.aborted,
    };
  }
}
