'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  ArrowDownCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { applyEvent, createInitialRunState } from '@agentroom/core';
import type { EventEnvelope, RunState } from '@agentroom/core';

export default function RunRoomPage() {
  const params = useParams();
  const runId = (params?.runId as string) || '01935e40-0004-7000-8000-000000000001';
  const orgSlug = (params?.org as string) || 'acme-engineering';

  // API host
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const WS_URL = API_URL.replace(/^http/, 'ws') + '/v1/ws';

  // Run store
  const [runState, setRunState] = useState<RunState>(() =>
    createInitialRunState(runId, 'acme-org', 'payments-proj')
  );
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [connected, setConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<any[]>([]);

  // Composer
  const [messageText, setMessageText] = useState('');
  const [composerMode, setComposerMode] = useState<'queue' | 'interrupt'>('queue');
  const [activeTab, setActiveTab] = useState<'context' | 'files' | 'people' | 'limits'>('context');
  const [instructions, setInstructions] = useState(
    'Keep backwards compatibility for legacy v1 payloads.\nEnsure all money fields use integer cents (e.g. amountInCents).\nNever touch the internal billing ledger directly.'
  );

  // Virtualization / Auto-scroll
  const timelineBottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newEventsCount, setNewEventsCount] = useState(0);

  // Load initial snapshot and open SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let ws: WebSocket | null = null;
    let isCancelled = false;

    async function init() {
      try {
        // 1. Initial snapshot
        const res = await fetch(`${API_URL}/v1/runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setRunState(data.state);
          }
        }
      } catch {}

      // 2. Connect SSE stream
      try {
        const streamUrl = `${API_URL}/v1/runs/${runId}/stream?after=${runState.lastSeq}`;
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener('run.event', (e: MessageEvent) => {
          try {
            const envelope: EventEnvelope = JSON.parse(e.data);
            setEvents((prev) => {
              if (prev.some((x) => x.id === envelope.id)) return prev;
              return [...prev, envelope];
            });

            setRunState((prev) => applyEvent(prev, envelope));

            if (!autoScroll) {
              setNewEventsCount((c) => c + 1);
            }
          } catch {}
        });

        eventSource.onopen = () => setConnected(true);
        eventSource.onerror = () => setConnected(false);
      } catch {
        setConnected(false);
      }

      // 3. Connect WebSocket for Presence
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => {
          const userSaved = localStorage.getItem('agentroom_user');
          const user = userSaved ? JSON.parse(userSaved) : { id: 'sara', name: 'Sara Chen' };

          ws?.send(
            JSON.stringify({
              t: 'join',
              runId,
              userId: user.id,
              name: user.name,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.t === 'presence.state') {
              setPresenceUsers(msg.users || []);
            }
          } catch {}
        };
      } catch {}
    }

    init();

    return () => {
      isCancelled = true;
      if (eventSource) eventSource.close();
      if (ws) ws.close();
    };
  }, [runId]);

  // Handle auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && timelineBottomRef.current) {
      timelineBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isAtBottom) {
      setAutoScroll(true);
      setNewEventsCount(0);
    } else {
      setAutoScroll(false);
    }
  };

  const jumpToLive = () => {
    setAutoScroll(true);
    setNewEventsCount(0);
    timelineBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Actions
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const userSaved = localStorage.getItem('agentroom_user');
    const authorId = userSaved ? JSON.parse(userSaved).id : undefined;

    try {
      await fetch(`${API_URL}/v1/runs/${runId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          mode: composerMode,
          authorId,
        }),
      });
      setMessageText('');
    } catch {}
  };

  const handlePauseResume = async () => {
    const endpoint = runState.status === 'paused' ? 'resume' : 'pause';
    try {
      await fetch(`${API_URL}/v1/runs/${runId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {}
  };

  const handleTakeover = async () => {
    const endpoint = runState.driver.type === 'human' ? 'handback' : 'takeover';
    try {
      await fetch(`${API_URL}/v1/runs/${runId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {}
  };

  const handleApprove = async (approvalId: string, approved: boolean) => {
    try {
      await fetch(`${API_URL}/v1/runs/${runId}/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: approved ? 'approved' : 'denied',
        }),
      });
    } catch {}
  };

  const startSimulation = async () => {
    try {
      await fetch(`${API_URL}/v1/runs/${runId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptName: 'migrate-api-endpoint',
          stepDelayMs: 250,
        }),
      });
    } catch {}
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
                {runState.title || 'Migrate the payments endpoint to v2'}
              </h1>
              {/* Status pill */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  runState.status === 'running'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : runState.status === 'paused'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : runState.status === 'awaiting_approval'
                    ? 'bg-[#da7756]/15 text-[#da7756] border-[#da7756]/40'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    runState.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {runState.status.replace('_', ' ').toUpperCase()}
              </span>

              {/* Driver badge */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#252422] text-[#da7756] border border-[#383632] text-[11px] font-mono">
                {runState.driver.type === 'agent' ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                Driver: {runState.driver.type === 'agent' ? 'Autonomous Agent' : 'Human Driver'}
              </span>

              {/* Connection status */}
              <span
                title={connected ? 'Live SSE & WebSocket connected' : 'Connecting to API gateway'}
                className="inline-flex items-center gap-1 text-[11px] font-mono text-[#888580]"
              >
                {connected ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                )}
                Seq: {runState.lastSeq}
              </span>
            </div>
          </div>
        </div>

        {/* Right side of Top Bar */}
        <div className="flex items-center gap-3">
          {/* Presence avatars */}
          <div className="flex items-center -space-x-1.5 pr-2 border-r border-[#292826]">
            {presenceUsers.length > 0 ? (
              presenceUsers.map((u, i) => (
                <div
                  key={i}
                  title={`${u.name}${u.focusSeq ? ` (Focus: Step ${u.focusSeq})` : ''}`}
                  className="w-7 h-7 rounded-full border-2 border-[#1a1918] bg-[#da7756]/30 flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-emerald-500"
                >
                  {u.name.slice(0, 2).toUpperCase()}
                </div>
              ))
            ) : (
              <>
                <img
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64"
                  title="Sara Chen (Owner)"
                  className="w-7 h-7 rounded-full border-2 border-[#1a1918] object-cover ring-1 ring-emerald-500"
                />
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64"
                  title="Ahmed Hassan (Admin)"
                  className="w-7 h-7 rounded-full border-2 border-[#1a1918] object-cover ring-1 ring-emerald-500"
                />
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={startSimulation}
              title="Start ScriptedProvider agent loop in sandbox"
              className="px-2.5 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#c66545] text-xs font-semibold text-white flex items-center gap-1.5 transition shadow"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Run Agent
            </button>

            <button
              onClick={handlePauseResume}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] text-xs font-medium text-white flex items-center gap-1.5 transition"
            >
              {runState.status === 'running' ? (
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
                runState.driver.type === 'human'
                  ? 'bg-[#da7756] text-white border-[#da7756]'
                  : 'bg-[#22211f] hover:bg-[#2b2a27] text-white border-[#33312e]'
              }`}
            >
              <HandMetal className="w-3.5 h-3.5" />
              {runState.driver.type === 'human' ? 'Hand back to Agent' : 'Take over'}
            </button>

            <UserSwitcher />
          </div>
        </div>
      </header>

      {/* 2. BODY LAYOUT (Left Rail | Center Timeline | Right Panel) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT RAIL: PLAN & CHECKLIST */}
        <aside className="w-72 border-r border-[#292826] bg-[#171615] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#292826] flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9c9a94] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#da7756]" />
              Agent Plan
            </h2>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              {runState.plan.filter((p) => p.status === 'done').length}/{runState.plan.length || 4} done
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(runState.plan.length > 0
              ? runState.plan
              : [
                  { id: '1', text: 'Inspect legacy /v1/charge implementation and test suite', status: 'done' as const },
                  { id: '2', text: 'Implement idempotent /v2/payments route with schema validation', status: 'in_progress' as const },
                  { id: '3', text: 'Run unit and integration test suite in sandbox', status: 'pending' as const },
                  { id: '4', text: 'Generate backward compatibility verification report', status: 'pending' as const },
                ]
            ).map((item, idx) => (
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
              <span>Model: {runState.model}</span>
              <span className="text-emerald-400">Sandbox: OK</span>
            </div>
          </div>
        </aside>

        {/* CENTER: TIMELINE & STREAM */}
        <section className="flex-1 flex flex-col bg-[#141413] min-w-0 relative">
          <div
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            {events.length === 0 ? (
              <div className="text-center py-20 space-y-3">
                <Bot className="w-10 h-10 text-[#da7756] mx-auto animate-bounce" />
                <h3 className="text-base font-semibold text-white">Agent Ready in Room</h3>
                <p className="text-xs text-[#888580] max-w-sm mx-auto">
                  Click <strong className="text-white">Run Agent</strong> above to launch the autonomous coding loop, or steer directly via the composer below.
                </p>
              </div>
            ) : (
              events.map((ev) => {
                if (ev.type === 'message.user') {
                  const payload = ev.payload as any;
                  return (
                    <div
                      key={ev.id}
                      className="p-4 rounded-xl border border-[#383632] bg-[#1c1b1a] shadow-md flex items-start gap-3"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
                        H
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">Teammate</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded uppercase font-semibold ${
                                payload.mode === 'interrupt'
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              }`}
                            >
                              {payload.mode}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#666460] font-mono">Seq {ev.seq}</span>
                        </div>
                        <div className="text-sm text-[#f0eeeb] leading-relaxed">{payload.text}</div>
                        <div className="mt-1.5 text-[10px] text-emerald-400/80 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3 h-3" />
                          Delivered to agent
                        </div>
                      </div>
                    </div>
                  );
                }

                if (ev.type === 'message.assistant') {
                  const payload = ev.payload as any;
                  return (
                    <div
                      key={ev.id}
                      className="p-5 rounded-xl border border-[#2e2d2a] bg-[#181716] shadow-lg flex items-start gap-3.5"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#da7756] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#da7756]">Claude Agent</span>
                          <span className="text-[10px] text-[#666460] font-mono">Seq {ev.seq}</span>
                        </div>
                        <div className="text-sm text-[#e8e6e3] leading-relaxed select-text font-sans whitespace-pre-wrap">
                          {payload.text}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (ev.type === 'tool.result') {
                  const payload = ev.payload as any;
                  return (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-[#2e2d2a] bg-[#161514] overflow-hidden shadow-sm"
                    >
                      <div className="px-4 py-2 bg-[#1d1c1a] border-b border-[#292826] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-[#da7756]" />
                          <span className="text-xs font-mono font-medium text-white">{payload.toolCallId}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                              payload.ok ? 'bg-emerald-950/40 text-emerald-400' : 'bg-red-950/40 text-red-400'
                            }`}
                          >
                            {payload.ok ? 'OK' : 'FAILED'}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#888580] font-mono">{payload.durationMs || 10}ms</span>
                      </div>
                      <div className="p-3 bg-[#11100f] font-mono text-xs text-[#a19e98] overflow-x-auto select-text max-h-48">
                        <pre className={payload.ok ? 'text-emerald-400/90' : 'text-red-400/90'}>
                          {payload.output}
                        </pre>
                      </div>
                    </div>
                  );
                }

                if (ev.type === 'approval.requested') {
                  const payload = ev.payload as any;
                  return (
                    <div
                      key={ev.id}
                      className="p-5 rounded-xl border border-[#da7756]/70 bg-[#221c17] shadow-xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#da7756] flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" />
                          Safety Approval Requested
                        </span>
                        <span className="text-[10px] text-[#888580] font-mono">Seq {ev.seq}</span>
                      </div>
                      <div className="text-xs text-[#c2bfba] font-mono bg-[#141413] px-3 py-2 rounded-lg border border-[#33312e]">
                        {payload.name}: {JSON.stringify(payload.arguments)}
                      </div>
                      <p className="text-xs text-[#a19e98]">{payload.reason}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleApprove(payload.approvalId, true)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                        >
                          Approve Command
                        </button>
                        <button
                          onClick={() => handleApprove(payload.approvalId, false)}
                          className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold transition"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  );
                }

                return null;
              })
            )}

            <div ref={timelineBottomRef} />
          </div>

          {/* Jump to live button */}
          {!autoScroll && newEventsCount > 0 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
              <button
                onClick={jumpToLive}
                className="px-3 py-1.5 rounded-full bg-[#da7756] hover:bg-[#c66545] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xl animate-bounce"
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                Jump to Live ({newEventsCount} new)
              </button>
            </div>
          )}

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
                  placeholder="Steer agent live in sub-300ms (e.g. 'Keep the v1 response shape')..."
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
              Files
            </button>
            <button
              onClick={() => setActiveTab('people')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'people'
                  ? 'bg-[#252422] text-[#da7756]'
                  : 'text-[#888580] hover:text-white'
              }`}
            >
              People ({presenceUsers.length || 3})
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
                    <span className="text-[10px] text-emerald-400 font-mono">Live</span>
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
                {presenceUsers.length > 0 ? (
                  presenceUsers.map((u, i) => (
                    <div key={i} className="p-2.5 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#da7756]/20 flex items-center justify-center font-bold text-xs text-[#da7756]">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-white">{u.name}</div>
                          <div className="text-[10px] text-[#888580]">
                            {u.focusSeq ? `Viewing Seq ${u.focusSeq}` : 'Live'}
                          </div>
                        </div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#888580] p-2">Connecting to live presence...</div>
                )}
              </div>
            )}

            {activeTab === 'limits' && (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a]">
                  <div className="text-[#888580] mb-1">Steps Used</div>
                  <div className="text-white text-base font-bold">{events.length} / 100</div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-[#da7756] h-full"
                      style={{ width: `${Math.min(100, (events.length / 100) * 100)}%` }}
                    />
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
