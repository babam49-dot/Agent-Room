'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserSwitcher } from '../components/UserSwitcher';
import {
  Bot,
  Play,
  Users,
  GitBranch,
  ShieldAlert,
  ArrowRight,
  FolderGit2,
  Sparkles,
  Search,
  BookOpen,
  Activity,
  Terminal,
  Clock,
  CheckCircle2,
  Tag,
} from 'lucide-react';

export default function HomePage() {
  const orgSlug = 'acme-engineering';
  const defaultRunId = '01935e40-0004-7000-8000-000000000001';
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ runs: any[]; knowledgeItems: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [knowledgeList, setKnowledgeList] = useState<any[]>([]);

  // Fetch recent activity and knowledge items
  useEffect(() => {
    async function loadData() {
      try {
        const [actRes, knowRes] = await Promise.all([
          fetch(`${API_URL}/v1/activity`),
          fetch(`${API_URL}/v1/knowledge-items`),
        ]);

        if (actRes.ok) {
          const actData = await actRes.json();
          setActivityEvents(actData.events || []);
        }

        if (knowRes.ok) {
          const knowData = await knowRes.json();
          setKnowledgeList(knowData.items || []);
        }
      } catch {}
    }

    loadData();
  }, []);

  // Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_URL}/v1/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch {} finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-[#141413] text-[#e8e6e3] flex flex-col select-none">
      {/* Top Header */}
      <header className="h-14 border-b border-[#292826] bg-[#1a1918]/90 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#da7756] flex items-center justify-center text-white font-bold shadow-md shadow-[#da7756]/20">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-white text-base">AgentRoom</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#da7756]/15 text-[#da7756] font-medium border border-[#da7756]/30">
              Multiplayer AI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <UserSwitcher />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Search Bar */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search runs, plans, code tools, and team knowledge (e.g. 'payments v2', 'migration', 'auth')..."
              className="w-full bg-[#1c1b1a] border border-[#2e2d2a] focus:border-[#da7756] rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none transition shadow-lg"
            />
            {isSearching && (
              <span className="absolute right-4 text-xs text-zinc-500 animate-pulse font-mono">
                Searching...
              </span>
            )}
          </div>

          {/* Search Dropdown Results */}
          {searchResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#181716] border border-[#383632] rounded-2xl p-4 shadow-2xl z-50 space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-2">
                <span>Search results for "{searchQuery}"</span>
                <span className="font-mono">
                  {searchResults.runs.length} runs, {searchResults.knowledgeItems.length} knowledge items
                </span>
              </div>

              {searchResults.runs.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase text-zinc-400">Runs</span>
                  {searchResults.runs.map((r) => (
                    <Link
                      key={r.id}
                      href={`/${orgSlug}/runs/${r.id}`}
                      className="block p-2.5 rounded-xl bg-[#201f1d] hover:bg-[#282725] border border-zinc-800 transition text-xs"
                    >
                      <div className="font-semibold text-white">{r.title}</div>
                      <div className="text-[11px] text-zinc-400 line-clamp-1">{r.goal}</div>
                    </Link>
                  ))}
                </div>
              )}

              {searchResults.knowledgeItems.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase text-zinc-400">Knowledge Items</span>
                  {searchResults.knowledgeItems.map((k) => (
                    <div
                      key={k.id}
                      className="p-2.5 rounded-xl bg-[#201f1d] border border-zinc-800 text-xs space-y-1"
                    >
                      <div className="font-semibold text-[#da7756] flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" /> {k.title}
                      </div>
                      <div className="text-[11px] text-zinc-300 line-clamp-2">{k.bodyMd}</div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.runs.length === 0 && searchResults.knowledgeItems.length === 0 && (
                <div className="text-center py-4 text-xs text-zinc-500">
                  No matching runs or knowledge items found.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hero banner */}
        <div className="rounded-2xl border border-[#2e2d2a] bg-[#1c1b1a] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#da7756]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#da7756]/10 text-[#da7756] border border-[#da7756]/25 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              YC Fall 2026 RFS: Multiplayer AI
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Figma for Agent Runs
            </h1>
            <p className="text-[#a19e98] text-sm leading-relaxed">
              A shared room where engineering teams run, watch, steer, and hand off long-running AI coding agents in real-time. Every action recorded, auditable, and steerable in sub-300ms.
            </p>
          </div>
        </div>

        {/* Active Projects & Shared Rooms */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-[#da7756]" />
              Shared Rooms & Projects
            </h2>
            <Link
              href={`/${orgSlug}/runs/${defaultRunId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#c66545] text-white text-xs font-medium transition shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Enter Live Demo Room
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Run Card 1 */}
            <Link
              href={`/${orgSlug}/runs/${defaultRunId}`}
              className="group block p-5 rounded-xl border border-[#2e2d2a] bg-[#1a1918] hover:border-[#da7756]/60 hover:bg-[#201f1d] transition-all duration-200 shadow-lg"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Live Autonomous Run
                  </span>
                </div>
                <span className="text-xs text-[#888580] font-mono">claude-sonnet-5-5</span>
              </div>

              <h3 className="text-base font-semibold text-white group-hover:text-[#da7756] transition-colors mb-1.5">
                Migrate the payments endpoint to v2
              </h3>
              <p className="text-xs text-[#9c9a94] line-clamp-2 mb-4 leading-relaxed">
                Migrate legacy /v1/charge endpoint to idempotent /v2/payments, update tests, and verify schema backward compatibility.
              </p>

              <div className="flex items-center justify-between pt-3 border-t border-[#292826] text-xs text-[#888580]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-blue-400" /> 3 watching
                  </span>
                  <span className="flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5 text-[#da7756]" /> Driver: Agent
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[#da7756] group-hover:translate-x-1 transition-transform">
                  Enter Room <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>

            {/* Project info card */}
            <div className="p-5 rounded-xl border border-[#2e2d2a] bg-[#1a1918] flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 text-xs font-medium text-[#888580]">
                  <FolderGit2 className="w-4 h-4 text-[#888580]" />
                  Repository: github.com/acme/payments-service
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">Payments v2 Service</h3>
                <p className="text-xs text-[#9c9a94] leading-relaxed mb-4">
                  Shared repository project for billing, payouts, webhook workers, and migration tasks.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#888580] pt-3 border-t border-[#292826]">
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                  Policy: Safe Defaults
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                  Sandbox: Fake/Docker
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Two-Column Section: Team Knowledge Base & Activity Feed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Team Knowledge Base */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#da7756]" />
              Team Knowledge Base (Summaries)
            </h3>
            <div className="space-y-2.5">
              {knowledgeList.length > 0 ? (
                knowledgeList.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border border-[#2e2d2a] bg-[#1c1b1a] space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{item.title}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{item.bodyMd}</p>
                    <div className="flex items-center gap-1.5 pt-1">
                      {item.tags?.map((t: string) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" /> {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 rounded-xl border border-[#2e2d2a] bg-[#1a1918] text-center space-y-1">
                  <BookOpen className="w-6 h-6 text-zinc-600 mx-auto" />
                  <div className="text-xs text-zinc-400">No knowledge items yet.</div>
                  <div className="text-[11px] text-zinc-600">
                    Finished runs are automatically summarized here for team memory.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Organization Activity Feed */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Recent Organization Activity
            </h3>
            <div className="space-y-2">
              {activityEvents.length > 0 ? (
                activityEvents.slice(0, 5).map((ev) => (
                  <div key={ev.id} className="p-3 rounded-xl border border-[#2e2d2a] bg-[#1a1918] flex items-start gap-2.5 text-xs">
                    <Terminal className="w-4 h-4 text-[#da7756] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-200">{ev.type}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-zinc-400 text-[11px] truncate">
                        {ev.payload?.summary || ev.payload?.text || ev.payload?.output || JSON.stringify(ev.payload)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 rounded-xl border border-[#2e2d2a] bg-[#1a1918] text-center space-y-1">
                  <Activity className="w-6 h-6 text-zinc-600 mx-auto" />
                  <div className="text-xs text-zinc-400">Activity stream live</div>
                  <div className="text-[11px] text-zinc-600">Events appear here as teammates run agents.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
