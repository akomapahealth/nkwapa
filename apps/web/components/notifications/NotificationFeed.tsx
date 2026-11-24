'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  FileSignature,
  KeyRound,
  ListChecks,
  MailWarning,
  MessageSquare,
  Stethoscope,
  TrendingUp,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { RelativeTime } from '@/components/app-shell/RelativeTime';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { openNotificationUrl } from '@/lib/browser-notifications';
import { acknowledgedLabel, acknowledgeUrgentFlag } from '@/lib/follow-up';
import {
  fetchInbox,
  INBOX_CHANGED_EVENT,
  markInboxRead,
  type InboxItem,
  type InboxKind,
} from '@/lib/inbox';
import { claimDoctorRequest, resolveDoctorRequest, StationRequestError } from '@/lib/stations';
import { doctorRequestLabel, type DoctorRequest } from '@/lib/doctor-requests';
import { cn } from '@/lib/utils';

const KIND: Record<
  InboxKind,
  { icon: LucideIcon; label: string; many: string; group: (n: number) => string }
> = {
  DOCTOR_REQUEST: {
    icon: Stethoscope,
    label: 'Ask a doctor',
    many: 'requests',
    group: (n) => `${n} doctor requests`,
  },
  HEALTH_ALERT: {
    icon: AlertTriangle,
    label: 'Urgent review',
    many: 'findings',
    group: (n) => `${n} urgent findings`,
  },
  MESSAGE: {
    icon: MessageSquare,
    label: 'Message',
    many: 'messages',
    group: (n) => `${n} conversations`,
  },
  COSIGN: {
    icon: FileSignature,
    label: 'Cosign',
    many: 'notes',
    group: (n) => `${n} notes to cosign`,
  },
  ASSIGNMENT: {
    icon: UserCheck,
    label: 'Assignment',
    many: 'assignments',
    group: (n) => `${n} assignments`,
  },
  APPOINTMENT_REQUEST: {
    icon: CalendarClock,
    label: 'Appointment request',
    many: 'requests',
    group: (n) => `${n} appointment requests`,
  },
  INVITE: {
    icon: UserPlus,
    label: 'Invitation',
    many: 'updates',
    group: (n) => `${n} people joined`,
  },
  REMINDER_FAILED: {
    icon: MailWarning,
    label: 'Reminder not sent',
    many: 'reminders',
    group: (n) => `${n} reminders not sent`,
  },
  ACCESS_CHANGE: {
    icon: KeyRound,
    label: 'Your access',
    many: 'changes',
    group: (n) => `${n} access changes`,
  },
  RISK_TIER_CHANGE: {
    icon: TrendingUp,
    label: 'Follow-up risk',
    many: 'changes',
    group: (n) => `${n} follow-up risk changes`,
  },
  FOLLOW_UP_DUE: {
    icon: ListChecks,
    label: 'Follow-up',
    many: 'updates',
    group: (n) => `${n} follow-up updates`,
  },
};

/** Read items of one kind on one day fold into a single row from this many. */
const GROUP_FROM = 3;

export type FeedEntry =
  | { type: 'item'; item: InboxItem }
  | { type: 'group'; kind: InboxKind; key: string; items: InboxItem[] };
export type FeedSection = { key: string; label: string; entries: FeedEntry[] };

