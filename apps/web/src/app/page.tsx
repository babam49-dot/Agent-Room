'use client';

import React from 'react';
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
} from 'lucide-react';

export default function HomePage() {
  const orgSlug = 'acme-engineering';
  const runId = '01935e40-0004-7000-8000-000000000001';

  return (
    <div className="min-h-screen bg-[#141413] text-[#e8e6e3] flex flex-col">
      {/* Top Header */}
      <header className="h-14 border-b border-[#292826] bg-[#1a1918]/80 backdrop-blur px-6 flex items-center justify-between">
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-8">
        {/* Hero banner */}
        <div className="rounded-2xl border border-[#2e2d2a] bg-[#1c1b1a] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#da7756]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="max-w-2xl space-y-4">
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

        {/* Project & Active Runs Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-[#da7756]" />
              Active Projects & Shared Rooms
            </h2>
            <Link
              href={`/${orgSlug}/runs/${runId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#c66545] text-white text-xs font-medium transition shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Enter Live Demo Room
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Run Card 1 */}
            <Link
              href={`/${orgSlug}/runs/${runId}`}
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
      </main>
    </div>
  );
}
