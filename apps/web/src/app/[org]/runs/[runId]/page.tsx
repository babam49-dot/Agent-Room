'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
  GitBranch,
  Save,
  AlertTriangle,
  ArrowRightLeft,
  X,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import { applyEvent, createInitialRunState } from '@agentroom/core';
import type { EventEnvelope, RunState } from '@agentroom/core';

export default function RunRoomPage() {
  const params = useParams();
  const router = useRouter();
  const runId = (params?.runId as string) || '01935e40-0004-7000-8000-000000000001';
  const orgSlug = (params?.org as string) || 'acme-engineering';

  // API host
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const WS_URL = API_URL.replace(/^http/, 'ws') + '/v1/ws';

  // Current logged in user from switcher
  const [currentUser, setCurrentUser] = useState<any>(null);

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

  // Context Blocks state (Phase 3)
  const [contextBlocks, setContextBlocks] = useState<any[]>([]);
  const [activeBlock, setActiveBlock] = useState<any | null>(null);
  const [blockContent, setBlockContent] = useState('');
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextSaved, setContextSaved] = useState(false);

  // Modals & Actions
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [handoffUserId, setHandoffUserId] = useState('01935e40-0002-7000-8000-000000000002');
  const [handoffNote, setHandoffNote] = useState('');

  const [showForkModal, setShowForkModal] = useState(false);
  const [forkAtSeq, setForkAtSeq] = useState<number>(0);
  const [forkEditedMessage, setForkEditedMessage] = useState('');

  const [showGraphModal, setShowGraphModal] = useState(false);

  // Step Comments (Phase 4)
  const [commentingSeq, setCommentingSeq] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [directsAgent, setDirectsAgent] = useState(false);

  // Human tool command execution during takeover
  const [humanToolCmd, setHumanToolCmd] = useState('');

  // Virtualization / Auto-scroll
  const timelineBottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newEventsCount, setNewEventsCount] = useState(0);

  // Check current user
  useEffect(() => {
    const updateLocalUser = () => {
      const saved = localStorage.getItem('agentroom_user');
      if (saved) {
        try {
          setCurrentUser(JSON.parse(saved));
        } catch {}
      }
    };
    updateLocalUser();
    window.addEventListener('storage', updateLocalUser);
    return () => window.removeEventListener('storage', updateLocalUser);
  }, []);

  // Fetch context blocks
  const fetchContextBlocks = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/runs/${runId}/context-blocks`);
      if (res.ok) {
        const data = await res.json();
        setContextBlocks(data.blocks || []);
        if (data.blocks && data.blocks.length > 0 && !activeBlock) {
          setActiveBlock(data.blocks[0]);
          setBlockContent(data.blocks[0].content);
        }
      }
    } catch {}
  };

  // Load initial snapshot, context blocks, and open SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let ws: WebSocket | null = null;
    let isCancelled = false;

    async function init() {
      try {
        const res = await fetch(`${API_URL}/v1/runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setRunState(data.state);
          }
        }
      } catch {}

      await fetchContextBlocks();

      // Connect SSE stream
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

            // Refresh context blocks if context was edited
            if (envelope.type.startsWith('context.')) {
              fetchContextBlocks();
            }

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

      // Connect WebSocket for Presence
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => {
          const userSaved = localStorage.getItem('agentroom_user');
          const user = userSaved ? JSON.parse(userSaved) : { id: '01935e40-0002-7000-8000-000000000001', name: 'Sara Chen' };

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
      const res = await fetch(`${API_URL}/v1/runs/${runId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          mode: composerMode,
          authorId,
        }),
      });

      if (res.status === 403) {
        alert('Permission Denied: Users with Viewer role cannot steer the agent.');
        return;
      }
      setMessageText('');
    } catch {}
  };

  const handlePauseResume = async () => {
    const endpoint = runState.status === 'paused' ? 'resume' : 'pause';
    try {
      const res = await fetch(`${API_URL}/v1/runs/${runId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 403) {
        alert('Permission Denied: Viewers cannot pause or resume runs.');
      }
    } catch {}
  };

  const handleTakeover = async () => {
    const endpoint = runState.driver.type === 'human' ? 'handback' : 'takeover';
    try {
      const res = await fetch(`${API_URL}/v1/runs/${runId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 403) {
        alert('Permission Denied: Viewers cannot take over driving.');
      }
    } catch {}
  };

  const handleExecuteHumanTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanToolCmd.trim()) return;

    try {
      await fetch(`${API_URL}/v1/runs/${runId}/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'run_command',
          arguments: { command: humanToolCmd },
        }),
      });
      setHumanToolCmd('');
    } catch {}
  };

  const handleSaveContextBlock = async () => {
    if (!activeBlock) return;
    setContextError(null);
    setContextSaved(false);

    try {
      const res = await fetch(`${API_URL}/v1/context-blocks/${activeBlock.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseVersion: activeBlock.currentVersion,
          content: blockContent,
        }),
      });

      if (res.status === 409) {
        const err = await res.json();
        setContextError(`Conflict: Block updated by another user (latest v${err.error?.latestVersion}). Loaded latest content.`);
        setBlockContent(err.error?.latestContent || blockContent);
        await fetchContextBlocks();
        return;
      }

      if (res.ok) {
        setContextSaved(true);
        setTimeout(() => setContextSaved(false), 3000);
        await fetchContextBlocks();
      }
    } catch (err: any) {
      setContextError(err.message);
    }
  };

  const handleHandoff = async () => {
    try {
      await fetch(`${API_URL}/v1/runs/${runId}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: handoffUserId,
          note: handoffNote,
        }),
      });
      setShowHandoffModal(false);
      setHandoffNote('');
    } catch {}
  };

  const handleFork = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/runs/${runId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          atSeq: forkAtSeq || runState.lastSeq,
          editedMessage: forkEditedMessage || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowForkModal(false);
        router.push(`/${orgSlug}/runs/${data.run.id}`);
      }
    } catch {}
  };

  const handleAddComment = async (seq: number) => {
    if (!commentText.trim()) return;
    const userSaved = localStorage.getItem('agentroom_user');
    const authorId = userSaved ? JSON.parse(userSaved).id : undefined;

    try {
      const res = await fetch(`${API_URL}/v1/runs/${runId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSeq: seq,
          body: commentText,
          directsAgent,
          authorId,
        }),
      });

      if (res.status === 403) {
        alert('Permission Denied: Viewers cannot post comments.');
        return;
      }

      setCommentText('');
      setCommentingSeq(null);
    } catch {}
  };

  const handleSummarize = async () => {
    try {
      await fetch(`${API_URL}/v1/runs/${runId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `Run ${runState.title} successfully completed with schema backward compatibility verified and tests passing.`,
          title: `Knowledge: ${runState.title}`,
          tags: ['migration', 'payments', 'v2'],
        }),
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

  const isViewer = currentUser?.role === 'viewer';

  return (
    <div className="h-screen flex flex-col bg-[#141413] text-[#e8e6e3] overflow-hidden select-none">
      {/* 1. TOP BAR */}
      <header className="h-14 border-b border-[#292826] bg-[#1a1918] px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-[#252422] text-[#888580] hover:text-white transition"
            title="Back to Dashboard"
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
                    : runState.status === 'human_driving'
                    ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
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
        <div className="flex items-center gap-2.5">
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
              disabled={isViewer}
              title="Start Agent loop in sandbox"
              className="px-2.5 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#c66545] disabled:opacity-40 text-xs font-semibold text-white flex items-center gap-1.5 transition shadow"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Run Agent
            </button>

            <button
              onClick={handlePauseResume}
              disabled={isViewer}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] disabled:opacity-40 text-xs font-medium text-white flex items-center gap-1.5 transition"
            >
              {runState.status === 'paused' ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> Resume
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" /> Pause
                </>
              )}
            </button>

            <button
              onClick={handleTakeover}
              disabled={isViewer}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border ${
                runState.driver.type === 'human'
                  ? 'bg-purple-600 text-white border-purple-500'
                  : 'bg-[#22211f] hover:bg-[#2b2a27] disabled:opacity-40 text-white border-[#33312e]'
              }`}
            >
              <HandMetal className="w-3.5 h-3.5" />
              {runState.driver.type === 'human' ? 'Hand back' : 'Take over'}
            </button>

            <button
              onClick={() => setShowHandoffModal(true)}
              disabled={isViewer}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] disabled:opacity-40 text-xs font-medium text-white flex items-center gap-1.5 transition"
              title="Hand off driver control"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" /> Handoff
            </button>

            <button
              onClick={() => {
                setForkAtSeq(runState.lastSeq);
                setShowForkModal(true);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] text-xs font-medium text-white flex items-center gap-1.5 transition"
              title="Fork run from current step"
            >
              <GitFork className="w-3.5 h-3.5 text-emerald-400" /> Fork
            </button>

            <button
              onClick={handleSummarize}
              className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 text-xs font-medium text-emerald-300 flex items-center gap-1.5 transition"
              title="Summarize run into knowledge item"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" /> Summarize
            </button>

            <button
              onClick={() => setShowGraphModal(true)}
              className="px-2.5 py-1.5 rounded-lg border border-[#33312e] bg-[#22211f] hover:bg-[#2b2a27] text-xs font-medium text-white flex items-center gap-1.5 transition"
              title="View Run Lineage Graph"
            >
              <GitBranch className="w-3.5 h-3.5 text-purple-400" /> Graph
            </button>

            <UserSwitcher />
          </div>
        </div>
      </header>

      {/* VIEWER RBAC BANNER */}
      {isViewer && (
        <div className="bg-amber-950/50 border-b border-amber-500/30 px-5 py-2 text-xs text-amber-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Viewer Mode ({currentUser?.name}):</strong> You have read-only access. Steering, pause, approvals, and driver takeover are restricted to editors and admins.
            </span>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-600/40 font-semibold">
            Read-Only
          </span>
        </div>
      )}

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
          <div onScroll={handleScroll} className="flex-1 overflow-y-auto p-6 space-y-4">
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
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#666460] font-mono">Seq {ev.seq}</span>
                            <button
                              onClick={() => {
                                setForkAtSeq(ev.seq);
                                setShowForkModal(true);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#22211f] hover:bg-[#2b2a27] text-zinc-400 hover:text-white flex items-center gap-1 transition"
                            >
                              <GitFork className="w-3 h-3 text-emerald-400" /> Fork
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-[#f0eeeb] leading-relaxed">{payload.text}</div>
                        <div className="mt-1.5 text-[10px] text-emerald-400/80 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3 h-3" /> Delivered
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
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#666460] font-mono">Seq {ev.seq}</span>
                            <button
                              onClick={() => setCommentingSeq(commentingSeq === ev.seq ? null : ev.seq)}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#22211f] hover:bg-[#2b2a27] text-zinc-400 hover:text-white flex items-center gap-1 transition"
                            >
                              <MessageSquare className="w-3 h-3 text-blue-400" /> Comment
                            </button>
                            <button
                              onClick={() => {
                                setForkAtSeq(ev.seq);
                                setShowForkModal(true);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#22211f] hover:bg-[#2b2a27] text-zinc-400 hover:text-white flex items-center gap-1 transition"
                            >
                              <GitFork className="w-3 h-3 text-emerald-400" /> Fork
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-[#e8e6e3] leading-relaxed select-text font-sans whitespace-pre-wrap">
                          {payload.text}
                        </div>

                        {/* Inline Step Comment Box */}
                        {commentingSeq === ev.seq && (
                          <div className="mt-2.5 p-3 rounded-xl bg-[#121110] border border-[#2e2d2a] space-y-2">
                            <input
                              type="text"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              placeholder="Comment on this step (e.g. 'Keep v1 envelope')..."
                              className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                            />
                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-800">
                              <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={directsAgent}
                                  onChange={(e) => setDirectsAgent(e.target.checked)}
                                  className="rounded bg-zinc-800 border-zinc-700 text-[#da7756]"
                                />
                                Directs Agent (steer model on next step)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setCommentingSeq(null)}
                                  className="px-2 py-0.5 text-zinc-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddComment(ev.seq)}
                                  className="px-2.5 py-1 rounded bg-[#da7756] hover:bg-[#c66545] text-white font-medium"
                                >
                                  Post Comment
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (ev.type === 'comment.added') {
                  const payload = ev.payload as any;
                  return (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 flex items-start gap-3 shadow-md"
                    >
                      <MessageSquare className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">Comment on Step {payload.targetSeq}</span>
                            {payload.directsAgent && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#da7756]/20 text-[#da7756] border border-[#da7756]/30 font-semibold font-mono">
                                Directs Agent
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">Seq {ev.seq}</span>
                        </div>
                        <p className="text-xs text-blue-100/90 leading-relaxed">{payload.body}</p>
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
                          {ev.actorType === 'human' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950/40 text-purple-300 font-mono">
                              Human Driver
                            </span>
                          )}
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

                if (ev.type === 'run.summarized') {
                  const payload = ev.payload as any;
                  return (
                    <div
                      key={ev.id}
                      className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 space-y-1.5 shadow-lg"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4" /> Synthesized into Team Knowledge Base
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">Seq {ev.seq}</span>
                      </div>
                      <p className="text-xs text-emerald-100/90 leading-relaxed font-sans">{payload.summary}</p>
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
                          disabled={isViewer}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition"
                        >
                          Approve Command
                        </button>
                        <button
                          onClick={() => handleApprove(payload.approvalId, false)}
                          disabled={isViewer}
                          className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-semibold transition"
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
          <div className="p-4 border-t border-[#292826] bg-[#181716] shrink-0 space-y-3">
            {/* If Human Driving, show Human Command Terminal */}
            {runState.driver.type === 'human' && (
              <form onSubmit={handleExecuteHumanTool} className="p-2.5 rounded-xl border border-purple-500/40 bg-purple-950/20 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-400 shrink-0" />
                <input
                  type="text"
                  value={humanToolCmd}
                  onChange={(e) => setHumanToolCmd(e.target.value)}
                  disabled={isViewer}
                  placeholder="You are driving! Execute shell command in sandbox (e.g. 'pnpm test:auth')..."
                  className="flex-1 bg-transparent text-xs text-purple-200 placeholder-purple-400/60 focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={!humanToolCmd.trim() || isViewer}
                  className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-semibold text-white transition"
                >
                  Run
                </button>
              </form>
            )}

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
                  disabled={isViewer}
                  placeholder={
                    isViewer
                      ? 'Viewer mode: steering is disabled'
                      : "Steer agent live in sub-300ms (e.g. 'Keep the v1 response shape')..."
                  }
                  className="flex-1 bg-[#121110] border border-[#2e2d2a] focus:border-[#da7756] disabled:opacity-40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#666460] focus:outline-none transition shadow-inner"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim() || isViewer}
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
                activeTab === 'context' ? 'bg-[#252422] text-[#da7756]' : 'text-[#888580] hover:text-white'
              }`}
            >
              Context
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'files' ? 'bg-[#252422] text-[#da7756]' : 'text-[#888580] hover:text-white'
              }`}
            >
              Files
            </button>
            <button
              onClick={() => setActiveTab('people')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'people' ? 'bg-[#252422] text-[#da7756]' : 'text-[#888580] hover:text-white'
              }`}
            >
              People ({presenceUsers.length || 3})
            </button>
            <button
              onClick={() => setActiveTab('limits')}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                activeTab === 'limits' ? 'bg-[#252422] text-[#da7756]' : 'text-[#888580] hover:text-white'
              }`}
            >
              Limits
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'context' && (
              <div className="space-y-4">
                {contextError && (
                  <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-950/20 text-red-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{contextError}</span>
                  </div>
                )}

                {contextSaved && (
                  <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Saved! Broadcasted to agent on next step.</span>
                  </div>
                )}

                <div className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#da7756]" />
                      {activeBlock?.title || 'Instructions'} (v{activeBlock?.currentVersion || 1})
                    </span>
                    <button
                      onClick={handleSaveContextBlock}
                      disabled={isViewer}
                      className="px-2 py-1 rounded bg-[#da7756] hover:bg-[#c66545] disabled:opacity-40 text-white text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                  <textarea
                    rows={7}
                    value={blockContent}
                    onChange={(e) => setBlockContent(e.target.value)}
                    disabled={isViewer}
                    className="w-full bg-[#121110] border border-[#292826] rounded-lg p-2.5 text-xs text-[#c2bfba] font-mono focus:border-[#da7756] focus:outline-none transition leading-relaxed resize-none disabled:opacity-60"
                  />
                  <div className="text-[10px] text-[#666460]">
                    Block-level versioning with 30s soft-lock protection.
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

      {/* PHASE 3: HANDOFF MODAL */}
      {showHandoffModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#1c1b1a] border border-[#383632] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                Hand off Driver Control
              </h3>
              <button
                onClick={() => setShowHandoffModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Select Teammate</label>
                <select
                  value={handoffUserId}
                  onChange={(e) => setHandoffUserId(e.target.value)}
                  className="w-full bg-[#121110] border border-[#2e2d2a] rounded-lg p-2.5 text-white focus:outline-none"
                >
                  <option value="01935e40-0002-7000-8000-000000000002">Ahmed Hassan (Admin)</option>
                  <option value="01935e40-0002-7000-8000-000000000003">Lina Mori (Engineer)</option>
                  <option value="01935e40-0002-7000-8000-000000000001">Sara Chen (Owner)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Handoff Note (Optional)</label>
                <textarea
                  rows={3}
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder="e.g. Taking lunch, please monitor step 3 and approve database migration."
                  className="w-full bg-[#121110] border border-[#2e2d2a] rounded-lg p-2.5 text-white focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowHandoffModal(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleHandoff}
                className="px-3.5 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#c66545] text-xs font-semibold text-white"
              >
                Request Handoff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 3: FORK MODAL */}
      {showForkModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#1c1b1a] border border-[#383632] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <GitFork className="w-4 h-4 text-emerald-400" />
                Fork Run (Edit-and-Rerun)
              </h3>
              <button
                onClick={() => setShowForkModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Fork from Sequence Number</label>
                <input
                  type="number"
                  value={forkAtSeq}
                  onChange={(e) => setForkAtSeq(Number(e.target.value))}
                  className="w-full bg-[#121110] border border-[#2e2d2a] rounded-lg p-2.5 text-white font-mono focus:outline-none"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Events 1 through {forkAtSeq} will be cloned into the new run.
                </p>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Edited Steering Message (Optional)</label>
                <textarea
                  rows={3}
                  value={forkEditedMessage}
                  onChange={(e) => setForkEditedMessage(e.target.value)}
                  placeholder="e.g. Try an alternative migration strategy without touching the legacy schema..."
                  className="w-full bg-[#121110] border border-[#2e2d2a] rounded-lg p-2.5 text-white focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForkModal(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleFork}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
              >
                Create Fork & Launch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 3: GRAPH VIEW MODAL */}
      {showGraphModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#181716] border border-[#383632] rounded-2xl w-full max-w-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-purple-400" />
                Run Lineage & Fork Graph
              </h3>
              <button
                onClick={() => setShowGraphModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 bg-[#121110] rounded-xl border border-zinc-800 min-h-[240px] flex items-center justify-center">
              <div className="space-y-6 w-full max-w-md">
                {/* Parent Node */}
                <div className="p-3.5 rounded-xl border border-[#da7756]/60 bg-[#1c1b1a] shadow-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                      <div className="text-xs font-semibold text-white">{runState.title}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">ID: {runId.slice(0, 8)}... (Mainline)</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 font-mono">
                    Seq {runState.lastSeq}
                  </span>
                </div>

                {/* Connecting branch line */}
                <div className="pl-6 border-l-2 border-dashed border-[#da7756]/40 ml-6 space-y-4">
                  <div className="p-3 rounded-xl border border-zinc-700 bg-[#181716] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-purple-300">Fork: Alternative Schema Strategy</div>
                      <div className="text-[10px] text-zinc-500 font-mono">Branched at Seq 4 • Created by Ahmed</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950/40 text-purple-400 font-mono">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowGraphModal(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