function dayLabel(date: Date, now: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * Day sections, newest first. An unread urgent finding leads in its own section whatever its time.
 * Read items of one kind that day fold into one expandable row once there are GROUP_FROM of them;
 * unread items always stand alone, so nothing new hides inside a fold.
 */
export function groupFeed(items: InboxItem[], now = new Date()): FeedSection[] {
  const urgent = items.filter((item) => item.kind === 'HEALTH_ALERT' && !item.readAt);
  const rest = items.filter((item) => !urgent.includes(item));
  const sections: FeedSection[] = urgent.length
    ? [
        {
          key: 'urgent',
          label: 'Needs you now',
          entries: urgent.map((item) => ({ type: 'item', item })),
        },
      ]
    : [];
  const byDay = new Map<string, InboxItem[]>();
  for (const item of rest) {
    const date = new Date(item.updatedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  for (const [key, dayItems] of byDay) {
    const foldable = (item: InboxItem) =>
      Boolean(item.readAt) && !item.riskFlag && !item.doctorRequest;
    const counts = new Map<InboxKind, number>();
    for (const item of dayItems)
      if (foldable(item)) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    const entries: FeedEntry[] = [];
    const placed = new Set<InboxKind>();
    for (const item of dayItems) {
      if (foldable(item) && (counts.get(item.kind) ?? 0) >= GROUP_FROM) {
        if (placed.has(item.kind)) continue;
        placed.add(item.kind);
        entries.push({
          type: 'group',
          kind: item.kind,
          key: `${key}:${item.kind}`,
          items: dayItems.filter((other) => other.kind === item.kind && foldable(other)),
        });
      } else entries.push({ type: 'item', item });
    }
    sections.push({ key, label: dayLabel(new Date(dayItems[0].updatedAt), now), entries });
  }
  return sections;
}

/** The inbox for the page and the bell's panel: load, page, mark read, open, take a flag. */
export function useInboxFeed(enabled = true) {
  const getToken = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const userId = useBootstrap()?.bootstrap?.userId ?? null;
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);

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
    if (enabled) void load();
  }, [enabled, load]);

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
    void markInboxRead(getToken, ids)
      .then(() => window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)))
      .catch(() => void load());
  };

  const open = (item: InboxItem) => {
    if (!item.readAt) markRead([item.id]);
    // A chat link opens the chat panel in place; anything else navigates.
    openNotificationUrl(item.url, (next) => router.push(next));
  };

  /** "I'm on it" from the row: the first taker owns the flag, and every copy of the row says so. */
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

  /** A doctor request's "I'm on it" and "Seen" (#418). The first doctor wins; the rest see who. */
  const answerDoctor = async (item: InboxItem, action: 'claim' | 'resolve') => {
    const request = item.doctorRequest;
    if (!request || !item.clinicId || !getToken) return;
    setTaking(item.id);
    try {
      const next = await (action === 'claim' ? claimDoctorRequest : resolveDoctorRequest)(
        item.clinicId,
        request.id,
        getToken,
      );
      const now = new Date().toISOString();
      const update = (other: InboxItem): InboxItem =>
        other.doctorRequest?.id === request.id
          ? { ...other, readAt: other.readAt ?? now, doctorRequest: next }
          : other;
      setItems((current) => (current ?? []).map(update));
      if (!item.readAt) setUnread((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
    } catch (cause) {
      // Taken first, or the patient left the line: the feed re-reads to show who and what.
      if (cause instanceof StationRequestError && cause.status === 409) void load();
      showToast({
        tone: 'error',
        title: action === 'claim' ? 'Could not take this request' : 'Could not mark it seen',
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setTaking(null);
    }
  };

  return {
    items,
    unread,
    nextBefore,
    error,
    loadingMore,
    taking,
    userId,
    load,
    loadMore,
    markRead,
    open,
    take,
    answerDoctor,
  };
}

export type InboxFeed = ReturnType<typeof useInboxFeed>;

/** Day sections of rows. `dense` is the bell's panel: one line of body, tighter rows. */
export function NotificationFeed({
  feed,
  items,
  dense = false,
}: {
  feed: InboxFeed;
  items: InboxItem[];
  dense?: boolean;
}) {
  // The page and the bell's panel can both be on screen; heading ids must not collide.
  const uid = useId();
  return (
    <div className={dense ? 'space-y-3' : 'space-y-6'}>
      {groupFeed(items).map((section) => (
        <section key={section.key} aria-labelledby={`${uid}-${section.key}`}>
          <h2
            id={`${uid}-${section.key}`}
            className={cn(
              'mb-1.5 font-body text-xs font-semibold uppercase tracking-wide',
              section.key === 'urgent' ? 'text-destructive-ink' : 'text-muted-foreground',
              dense ? 'px-3' : 'px-1',
            )}
          >
            {section.label}
          </h2>
          <ul
            aria-label={section.label}
            className={cn(
              'divide-y divide-border overflow-hidden',
              !dense && 'rounded-xl border border-border bg-card',
            )}
          >
            {section.entries.map((entry) =>
              entry.type === 'item' ? (
                <li key={entry.item.id} className="min-w-0">
                  <NotificationRow item={entry.item} feed={feed} dense={dense} />
                </li>
              ) : (
                <NotificationGroup key={entry.key} entry={entry} feed={feed} dense={dense} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationGroup({
  entry,
  feed,
  dense,
}: {
  entry: Extract<FeedEntry, { type: 'group' }>;
  feed: InboxFeed;
  dense: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const kind = KIND[entry.kind];
  const Icon = kind.icon;
  const [first, ...more] = entry.items;
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-start gap-3 text-left transition-colors duration-fast hover:bg-muted/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          dense ? 'px-3 py-2.5' : 'px-4 py-3',
        )}
      >
        <RowIcon icon={Icon} tone="quiet" dense={dense} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {kind.group(entry.items.length)}
            </span>
            <RelativeTime
              value={first.updatedAt}
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
            />
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {first.title}
            {more.length ? `, and ${more.length} more` : ''}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded ? (
        <ul
          aria-label={kind.group(entry.items.length)}
          className="divide-y divide-border border-t border-border bg-muted/30"
        >
          {entry.items.map((item) => (
            <li key={item.id} className="min-w-0">
              <NotificationRow item={item} feed={feed} dense={dense} nested />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RowIcon({
  icon: Icon,
  tone,
  dense,
}: {
  icon: LucideIcon;
  tone: 'urgent' | 'unread' | 'quiet';
  dense: boolean;
}) {
  return (
    <span
      className={cn(
        'mt-0.5 flex shrink-0 items-center justify-center rounded-full',
        dense ? 'h-7 w-7' : 'h-8 w-8',
        tone === 'urgent' && 'bg-destructive/10 text-destructive-ink',
        tone === 'unread' && 'bg-primary/10 text-primary',
        tone === 'quiet' && 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function NotificationRow({
  item,
  feed,
  dense,
  nested = false,
}: {
  item: InboxItem;
  feed: InboxFeed;
  dense: boolean;
  nested?: boolean;
}) {
  const kind = KIND[item.kind];
  const unread = !item.readAt;
  const urgent = item.kind === 'HEALTH_ALERT';
  const flag = item.riskFlag;
  const owner = flag?.acknowledgedBy;
  const doctor = item.doctorRequest;
  return (
    <div
      className={cn(
        'relative min-w-0',
        urgent && unread && 'bg-destructive/[0.05] shadow-[inset_3px_0_0_hsl(var(--destructive))]',
        !urgent && unread && 'bg-primary/[0.04]',
      )}
    >
      <button
        type="button"
        onClick={() => feed.open(item)}
        className={cn(
          'flex w-full min-w-0 items-start gap-3 text-left transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          urgent && unread ? 'hover:bg-destructive/[0.05]' : 'hover:bg-muted/60',
          dense ? 'px-3 py-2.5' : 'px-4 py-3',
          nested && (dense ? 'pl-12' : 'pl-[3.75rem]'),
        )}
      >
        {nested ? null : (
          <RowIcon
            icon={kind.icon}
            tone={urgent ? 'urgent' : unread ? 'unread' : 'quiet'}
            dense={dense}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                'min-w-0 text-sm leading-snug text-foreground [overflow-wrap:anywhere]',
                unread ? 'font-semibold' : 'font-medium',
                dense && 'line-clamp-2',
              )}
            >
              {item.title}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <RelativeTime
                value={item.updatedAt}
                className="text-xs tabular-nums text-muted-foreground"
              />
              {unread ? (
                <span className="h-2 w-2 rounded-full bg-primary">
                  <span className="sr-only">Unread</span>
                </span>
              ) : null}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block text-sm text-muted-foreground [overflow-wrap:anywhere]',
              dense ? 'line-clamp-1' : 'line-clamp-2',
            )}
          >
            <span className={urgent ? 'font-medium text-destructive-ink' : undefined}>
              {item.count > 1 ? `${item.count} ${kind.many}` : kind.label}
            </span>
            {item.body ? ` · ${item.body}` : null}
          </span>
        </span>
      </button>
      {/* Outside the row's button: one control may not sit inside another. */}
      {flag && (owner || flag.open) ? (
        <div
          key={owner ? 'taken' : 'open'}
          className={cn(
            'flex items-center gap-2 pb-3 motion-safe:animate-in motion-safe:fade-in-0 duration-200 ease-out',
            dense ? 'pl-[3.25rem] pr-3' : 'pl-[3.75rem] pr-4',
          )}
        >
          {owner ? (
            <p
              role="status"
              data-testid="notification-owner"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <UserCheck className="h-4 w-4 text-success-ink" aria-hidden="true" />
              {acknowledgedLabel(owner, feed.userId)}
            </p>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void feed.take(item)}
              loading={feed.taking === item.id}
            >
              I&apos;m on it
            </Button>
          )}
        </div>
      ) : null}
      {doctor && (doctor.claimedBy || doctor.open) ? (
        <DoctorRequestActions request={doctor} item={item} feed={feed} dense={dense} />
      ) : null}
    </div>
  );
}

function DoctorRequestActions({
  request,
  item,
  feed,
  dense,
}: {
  request: DoctorRequest;
  item: InboxItem;
  feed: InboxFeed;
  dense: boolean;
}) {
  const mine = request.claimedBy?.id === feed.userId;
  return (
    <div
      key={request.claimedBy ? 'taken' : 'open'}
      className={cn(
        'flex flex-wrap items-center gap-2 pb-3 motion-safe:animate-in motion-safe:fade-in-0 duration-200 ease-out',
        dense ? 'pl-[3.25rem] pr-3' : 'pl-[3.75rem] pr-4',
      )}
    >
      {request.claimedBy ? (
        <p
          role="status"
          data-testid="notification-owner"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <UserCheck className="h-4 w-4 text-success-ink" aria-hidden="true" />
          {request.open ? doctorRequestLabel(request, feed.userId) : 'Seen'}
        </p>
      ) : (
        <Button
          variant={request.urgency === 'NOW' ? 'destructive' : 'default'}
          size="sm"
          onClick={() => void feed.answerDoctor(item, 'claim')}
          loading={feed.taking === item.id}
        >
          I&apos;m on it
        </Button>
      )}
      {mine && request.open ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void feed.answerDoctor(item, 'resolve')}
          loading={feed.taking === item.id}
        >
          Seen
        </Button>
      ) : null}
    </div>
  );
}
