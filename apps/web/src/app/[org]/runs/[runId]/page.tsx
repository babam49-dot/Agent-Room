'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { UserSwitcher } from '@/components/UserSwitcher';
import {
  Bot,
  User,
  Play,
  Pause,
  HandMetal,
  Users,
  GitFork,
  XCircle,
  CheckCircle2,
  Clock,
  Send,
  Terminal,
  FileCode,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  ArrowLeft,
  CornerDownRight,
  Lock,
} from 'lucide-react';

interface PlanItem {
  id: string;
  text: string;
  status: 'done' | 'in_progress' | 'pending';
}

interface TimelineItem {
  id: string;
  type: 'assistant' | 'tool' | 'approval' | 'human_message';
  time: string;
  data: any;
}

export default function RunRoomPage() {
  const params = useParams();
  const runId = params?.runId as string;
  const orgSlug = params?.org as string;

  // Run state
  const [status, setStatus] = useState<'running' | 'paused' | 'awaiting_approval' | 'human_driving'>('running');
  const [driver, setDriver] = useState<'agent' | 'human'>('agent');
  const [driverName, setDriverName] = useState<string>('Claude Sonnet 5.5');
  const [composerMode, setComposerMode] = useState<'queue' | 'interrupt'>('queue');
  const [messageText, setMessageText] = useState('');
  const [activeTab, setActiveTab] = useState<'context' | 'files' | 'people' | 'limits'>('context');

  // Plan items
  const [plan, setPlan] = useState<PlanItem[]>([
    { id: '1', text: 'Inspect legacy /v1/charge implementation and test suite', status: 'done' },
    { id: '2', text: 'Implement idempotent /v2/payments route with schema validation', status: 'in_progress' },
    { id: '3', text: 'Run unit and integration test suite in sandbox', status: 'pending' },
    { id: '4', text: 'Generate backward compatibility verification report', status: 'pending' },
  ]);

  // Context blocks
  const [instructions, setInstructions] = useState(
    'Keep backwards compatibility for legacy v1 payloads.\nEnsure all money fields use integer cents (e.g. amountInCents).\nNever touch the internal billing ledger directly.'
  );

  // Timeline events
  const [timeline, setTimeline] = useState<TimelineItem[]>([
    {
      id: 'e1',
      type: 'human_message',
      time: '09:30:12',
      data: {
        author: 'Sara Chen',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&fit=crop',
        text: 'Please migrate the legacy payments endpoint to v2 with strict idempotency keys.',
        mode: 'queue',
        receipt: 'Delivered at step 1',
      },
    },
    {
      id: 'e2',
      type: 'assistant',
      time: '09:30:15',
      data: {
        text: "I'll inspect the repository structure and analyze how the legacy `/v1/charge` handler parses request payloads and validates credit card tokens.",
      },
    },
    {
      id: 'e3',
      type: 'tool',
      time: '09:30:18',
      data: {
        name: 'read_file',
        risk: 'read',
        args: { path: 'src/routes/charge.ts', lines: '1-60' },
        output: 'export async function handleCharge(req, res) {\n  const { token, amount } = req.body;\n  // legacy non-idempotent charge logic\n}',
        durationMs: 42,
      },
    },
    {
      id: 'e4',
      type: 'assistant',
      time: '09:30:24',
      data: {
        text: 'The legacy handler does not enforce idempotency headers. I am now creating `src/routes/paymentsV2.ts` with Zod schema validation and Redis-backed idempotency key caching.',
      },
    },
    {
      id: 'e5',
      type: 'tool',
      time: '09:30:29',
      data: {
        name: 'write_file',
        risk: 'write',
        args: { path: 'src/routes/paymentsV2.ts' },
        output: 'Created src/routes/paymentsV2.ts (1,842 bytes)',
        durationMs: 88,
      },
    },
    {
      id: 'e6',
      type: 'approval',
      time: '09:30:35',
      data: {
        approvalId: 'app-001',
        toolName: 'run_command',
        command: 'pnpm test:integration --run',
        reason: 'Execution of external test runner outside sandboxed directory require human approval per workspace policy.',
        status: 'pending',
      },
    },
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const userSaved = typeof window !== 'undefined' ? localStorage.getItem('agentroom_user') : null;
    const author = userSaved ? JSON.parse(userSaved).name : 'Sara Chen';
    const avatar = userSaved ? JSON.parse(userSaved).avatarUrl : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&fit=crop';

    const newItem: TimelineItem = {
      id: `user-${Date.now()}`,
      type: 'human_message',
      time: new Date().toLocaleTimeString(),
      data: {
        author,
        avatar,
        text: messageText,
        mode: composerMode,
        receipt: composerMode === 'interrupt' ? 'Interrupt applied immediately' : 'Queued for step 3',
      },
    };

    setTimeline((prev) => [...prev, newItem]);
    setMessageText('');

    if (composerMode === 'interrupt') {
      // Simulate quick agent response acknowledging steering
      setTimeout(() => {
        setTimeline((prev) => [
          ...prev,
          {
            id: `assist-${Date.now()}`,
            type: 'assistant',
            time: new Date().toLocaleTimeString(),
            data: {
              text: `Acknowledged interruption from ${author}. Applying steering feedback right now: "${messageText}".`,
            },
          },
        ]);
      }, 700);
    }
  };

  const handleApprove = (approvalId: string, approved: boolean) => {
    setTimeline((prev) =>
      prev.map((item) => {
        if (item.type === 'approval' && item.data.approvalId === approvalId) {
          return {
            ...item,
            data: {
              ...item.data,
              status: approved ? 'approved' : 'denied',
            },
          };
        }
        return item;
      })
    );

    setTimeout(() => {
      setTimeline((prev) => [
        ...prev,
        {
          id: `assist-${Date.now()}`,
          type: 'assistant',
          time: new Date().toLocaleTimeString(),
          data: {
            text: approved
              ? 'Approval granted. Running test suite inside sandbox container...'
              : 'Action was denied by team policy. Adapting to safe alternative approach without direct command execution.',
          },
        },
      ]);
    }, 600);
  };

  const handleTakeover = () => {
    if (driver === 'agent') {
      setDriver('human');
      setDriverName('Sara Chen (Driving)');
      setStatus('human_driving');
    } else {
      setDriver('agent');
      setDriverName('Claude Sonnet 5.5');
      setStatus('running');
    }
  };

  const handlePauseResume = () => {
    if (status === 'running') {
      setStatus('paused');
    } else {
      setStatus('running');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#141413] text-[#e8e6e3] overflow-hidden select-none">
      {/* 1. TOP BAR */}
      <header className="h-14 border-b border-[#292826] bg-[#1a1918] px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-[#252422] text-[#888580] hover:text-white transition"
            title="Back to Workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-semibold text-white tracking-tight">
                Migrate the payments endpoint to v2
              </h1>
              {/* Status pill */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  status === 'running'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : status === 'paused'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {status === 'running'
                  ? 'Running'
                  : status === 'paused'
                  ? 'Paused'
                  : 'Human Driving'}
              </span>

              {/* Driver badge */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#252422] text-[#da7756] border border-[#383632] text-[11px] font-mono">
                {driver === 'agent' ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                Driver: {driverName}
              </span>
            </div>
          </div>
        </div>

        {/* Right side of Top Bar */}
        <div className="flex items-center gap-3">
          {/* Presence avatars */}
          <div className="flex items-center -space-x-1.5 pr-2 border-r border-[#292826]">
            <img
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64"
              alt="Sara"
              title="Sara Chen (Owner)"
              className="w-7 h-7 rounded-full border-2 border-[#1a1918] object-cover ring-1 ring-emerald-500"
            />
            <img
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64"
              alt="Ahmed"
              title="Ahmed Hassan (Admin)"
              className="w-7 h-7 rounded-full border-2 border-[#1a1918] object-cover ring-1 ring-emerald-500"
            />
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64"
              alt="Lina"
              title="Lina Mori (Member)"
              className="w-7 h-7 rounded-full border-2 border-[#1a1918] object-cover ring-1 ring-emerald-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePauseResume}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] text-xs font-medium text-white flex items-center gap-1.5 transition"
            >
              {status === 'running' ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> Resume
                </>
              )}
            </button>

            <button
              onClick={handleTakeover}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border ${
                driver === 'human'
                  ? 'bg-[#da7756] text-white border-[#da7756]'
                  : 'bg-[#22211f] hover:bg-[#2b2a27] text-white border-[#33312e]'
              }`}
            >
              <HandMetal className="w-3.5 h-3.5" />
              {driver === 'human' ? 'Hand back to Agent' : 'Take over'}
            </button>

            <button
              onClick={() => alert('Fork created: Started new branch at Step 2')}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] text-xs font-medium text-white flex items-center gap-1.5 transition"
            >
              <GitFork className="w-3.5 h-3.5 text-purple-400" /> Fork
            </button>

            <UserSwitcher />
          </div>
        </div>
      </header>

      {/* 2. BODY LAYOUT (Left Rail | Center Timeline | Right Panel) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT RAIL: PLAN & CHECKLIST */}
        <aside className="w-72 border-r border-[#292826] bg-[#171615] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#292826] flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9c9a94] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#da7756]" />
              Agent Plan
            </h2>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              1/4 done
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {plan.map((item, idx) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border text-xs leading-relaxed transition-all ${
                  item.status === 'done'
                    ? 'bg-[#1c1b1a]/40 border-[#2e2d2a] text-[#888580]'
                    : item.status === 'in_progress'
                    ? 'bg-[#22201e] border-[#da7756]/40 text-white shadow-md'
                    : 'bg-[#1a1918] border-[#292826] text-[#a19e98]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {item.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : item.status === 'in_progress' ? (
                    <span className="w-4 h-4 rounded-full border-2 border-[#da7756] border-t-transparent animate-spin shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="w-4 h-4 text-[#666460] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-medium">{item.text}</div>
                    <div className="text-[10px] text-[#666460] mt-1 font-mono">Step {idx + 1}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-[#292826] bg-[#141413]">
            <div className="text-[11px] text-[#888580] flex items-center justify-between">
              <span>Model: Claude 3.5 Sonnet</span>
              <span className="text-emerald-400">Sandbox: OK</span>
            </div>
          </div>
        </aside>

        {/* CENTER: TIMELINE & STREAM */}
        <section className="flex-1 flex flex-col bg-[#141413] min-w-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {timeline.map((item) => {
              if (item.type === 'human_message') {
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-[#383632] bg-[#1c1b1a] shadow-md flex items-start gap-3"
                  >
                    <img
                      src={item.data.avatar}
                      alt={item.data.author}
                      className="w-7 h-7 rounded-full object-cover border border-[#44423e] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">{item.data.author}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded uppercase font-semibold ${
                              item.data.mode === 'interrupt'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {item.data.mode}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#666460] font-mono">{item.time}</span>
                      </div>
                      <div className="text-sm text-[#f0eeeb] leading-relaxed">{item.data.text}</div>
                      <div className="mt-1.5 text-[10px] text-emerald-400/80 flex items-center gap-1 font-mono">
                        <CheckCircle2 className="w-3 h-3" />
                        {item.data.receipt}
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'assistant') {
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-xl border border-[#2e2d2a] bg-[#181716] shadow-lg flex items-start gap-3.5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#da7756] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#da7756]">Claude Agent</span>
                        <span className="text-[10px] text-[#666460] font-mono">{item.time}</span>
                      </div>
                      <div className="text-sm text-[#e8e6e3] leading-relaxed select-text font-sans">
                        {item.data.text}
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'tool') {
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#2e2d2a] bg-[#161514] overflow-hidden shadow-sm"
                  >
                    <div className="px-4 py-2.5 bg-[#1d1c1a] border-b border-[#292826] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-[#da7756]" />
                        <span className="text-xs font-mono font-medium text-white">{item.data.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                          {item.data.risk}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#888580] font-mono">{item.data.durationMs}ms</span>
                    </div>
                    <div className="p-3 bg-[#11100f] font-mono text-xs text-[#a19e98] overflow-x-auto select-text">
                      <pre className="text-emerald-400/90">{item.data.output}</pre>
                    </div>
                  </div>
                );
              }

              if (item.type === 'approval') {
                const isPending = item.data.status === 'pending';
                return (
                  <div
                    key={item.id}
                    className={`p-5 rounded-xl border shadow-xl transition-all ${
                      isPending
                        ? 'bg-[#221c17] border-[#da7756]/70'
                        : item.data.status === 'approved'
                        ? 'bg-[#18221c] border-emerald-500/40'
                        : 'bg-[#221818] border-red-500/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#da7756]/20 border border-[#da7756]/40 flex items-center justify-center text-[#da7756] shrink-0">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-[#da7756]">
                            Safety Approval Requested
                          </span>
                          <span className="text-[10px] text-[#888580] font-mono">{item.time}</span>
                        </div>

                        <div>
                          <div className="text-xs text-[#c2bfba] font-mono bg-[#141413] px-3 py-2 rounded-lg border border-[#33312e]">
                            {item.data.command}
                          </div>
                          <p className="text-xs text-[#a19e98] mt-2 leading-relaxed">
                            {item.data.reason}
                          </p>
                        </div>

                        {isPending ? (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handleApprove(item.data.approvalId, true)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                            >
                              Approve Command
                            </button>
                            <button
                              onClick={() => handleApprove(item.data.approvalId, false)}
                              className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold transition"
                            >
                              Deny
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs font-medium font-mono">
                            Status:{' '}
                            <span
                              className={
                                item.data.status === 'approved' ? 'text-emerald-400' : 'text-red-400'
                              }
                            >
                              {item.data.status.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* BOTTOM COMPOSER */}
          <div className="p-4 border-t border-[#292826] bg-[#181716] shrink-0">
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#888580]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[#c2bfba]">Mode:</span>
                  <button
                    type="button"
                    onClick={() => setComposerMode('queue')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      composerMode === 'queue'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : 'bg-[#22211f] text-[#888580] hover:text-white'
                    }`}
                  >
                    Queue (Deliver at step)
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerMode('interrupt')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      composerMode === 'interrupt'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-[#22211f] text-[#888580] hover:text-white'
                    }`}
                  >
                    Interrupt (Abort stream now)
                  </button>
                </div>

                <div className="text-[10px] text-[#666460]">
                  Press <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">Enter</kbd> to steer
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Steer agent, give feedback, or inject context (e.g. 'Keep the v1 response shape')..."
                  className="flex-1 bg-[#121110] border border-[#2e2d2a] focus:border-[#da7756] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#666460] focus:outline-none transition shadow-inner"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#da7756] hover:bg-[#c66545] disabled:opacity-40 disabled:hover:bg-[#da7756] text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                >
                  <Send className="w-3.5 h-3.5" />
                  Steer
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* RIGHT PANEL: CONTEXT, FILES, PEOPLE, LIMITS */}
        <aside className="w-80 border-l border-[#292826] bg-[#171615] flex flex-col shrink-0">
          <div className="h-10 border-b border-[#292826] flex items-center px-3 gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('context')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'context'
                  ? 'bg-[#252422] text-[#da7756]'
                  : 'text-[#888580] hover:text-white'
              }`}
            >
              Context
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'files'
                  ? 'bg-[#252422] text-[#da7756]'
                  : 'text-[#888580] hover:text-white'
              }`}
            >
              Files (2)
            </button>
            <button
              onClick={() => setActiveTab('people')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'people'
                  ? 'bg-[#252422] text-[#da7756]'
                  : 'text-[#888580] hover:text-white'
              }`}
            >
              People (3)
            </button>
            <button
              onClick={() => setActiveTab('limits')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'limits'
                  ? 'bg-[#252422] text-[#da7756]'
                  : 'text-[#888580] hover:text-white'
              }`}
            >
              Limits
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'context' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#da7756]" />
                      Instructions (v2)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">Synced</span>
                  </div>
                  <textarea
                    rows={6}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full bg-[#121110] border border-[#292826] rounded-lg p-2.5 text-xs text-[#c2bfba] font-mono focus:border-[#da7756] focus:outline-none transition leading-relaxed resize-none"
                  />
                  <div className="text-[10px] text-[#666460] mt-1">
                    Auto-broadcasted to agent on next step
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="text-xs font-semibold text-white mb-1.5">Pinned Files</div>
                  <div className="space-y-1 font-mono text-xs text-[#a19e98]">
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#141413]">
                      <FileCode className="w-3.5 h-3.5 text-blue-400" />
                      src/routes/charge.ts
                    </div>
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#141413]">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      src/routes/paymentsV2.ts
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'files' && (
              <div className="space-y-2 font-mono text-xs">
                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="text-emerald-400 font-semibold mb-1">+ src/routes/paymentsV2.ts</div>
                  <div className="text-[11px] text-[#888580]">1,842 bytes created</div>
                </div>
                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="text-blue-400 font-semibold mb-1">~ tests/payments.test.ts</div>
                  <div className="text-[11px] text-[#888580]">+24 lines modified</div>
                </div>
              </div>
            )}

            {activeTab === 'people' && (
              <div className="space-y-2.5">
                <div className="p-2.5 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64"
                      className="w-7 h-7 rounded-full object-cover"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">Sara Chen</div>
                      <div className="text-[10px] text-[#888580]">Owner (Viewing Step 2)</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>

                <div className="p-2.5 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64"
                      className="w-7 h-7 rounded-full object-cover"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">Ahmed Hassan</div>
                      <div className="text-[10px] text-[#888580]">Admin (Viewing Timeline)</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>

                <div className="p-2.5 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64"
                      className="w-7 h-7 rounded-full object-cover"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">Lina Mori</div>
                      <div className="text-[10px] text-[#888580]">Member (Typing...)</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>
            )}

            {activeTab === 'limits' && (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="text-[#888580] mb-1">Steps Used</div>
                  <div className="text-white text-base font-bold">2 / 100</div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-[#da7756] h-full w-[2%]" />
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="text-[#888580] mb-1">Tokens Consumed</div>
                  <div className="text-white text-base font-bold">4,820 / 2,000,000</div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-emerald-500 h-full w-[0.2%]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
