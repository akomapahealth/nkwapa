'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useChatContext, type ChatUser } from '@/lib/chat-context';
import { apiFetch } from '@/lib/api';
import { ChatPresenceIndicator } from './ChatPresenceIndicator';

export function ChatUserPicker({
  onSelect,
  onBack,
}: {
  onSelect: (user: ChatUser) => void;
  onBack: () => void;
}) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const activeClinicId = bootstrapCtx?.activeClinicId;
  const chat = useChatContext();

  const [users, setUsers] = useState<(ChatUser & { role?: string })[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClinicId || !getToken) return;

    async function fetchUsers() {
      setLoading(true);
      try {
        const res = await apiFetch(`/clinics/${activeClinicId}/chat/users`, {
          getToken,
        });
        if (res.ok) {
          setUsers(await res.json());
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void fetchUsers();
  }, [activeClinicId, getToken]);

  const filtered = filter
    ? users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(filter.toLowerCase()) ||
          u.firstName?.toLowerCase().includes(filter.toLowerCase()) ||
          u.lastName?.toLowerCase().includes(filter.toLowerCase()),
      )
    : users;

  const handleSelect = useCallback(
    (user: ChatUser) => {
      onSelect(user);
    },
    [onSelect],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <button
          onClick={onBack}
          className="cursor-pointer rounded-md p-1 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold">New Message</h3>
      </div>
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search staff..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No users found</p>
        ) : (
          filtered.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelect(user)}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {(user.firstName?.[0] ?? user.displayName[0]).toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5">
                  <ChatPresenceIndicator online={chat?.onlineUserIds.has(user.id) ?? false} />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.displayName}</p>
                {user.role && (
                  <p className="truncate text-[11px] text-muted-foreground">{user.role}</p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
