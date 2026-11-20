'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  FileSignature,
  KeyRound,
  MailWarning,
  MessageSquare,
  Send,
  ListChecks,
  Settings2,
  TrendingUp,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RelativeTime } from '@/components/app-shell/RelativeTime';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { acknowledgedLabel, acknowledgeUrgentFlag } from '@/lib/follow-up';
import { useBootstrap } from '@/lib/bootstrap-context';
import { hasPermission } from '@/lib/ops';
import { openNotificationUrl } from '@/lib/browser-notifications';
import {
  fetchInbox,
  INBOX_CHANGED_EVENT,
  markInboxRead,
  type InboxItem,
  type InboxKind,
} from '@/lib/inbox';
import { cn } from '@/lib/utils';

const KIND: Record<InboxKind, { icon: LucideIcon; label: string; many: string }> = {
  HEALTH_ALERT: { icon: AlertTriangle, label: 'Urgent review', many: 'findings' },
  MESSAGE: { icon: MessageSquare, label: 'Message', many: 'messages' },
  COSIGN: { icon: FileSignature, label: 'Cosign', many: 'notes' },
  ASSIGNMENT: { icon: UserCheck, label: 'Assignment', many: 'assignments' },
  APPOINTMENT_REQUEST: { icon: CalendarClock, label: 'Appointment request', many: 'requests' },
  INVITE: { icon: UserPlus, label: 'Invitation', many: 'updates' },
  REMINDER_FAILED: { icon: MailWarning, label: 'Reminder not sent', many: 'reminders' },
  ACCESS_CHANGE: { icon: KeyRound, label: 'Your access', many: 'changes' },
  RISK_TIER_CHANGE: { icon: TrendingUp, label: 'Follow-up risk', many: 'changes' },
  FOLLOW_UP_DUE: { icon: ListChecks, label: 'Follow-up', many: 'updates' },
};

type Filter = 'all' | 'unread';

/**
 * The bell's page: what happened for this person, in plain English, newest first. Opening a tile
 * marks it read and goes where it points.
 */
