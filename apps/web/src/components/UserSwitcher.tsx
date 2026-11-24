'use client';

import React, { useState, useEffect } from 'react';
import { User, ShieldCheck, ChevronDown } from 'lucide-react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  avatarUrl?: string;
}

const DEFAULT_USERS: UserProfile[] = [
  {
    id: '01935e40-0002-7000-8000-000000000001',
    name: 'Sara Chen',
    email: 'sara@acme.corp',
    role: 'owner',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&fit=crop',
  },
  {
    id: '01935e40-0002-7000-8000-000000000002',
    name: 'Ahmed Hassan',
    email: 'ahmed@acme.corp',
    role: 'admin',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&fit=crop',
  },
  {
    id: '01935e40-0002-7000-8000-000000000003',
    name: 'Lina Mori',
    email: 'lina@acme.corp',
    role: 'member',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop',
  },
];

export function UserSwitcher() {
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEFAULT_USERS[0]!);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('agentroom_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const match = DEFAULT_USERS.find((u) => u.id === parsed.id);
        if (match) setCurrentUser(match);
      } catch {}
    }
  }, []);

  const handleSelect = (user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem('agentroom_user', JSON.stringify(user));
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#33312e] bg-[#1c1b1a] hover:bg-[#252422] transition-colors"
      >
        <img
          src={currentUser.avatarUrl}
          alt={currentUser.name}
          className="w-6 h-6 rounded-full object-cover border border-[#44423e]"
        />
        <div className="text-left">
          <div className="text-xs font-medium text-[#f0eeeb] flex items-center gap-1.5">
            {currentUser.name}
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30 uppercase tracking-wider font-semibold">
              {currentUser.role}
            </span>
          </div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-[#888580]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-[#1c1b1a] border border-[#33312e] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95">
          <div className="px-3 py-1.5 text-[11px] font-medium text-[#888580] border-b border-[#292826] uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#da7756]" />
            Dev User Switcher (No Auth Required)
          </div>
          {DEFAULT_USERS.map((u) => (
            <button
              key={u.id}
              onClick={() => handleSelect(u)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#262422] transition-colors ${
                currentUser.id === u.id ? 'bg-[#262422]/60' : ''
              }`}
            >
              <img
                src={u.avatarUrl}
                alt={u.name}
                className="w-7 h-7 rounded-full object-cover border border-[#44423e]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[#f0eeeb] truncate flex items-center justify-between">
                  <span>{u.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 capitalize">
                    {u.role}
                  </span>
                </div>
                <div className="text-[11px] text-[#888580] truncate">{u.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
