import {
  evaluatePolicy,
  globalPubSub,
  uuidv7,
  applyEvent,
  createInitialRunState,
} from '@agentroom/core';
import type { EventEnvelope, RunStatus } from '@agentroom/core';
import { RunRepository } from '@agentroom/db';
import { ScriptedProvider } from './providers/scripted.js';
import { FakeSandbox } from './sandbox/fake.js';

export interface RunnerOptions {
  stepDelayMs?: number;
  scriptName?: string;
}

export class AgentRunner {
  private repository: RunRepository;
  private sandbox: FakeSandbox;
  private provider: ScriptedProvider;
  private abortController: AbortController = new AbortController();
  private isRunning = false;
  private pendingApprovalResolve: ((decision: 'approved' | 'denied') => void) | null = null;

  constructor(
    private runId: string,
    private options: RunnerOptions = {}
  ) {
    this.repository = new RunRepository();
    this.sandbox = new FakeSandbox();
    this.provider = new ScriptedProvider(options.scriptName || 'migrate-api-endpoint');
  }

  getAbortSignal() {
    return this.abortController.signal;
  }

  interrupt() {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  resolveApproval(decision: 'approved' | 'denied') {
    if (this.pendingApprovalResolve) {
      this.pendingApprovalResolve(decision);
      this.pendingApprovalResolve = null;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load or initialize run
    const run = await this.repository.getRun(this.runId);
    if (!run) {
      throw new Error(`Run ${this.runId} not found`);
    }

    // Subscribe to control channel
    const unsubscribeControl = await globalPubSub.subscribe(
      `run:${this.runId}:control`,
      (msgStr) => {
        try {
          const msg = JSON.parse(msgStr);
          if (msg.type === 'interrupt') {
            this.interrupt();
          } else if (msg.type === 'approval_decided') {
            this.resolveApproval(msg.decision);
          }
        } catch {}
      }
    );

    // Initial run.started if not already started
    if (run.status === 'queued') {
      await this.repository.appendEvent(this.runId, {
        runId: this.runId,
        type: 'run.started',
        actorType: 'system',
        actorId: null,
        stepIndex: 0,
        payload: {
          sandboxId: 'sbx-fake-' + this.runId.slice(0, 8),
        },
      });
      await this.repository.appendEvent(this.runId, {
        runId: this.runId,
        type: 'run.status_changed',
        actorType: 'system',
        actorId: null,
        stepIndex: 0,
        payload: {
          from: 'queued',
          to: 'running',
          reason: 'Worker started execution loop',
        },
      });
    }

    let stepIndex = 1;
    const delay = this.options.stepDelayMs ?? 150;

    try {
      while (this.isRunning) {
        // Rebuild state to check status
        const events = await this.repository.getEvents(this.runId, 0, 10000);
        let state = createInitialRunState(this.runId, run.orgId, run.projectId);
        for (const ev of events) {
          state = applyEvent(state, ev);
        }

        // Control point A: Check pause / takeover
        if (state.status === 'paused' || state.driver.type === 'human') {
          await new Promise((res) => setTimeout(res, 200));
          continue;
        }

        if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
          break;
        }

        // Convert events to provider messages
        const messages = events
          .filter((e) => e.type === 'message.user' || e.type === 'message.assistant')
          .map((e) => ({
            role: e.type === 'message.user' ? 'user' : 'assistant',
            content: (e.payload as any).text,
          }));

        // Stream model response
        const result = await this.provider.stream({
          system: 'You are an autonomous coding agent in a shared team room.',
          messages,
          tools: [],
          signal: this.abortController.signal,
          onTextDelta: (delta) => {
            globalPubSub.publish(
              `run:${this.runId}:deltas`,
              JSON.stringify({ type: 'text', stepIndex, delta })
            );
          },
        });

        if (result.aborted) {
          await this.repository.appendEvent(this.runId, {
            runId: this.runId,
            type: 'message.assistant.aborted',
            actorType: 'system',
            actorId: null,
            stepIndex,
            payload: {
              messageId: uuidv7(),
              partialText: result.text,
              reason: 'Interrupted by teammate',
            },
          });
          continue;
        }

        // Append assistant message
        await this.repository.appendEvent(this.runId, {
          runId: this.runId,
          type: 'message.assistant',
          actorType: 'agent',
          actorId: null,
          stepIndex,
          payload: {
            messageId: uuidv7(),
            text: result.text,
            stopReason: result.stopReason,
            usage: result.usage,
          },
        });

        if (result.toolCalls.length === 0) {
          // If no tool calls and end of script, complete run
          if (result.stopReason === 'end_turn') {
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'run.completed',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                summary: 'Agent successfully completed the plan.',
              },
            });
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'run.status_changed',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                from: 'running',
                to: 'completed',
                reason: 'Turn ended with complete plan',
              },
            });
            break;
          }
          stepIndex++;
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        // Handle tool calls
        for (const call of result.toolCalls) {
          const toolCallId = call.id || uuidv7();

          // 1. Tool requested
          await this.repository.appendEvent(this.runId, {
            runId: this.runId,
            type: 'tool.requested',
            actorType: 'agent',
            actorId: null,
            stepIndex,
            payload: {
              toolCallId,
              name: call.name,
              arguments: call.arguments,
            },
          });

          // 2. Policy evaluation
          const risk = call.name.startsWith('read')
            ? 'read'
            : call.name.startsWith('write')
            ? 'write'
            : call.name === 'run_command'
            ? 'exec'
            : 'meta';

          const decision = evaluatePolicy({
            tool: call.name,
            risk,
            arguments: call.arguments,
          });

          if (decision === 'deny') {
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'tool.result',
              actorType: 'agent',
              actorId: null,
              stepIndex,
              payload: {
                toolCallId,
                ok: false,
                output: 'Denied by workspace safety policy.',
                durationMs: 5,
              },
            });
            continue;
          }

          if (decision === 'ask') {
            const approvalId = uuidv7();
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'approval.requested',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                approvalId,
                toolCallId,
                name: call.name,
                arguments: call.arguments,
                reason: `Policy requires approval for ${call.name} (${risk}).`,
              },
            });
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'run.status_changed',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                from: 'running',
                to: 'awaiting_approval',
                reason: 'Pending human authorization',
              },
            });

            // Wait for human decision
            const humanDecision = await new Promise<'approved' | 'denied'>((resolve) => {
              this.pendingApprovalResolve = resolve;
            });

            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'approval.decided',
              actorType: 'human',
              actorId: null,
              stepIndex,
              payload: {
                approvalId,
                decision: humanDecision,
                note: `Decision recorded: ${humanDecision}`,
              },
            });

            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'run.status_changed',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                from: 'awaiting_approval',
                to: 'running',
                reason: 'Approval resolved',
              },
            });

            if (humanDecision !== 'approved') {
              await this.repository.appendEvent(this.runId, {
                runId: this.runId,
                type: 'tool.result',
                actorType: 'agent',
                actorId: null,
                stepIndex,
                payload: {
                  toolCallId,
                  ok: false,
                  output: 'Denied by human approver.',
                  durationMs: 10,
                },
              });
              continue;
            }
          }

          // 3. Tool execution
          await this.repository.appendEvent(this.runId, {
            runId: this.runId,
            type: 'tool.started',
            actorType: 'system',
            actorId: null,
            stepIndex,
            payload: {
              toolCallId,
            },
          });

          const startTime = Date.now();
          let output = '';
          let ok = true;

          try {
            if (call.name === 'read_file') {
              output = await this.sandbox.readFile(call.arguments.path);
            } else if (call.name === 'write_file') {
              await this.sandbox.writeFile(call.arguments.path, call.arguments.content || '');
              output = `Wrote file ${call.arguments.path}`;
            } else if (call.name === 'run_command') {
              const res = await this.sandbox.exec(call.arguments.command, {
                timeoutSec: 30,
                onOutput: (stream, chunk) => {
                  output += chunk;
                },
              });
              ok = res.exitCode === 0;
            } else if (call.name === 'finish') {
              output = call.arguments.summary || 'Run finished';
            } else {
              output = `Executed ${call.name}`;
            }
          } catch (err: any) {
            ok = false;
            output = err.message || 'Execution error';
          }

          const durationMs = Date.now() - startTime;

          await this.repository.appendEvent(this.runId, {
            runId: this.runId,
            type: 'tool.result',
            actorType: 'agent',
            actorId: null,
            stepIndex,
            payload: {
              toolCallId,
              ok,
              output: output.slice(0, 8192),
              durationMs,
            },
          });

          if (call.name === 'finish') {
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'run.completed',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                summary: output,
              },
            });
            await this.repository.appendEvent(this.runId, {
              runId: this.runId,
              type: 'run.status_changed',
              actorType: 'system',
              actorId: null,
              stepIndex,
              payload: {
                from: 'running',
                to: 'completed',
                reason: 'Finish tool called',
              },
            });
            this.isRunning = false;
            break;
          }
        }

        stepIndex++;
        await new Promise((res) => setTimeout(res, delay));
      }
    } finally {
      this.isRunning = false;
      await unsubscribeControl();
    }
  }

  stop() {
    this.isRunning = false;
    this.interrupt();
  }
}
