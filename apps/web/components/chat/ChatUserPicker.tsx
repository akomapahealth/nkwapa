'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useChatContext, type ChatUser } from '@/lib/chat-context';
import { apiFetch } from '@/lib/api';
import { presenceLabel } from '@/lib/chat-display';
import { formatRoleLabel } from '@/lib/ops';
import { cn } from '@/lib/utils';
import { ChatAvatar } from './ChatAvatar';
import { ChatSearchField } from './ChatSearchField';
import { Button } from '@/components/ui/button';

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
  // A directory that failed to load is not an empty clinic; it says so and offers a retry.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const multi = mode !== 'direct';
  const minimum = mode === 'group' ? 2 : 1;

  useEffect(() => {
    if (!activeClinicId || !getToken) return;
    let current = true;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const res = await apiFetch(`/clinics/${activeClinicId}/chat/users`, { getToken });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const loaded = (await res.json()) as PickerUser[];
        if (current) setUsers(loaded);
      } catch {
        if (current) setLoadFailed(true);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [activeClinicId, getToken, attempt]);

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
    title ?? (mode === 'group' ? 'New group' : mode === 'add' ? 'Add people' : 'New message');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="-ml-1.5 rounded-full"
          aria-label="Back"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <h3 className="text-base font-semibold tracking-tight">{heading}</h3>
      </div>
      <div className="space-y-2 border-b px-4 pb-2.5">
        {mode === 'group' ? (
          <>
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
              className="h-[var(--button-height)] w-full rounded-full border border-input bg-card px-4 text-base outline-none transition-[border-color,box-shadow] duration-fast placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30 [@media(pointer:fine)]:text-sm"
            />
          </>
        ) : null}
        <ChatSearchField
          value={filter}
          onChange={setFilter}
          placeholder="Search staff..."
          label="Search staff"
        />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain" data-testid="chat-picker-list">
        {loading ? (
          <p role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
            Loading staff…
          </p>
        ) : loadFailed ? (
          <div role="alert" className="flex flex-col items-center px-4 py-6 text-center">
            <p className="text-xs font-medium text-foreground">The staff list could not load</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Starting a conversation needs a connection.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
              className="mt-2 min-h-11 cursor-pointer rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {needle
              ? `No staff match \u201c${filter.trim()}\u201d`
              : 'No other staff in this clinic yet'}
          </p>
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
                  'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  checked && 'bg-primary/5',
                )}
              >
                <ChatAvatar name={user.displayName} online={online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium">{user.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      user.role && formatRoleLabel(user.role),
                      presenceLabel(online, chat?.lastSeen[user.id]),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {multi ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-fast',
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
        <div className="space-y-2 border-t px-4 py-2.5">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            onClick={() => void submit()}
            disabled={submitting || selected.length < minimum}
            className="w-full rounded-full"
          >
            {submitting
              ? 'Working…'
              : mode === 'group'
                ? selected.length < minimum
                  ? 'Choose at least 2 people'
                  : `Create group with ${selected.length}`
                : `Add ${selected.length || ''}`.trim()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
