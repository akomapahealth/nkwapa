'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useChatContext, type ChatUser } from '@/lib/chat-context';
import { apiFetch } from '@/lib/api';
import { presenceLabel } from '@/lib/chat-display';
import { cn } from '@/lib/utils';
import { ChatAvatar } from './ChatAvatar';

type PickerUser = ChatUser & { role?: string };

/**
 * The clinic's chat directory.
 *
 * `direct` starts a conversation with one tap. `group` selects several people and an optional name
 * (#30); `add` selects people to add to an existing group, leaving out who is already in it.
 */
export function ChatUserPicker({
  mode = 'direct',
  title,
  excludeUserIds = [],
  onSelect,
  onSubmit,
  onBack,
}: {
  mode?: 'direct' | 'group' | 'add';
  title?: string;
  excludeUserIds?: readonly string[];
  onSelect?: (user: ChatUser) => void;
  /** Group and add modes: the people chosen, and the group name in group mode. */
  onSubmit?: (userIds: string[], groupName: string | null) => Promise<void>;
  onBack: () => void;
}) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const activeClinicId = bootstrapCtx?.activeClinicId;
  const chat = useChatContext();

  const [users, setUsers] = useState<PickerUser[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = mode !== 'direct';
  const minimum = mode === 'group' ? 2 : 1;

  useEffect(() => {
    if (!activeClinicId || !getToken) return;
    let current = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/clinics/${activeClinicId}/chat/users`, { getToken });
        if (res.ok && current) setUsers(await res.json());
      } catch {
        // The list stays empty and says so.
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [activeClinicId, getToken]);

  const needle = filter.toLowerCase();
  const available = users.filter((user) => !excludeUserIds.includes(user.id));
  const filtered = needle
    ? available.filter(
        (user) =>
          user.displayName.toLowerCase().includes(needle) ||
          user.firstName?.toLowerCase().includes(needle) ||
          user.lastName?.toLowerCase().includes(needle),
      )
    : available;

  const toggle = (userId: string) =>
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  const submit = async () => {
    if (!onSubmit || selected.length < minimum) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(selected, mode === 'group' ? groupName.trim() || null : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    title ?? (mode === 'group' ? 'New group' : mode === 'add' ? 'Add people' : 'New Message');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <button
          onClick={onBack}
          className="cursor-pointer rounded-md p-1 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold">{heading}</h3>
      </div>
      {mode === 'group' ? (
        <div className="border-b px-3 py-2">
          <label className="sr-only" htmlFor="chat-group-name">
            Group name (optional)
          </label>
          <input
            id="chat-group-name"
            type="text"
            maxLength={200}
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      ) : null}
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search staff..."
            aria-label="Search staff"
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
          filtered.map((user) => {
            const online = chat?.onlineUserIds.has(user.id) ?? false;
            const checked = selected.includes(user.id);
            return (
              <button
                key={user.id}
                onClick={() => (multi ? toggle(user.id) : onSelect?.(user))}
                role={multi ? 'checkbox' : undefined}
                aria-checked={multi ? checked : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                  checked && 'bg-primary/5',
                )}
              >
                <ChatAvatar name={user.displayName} online={online} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[user.role, presenceLabel(online, chat?.lastSeen[user.id])]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {multi ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border',
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {checked ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
      {multi ? (
        <div className="space-y-2 border-t px-3 py-2">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <button
            onClick={() => void submit()}
            disabled={submitting || selected.length < minimum}
            className="w-full cursor-pointer rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? 'Working…'
              : mode === 'group'
                ? selected.length < minimum
                  ? 'Choose at least 2 people'
                  : `Create group with ${selected.length}`
                : `Add ${selected.length || ''}`.trim()}
          </button>
        </div>
      ) : null}
    </div>
  );
}
