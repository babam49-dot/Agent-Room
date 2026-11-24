import React from 'react';
import { cn } from './button.js';

export interface PresenceUser {
  userId: string;
  name: string;
  role: string;
  avatarUrl?: string;
  color?: string;
  isDriving?: boolean;
}

export const PresenceRoster: React.FC<{ users: PresenceUser[]; className?: string }> = ({
  users,
  className,
}) => {
  return (
    <div className={cn('flex items-center -space-x-2 overflow-hidden py-1', className)}>
      {users.map((u) => (
        <div
          key={u.userId}
          title={`${u.name} (${u.role})${u.isDriving ? ' - Driver' : ''}`}
          className="relative group transition-transform hover:scale-110 hover:z-20 cursor-pointer"
        >
          <img
            src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64'}
            alt={u.name}
            className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-950 object-cover"
          />
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-zinc-950 rounded-full" />
        </div>
      ))}
    </div>
  );
};