export default function NotificationsPage() {
  const getToken = useAuth();
  const router = useRouter();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const { showToast } = useToast();

  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canSeeDelivery = hasPermission(permissions, 'REMINDER.READ');

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchInbox(getToken);
      setItems(page.items);
      setUnread(page.unreadCount);
      setNextBefore(page.nextBefore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.');
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const page = await fetchInbox(getToken, nextBefore);
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'More notifications could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((current) =>
      (current ?? []).map((item) =>
        !ids || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? now } : item,
      ),
    );
    setUnread((count) => (ids ? Math.max(0, count - ids.length) : 0));
    void markInboxRead(getToken, ids).catch(() => void load());
  };

  const open = (item: InboxItem) => {
    if (!item.readAt) markRead([item.id]);
    // A chat link opens the chat panel in place; anything else navigates.
    openNotificationUrl(item.url, (next) => router.push(next));
  };

  /** "I'm on it" from the tile: the first taker owns the flag, and every copy of the tile says so. */
  const take = async (item: InboxItem) => {
    const flag = item.riskFlag;
    if (!flag || !item.clinicId) return;
    setTaking(item.id);
    try {
      const ack = await acknowledgeUrgentFlag(item.clinicId, flag.patientId, getToken);
      const now = new Date().toISOString();
      setItems((current) =>
        (current ?? []).map((other) =>
          other.riskFlag?.patientId === flag.patientId
            ? {
                ...other,
                readAt: other.readAt ?? now,
                riskFlag: { ...other.riskFlag, acknowledgedBy: ack },
              }
            : other,
        ),
      );
      if (!item.readAt) setUnread((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
    } catch (cause) {
      showToast({
        tone: 'error',
        title: 'Could not take this patient',
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setTaking(null);
    }
  };

  // An unread urgent finding leads, whatever its time: it asks for someone now.
  const pinned = (item: InboxItem) => item.kind === 'HEALTH_ALERT' && !item.readAt;
  const shown = (items ?? [])
    .filter((item) => filter === 'all' || !item.readAt)
    .sort((a, b) => Number(pinned(b)) - Number(pinned(a)));

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Notifications"
        description="Messages, urgent findings, requests and invitations for you, newest first."
        hideDescriptionOnPhone
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSeeDelivery ? (
              <Button asChild variant="ghost">
                <Link href="/notifications/delivery">
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                  Message delivery
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href="/account#notifications">
                <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Alert settings
              </Link>
            </Button>
            <Button variant="outline" onClick={() => markRead()} disabled={unread === 0}>
              <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              Mark all read
            </Button>
          </div>
        }
      />

      <SegmentedControl
        label="Show"
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: unread > 0 ? `Unread (${unread})` : 'Unread' },
        ]}
        className="w-full max-w-[18rem]"
      />

      {error && !items ? (
        <InlineErrorState
          title="Notifications could not be loaded"
          description={error}
          onRetry={() => void load()}
        />
      ) : !items ? (
        <SectionSkeleton lines={6} />
      ) : shown.length === 0 ? (
        <EmptyStateCard
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
          title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'You have read everything. Switch to All to see earlier notifications.'
              : 'Messages, urgent findings and requests for you will appear here.'
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2" aria-label="Notifications">
          {shown.map((item) => (
            <li key={item.id} className="min-w-0">
              <NotificationTile
                item={item}
                onOpen={() => open(item)}
                onTake={() => void take(item)}
                taking={taking === item.id}
                userId={bootstrap?.userId ?? null}
              />
            </li>
          ))}
        </ul>
      )}

      {items && nextBefore && filter === 'all' ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Show earlier notifications'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NotificationTile({
  item,
  onOpen,
  onTake,
  taking,
  userId,
}: {
  item: InboxItem;
  onOpen: () => void;
  onTake: () => void;
  taking: boolean;
  userId: string | null;
}) {
  const kind = KIND[item.kind];
  const Icon = kind.icon;
  const unread = !item.readAt;
  const urgent = item.kind === 'HEALTH_ALERT';
  const flag = item.riskFlag;
  const owner = flag?.acknowledgedBy;
  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col rounded-md border transition-colors duration-150',
        urgent && unread
          ? 'border-destructive/40 bg-destructive/[0.06]'
          : unread
            ? 'border-primary/30 bg-primary/[0.04]'
            : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group flex w-full min-w-0 flex-1 items-start gap-3 rounded-md p-4 text-left transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          urgent && unread
            ? 'hover:bg-destructive/[0.05]'
            : unread
              ? 'hover:bg-primary/[0.05]'
              : 'hover:bg-muted/60',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            urgent ? 'bg-destructive/10 text-destructive-ink' : 'bg-muted text-muted-foreground',
            unread && !urgent && 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                'text-xs font-medium',
                urgent ? 'text-destructive-ink' : 'text-muted-foreground',
              )}
            >
              {item.count > 1 ? `${item.count} ${kind.many}` : kind.label}
            </span>
            <RelativeTime value={item.updatedAt} className="text-xs text-muted-foreground" />
          </span>
          <span
            className={cn(
              'mt-1 block text-[0.9375rem] leading-snug text-foreground [overflow-wrap:anywhere]',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {item.title}
          </span>
          {item.body ? (
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {item.body}
            </span>
          ) : null}
        </span>
        {unread ? (
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">Unread</span>
          </span>
        ) : null}
      </button>
      {/* Outside the tile's button: one control may not sit inside another. */}
      {flag && (owner || flag.open) ? (
        <div
          key={owner ? 'taken' : 'open'}
          className="flex items-center gap-2 border-t border-destructive/15 px-4 py-2.5 pl-16 motion-safe:animate-in motion-safe:fade-in-0 duration-200 ease-out"
        >
          {owner ? (
            <p
              role="status"
              data-testid="notification-owner"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <UserCheck className="h-4 w-4 text-success-ink" aria-hidden="true" />
              {acknowledgedLabel(owner, userId)}
            </p>
          ) : (
            <Button variant="destructive" size="sm" onClick={onTake} loading={taking}>
              I&apos;m on it
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
