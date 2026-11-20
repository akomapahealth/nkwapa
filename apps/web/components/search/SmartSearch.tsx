'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Building2,
  Compass,
  FileText,
  Loader2,
  Monitor,
  Moon,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Sun,
  Timer,
  User,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { db } from '@/lib/db';
import { isSealedRow } from '@/lib/offline-session/at-rest';
import { formatPersonName } from '@/lib/person-name';
import { useTheme } from '@/lib/theme-context';
import { WELCOME_TOUR_OPEN_EVENT } from '@/lib/welcome-tour';
import {
  SMART_SEARCH_OPEN_EVENT,
  clearRecent,
  loadRecent,
  pageResults,
  rankResults,
  rememberRecent,
  type SearchResult,
} from '@/lib/smart-search';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<SearchResult['kind'], LucideIcon> = {
  page: FileText,
  action: PanelsTopLeft,
  patient: User,
  staff: UserCog,
};
const REMOTE_DEBOUNCE_MS = 150;
const REMOTE_MIN_CHARS = 2;
const EXPAND = 'cubic-bezier(0.23, 1, 0.32, 1)';

interface Group {
  id: string;
  label: string;
  results: SearchResult[];
  /** Shown in place of results while they load or when they fail. */
  note?: string;
  loading?: boolean;
}

interface RemoteState {
  query: string;
  patients: SearchResult[];
  staff: SearchResult[];
  loading: boolean;
  offline: boolean;
  error: string | null;
}

const IDLE: RemoteState = {
  query: '',
  patients: [],
  staff: [],
  loading: false,
  offline: false,
  error: null,
};

/**
 * The navbar's Smart Search (#owner request 2026-11-20): a magnifier that opens into a bar, also
 * on Cmd/Ctrl+K and from the phone's More sheet. Pages and actions are ranked here as you type;
 * patients and staff come from routes that check the same permissions as their pages. Opening it
 * from the keyboard is instant, with no animation, since it is used many times a day.
 */
export function SmartSearch({
  clinicId,
  switchableClinics = [],
  onSwitchClinic,
  className,
}: {
  clinicId: string | null;
  switchableClinics?: ReadonlyArray<{ clinicId: string; clinicName: string }>;
  onSwitchClinic?: (clinicId: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { isOnline, syncNow, setSyncCenterOpen } = useSync();
  const { setPreference } = useTheme();
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedBy = useRef<'keyboard' | 'pointer'>('pointer');

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteState>(IDLE);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const userId = bootstrap?.userId;
  const perms = useMemo(() => bootstrap?.effectivePermissionsForActiveClinic ?? [], [bootstrap]);
  const can = useCallback((perm: string) => perms.includes('*') || perms.includes(perm), [perms]);
  const canSearchPatients = Boolean(clinicId) && can('PATIENT.SEARCH');
  const canSearchStaff = Boolean(clinicId) && can('CLINIC.MANAGE');

  const actions = useMemo<SearchResult[]>(() => {
    const list: SearchResult[] = [];
    if (clinicId && can('SYNC.PUSH') && can('SYNC.PULL')) {
      list.push(
        {
          id: 'action:sync-now',
          kind: 'action',
          title: 'Sync now',
          subtitle: 'Send this device’s changes and fetch the latest.',
          actionId: 'sync-now',
          icon: RefreshCw,
          keywords: 'upload offline outbox refresh',
        },
        {
          id: 'action:sync-center',
          kind: 'action',
          title: 'Open saved changes',
          subtitle: 'What is waiting to sync and anything that needs attention.',
          actionId: 'sync-center',
          icon: RefreshCw,
          keywords: 'sync center outbox pending blocked offline',
        },
      );
    }
    if (can('OPS.SHIFT.WRITE')) {
      list.push({
        id: 'action:shift',
        kind: 'action',
        title: 'Start or end my shift',
        subtitle: 'On your dashboard.',
        href: '/dashboard',
        icon: Timer,
        keywords: 'check in check out on duty off duty clock',
      });
    }
    for (const clinic of switchableClinics) {
      if (clinic.clinicId === clinicId || !onSwitchClinic) continue;
      list.push({
        id: `action:clinic:${clinic.clinicId}`,
        kind: 'action',
        title: `Switch to ${clinic.clinicName}`,
        subtitle: 'Change the active clinic.',
        actionId: `clinic:${clinic.clinicId}`,
        icon: Building2,
        keywords: 'clinic change switch site',
      });
    }
    list.push(
      {
        id: 'action:theme-light',
        kind: 'action',
        title: 'Use light theme',
        actionId: 'theme:light',
        icon: Sun,
        keywords: 'appearance mode bright',
      },
      {
        id: 'action:theme-dark',
        kind: 'action',
        title: 'Use dark theme',
        actionId: 'theme:dark',
        icon: Moon,
        keywords: 'appearance mode night',
      },
      {
        id: 'action:theme-system',
        kind: 'action',
        title: 'Match device theme',
        actionId: 'theme:system',
        icon: Monitor,
        keywords: 'appearance mode system auto',
      },
      {
        id: 'action:tour',
        kind: 'action',
        title: 'Take the tour',
        subtitle: 'A short walk through your workspace.',
        actionId: 'tour',
        icon: Compass,
        keywords: 'help guide onboarding learn',
      },
    );
    return list;
  }, [can, clinicId, onSwitchClinic, switchableClinics]);

  const pages = useMemo(() => pageResults(bootstrap), [bootstrap]);
  const local = useMemo(() => [...pages, ...actions], [pages, actions]);

  // ---- open and close ---------------------------------------------------------------------------

  const show = useCallback((by: 'keyboard' | 'pointer') => {
    openedBy.current = by;
    const rect = triggerRef.current?.getBoundingClientRect();
    // Grow out of the magnifier when it is on screen; on phones (More sheet) take the top edge.
    setAnchor(
      rect && rect.width > 0 ? { top: rect.top, right: window.innerWidth - rect.right } : null,
    );
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      // Another dialog owns the keyboard; do not stack a second one over it.
      if (!open && document.querySelector('[role="dialog"][data-state="open"]')) return;
      event.preventDefault();
      if (open) setOpen(false);
      else show('keyboard');
    };
    const onOpenEvent = () => show('pointer');
    window.addEventListener('keydown', onKey);
    window.addEventListener(SMART_SEARCH_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SMART_SEARCH_OPEN_EVENT, onOpenEvent);
    };
  }, [open, show]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setRemote(IDLE);
      setActiveId(null);
      return;
    }
    setRecent(loadRecent(userId, clinicId));
  }, [open, userId, clinicId]);

  // The magnifier opens out into the bar: a clip from the icon's corner, pointer-opened only.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel || openedBy.current === 'keyboard' || !anchor) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    panel.animate(
      [
        { clipPath: 'inset(0 0 calc(100% - 44px) calc(100% - 44px) round 16px)', opacity: 0.6 },
        { clipPath: 'inset(0 0 0 0 round 16px)', opacity: 1 },
      ],
      { duration: 240, easing: EXPAND },
    );
  }, [open, anchor]);

  // ---- remote records ---------------------------------------------------------------------------

  const trimmed = query.trim();
  useEffect(() => {
    if (!open || trimmed.length < REMOTE_MIN_CHARS || (!canSearchPatients && !canSearchStaff)) {
      setRemote(IDLE);
      return;
    }
    const controller = new AbortController();
    setRemote((current) => ({ ...current, query: trimmed, loading: true, error: null }));
    const timer = window.setTimeout(() => {
      void searchRecords({
        query: trimmed,
        clinicId: clinicId!,
        isOnline,
        getToken,
        signal: controller.signal,
        patients: canSearchPatients,
        staff: canSearchStaff,
      })
        .then((found) => {
          if (!controller.signal.aborted) setRemote({ ...found, query: trimmed, loading: false });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setRemote({
            ...IDLE,
            query: trimmed,
            error: 'Patients and staff could not be searched. Pages still work.',
          });
        });
    }, REMOTE_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, trimmed, clinicId, isOnline, getToken, canSearchPatients, canSearchStaff]);

  // ---- groups -----------------------------------------------------------------------------------

  const groups = useMemo<Group[]>(() => {
    if (!trimmed) {
      const live = new Map(local.map((result) => [result.id, result]));
      const recentShown = recent.flatMap((entry) => {
        if (entry.kind === 'staff') return canSearchStaff ? [entry] : [];
        const current = live.get(entry.id);
        return current ? [current] : []; // a page the viewer lost access to is dropped
      });
      const suggested = pages.filter((page) => !recentShown.some((entry) => entry.id === page.id));
      return [
        { id: 'recent', label: 'Recent', results: recentShown },
        { id: 'suggested', label: 'Go to', results: suggested.slice(0, 6) },
      ].filter((group) => group.results.length > 0);
    }
    const stale = remote.query !== trimmed;
    const recordsPending = trimmed.length >= REMOTE_MIN_CHARS && (remote.loading || stale);
    const list: Group[] = [
      { id: 'pages', label: 'Pages', results: rankResults(trimmed, pages, 5) },
      { id: 'actions', label: 'Actions', results: rankResults(trimmed, actions, 4) },
    ];
    if (canSearchPatients && trimmed.length >= REMOTE_MIN_CHARS) {
      list.push({
        id: 'patients',
        label: remote.offline ? 'Patients on this device' : 'Patients',
        results: stale ? [] : remote.patients,
        loading: recordsPending && !remote.patients.length,
        note: remote.error ?? undefined,
      });
    }
    if (canSearchStaff && isOnline && trimmed.length >= REMOTE_MIN_CHARS) {
      list.push({
        id: 'staff',
        label: 'Staff',
        results: stale ? [] : remote.staff,
        loading: recordsPending && !remote.staff.length,
      });
    }
    return list.filter((group) => group.results.length > 0 || group.loading || group.note);
  }, [trimmed, local, recent, pages, actions, remote, canSearchPatients, canSearchStaff, isOnline]);

  const flat = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const searching = groups.some((group) => group.loading);

  // Keep a valid option highlighted: the first, unless the current one is still there.
  useEffect(() => {
    setActiveId((current) =>
      current && flat.some((result) => result.id === current) ? current : (flat[0]?.id ?? null),
    );
  }, [flat]);

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(optionId(listboxId, activeId))?.scrollIntoView({ block: 'nearest' });
  }, [activeId, listboxId]);

  // ---- choosing ---------------------------------------------------------------------------------

  const choose = (result: SearchResult) => {
    rememberRecent(userId, clinicId, result);
    setOpen(false);
    if (result.href) {
      router.push(result.href);
      return;
    }
    const action = result.actionId ?? '';
    if (action === 'sync-now' && clinicId) void syncNow(clinicId);
    else if (action === 'sync-center') requestAnimationFrame(() => setSyncCenterOpen(true));
    else if (action === 'tour') window.dispatchEvent(new Event(WELCOME_TOUR_OPEN_EVENT));
    else if (action.startsWith('theme:'))
      setPreference(action.slice(6) as 'light' | 'dark' | 'system');
    else if (action.startsWith('clinic:')) onSwitchClinic?.(action.slice(7));
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const index = flat.findIndex((result) => result.id === activeId);
    const move = (to: number) => {
      if (!flat.length) return;
      event.preventDefault();
      setActiveId(flat[(to + flat.length) % flat.length].id);
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home' && event.ctrlKey) move(0);
    else if (event.key === 'End' && event.ctrlKey) move(flat.length - 1);
    else if (event.key === 'Enter') {
      const chosen = flat[index];
      if (chosen) {
        event.preventDefault();
        choose(chosen);
      }
    }
  };

  const statusText = !trimmed
    ? ''
    : searching
      ? 'Searching…'
      : flat.length
        ? `${flat.length} result${flat.length === 1 ? '' : 's'}`
        : `No matches for ${trimmed}`;

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Search"
              aria-keyshortcuts="Meta+K Control+K"
              aria-haspopup="dialog"
              aria-expanded={open}
              className={className}
              onClick={(event) => show(event.detail === 0 ? 'keyboard' : 'pointer')}
            >
              <Search aria-hidden="true" className="h-[18px] w-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2">
            Search
            <kbd className="rounded-sm border border-border px-1.5 font-sans text-xs">⌘K</kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/10" />
          <DialogPrimitive.Content
            ref={panelRef}
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              // No Radix Trigger here, so return focus to the magnifier ourselves. From the phone's
              // More sheet the magnifier is hidden; fall back to the page (R7.3).
              event.preventDefault();
              const target = anchor ? triggerRef.current : document.getElementById('main-content');
              target?.focus();
            }}
            style={
              anchor
                ? {
                    top: anchor.top,
                    right: anchor.right,
                    width: `min(36rem, calc(100vw - ${anchor.right}px - 1rem))`,
                  }
                : undefined
            }
            className={cn(
              'fixed z-50 flex max-h-[min(34rem,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_12px_32px_-12px_hsl(var(--foreground)/0.28),0_2px_6px_-2px_hsl(var(--foreground)/0.12)]',
              !anchor && 'inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)]',
            )}
          >
            <DialogPrimitive.Title className="sr-only">Search Nkwapa</DialogPrimitive.Title>
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border pl-3 pr-1">
              <Search
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
              />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={listboxId}
                aria-activedescendant={activeId ? optionId(listboxId, activeId) : undefined}
                aria-autocomplete="list"
                aria-label="Search pages, actions, patients and staff"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={placeholderFor(canSearchPatients, canSearchStaff)}
                className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground compact:text-sm"
              />
              {searching ? (
                <Loader2
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                />
              ) : null}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close search" className="shrink-0">
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {statusText}
            </p>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              {groups.length === 0 ? (
                <EmptyMessage query={trimmed} isOnline={isOnline} />
              ) : (
                <div id={listboxId} role="listbox" aria-label="Results">
                  {groups.map((group) => (
                    <div key={group.id} role="group" aria-labelledby={`${listboxId}-${group.id}`}>
                      <div
                        id={`${listboxId}-${group.id}`}
                        className="flex items-center justify-between px-2 pb-1 pt-2.5 text-xs font-medium text-muted-foreground"
                      >
                        {group.label}
                      </div>
                      {group.results.map((result) => (
                        <ResultRow
                          key={result.id}
                          id={optionId(listboxId, result.id)}
                          result={result}
                          active={result.id === activeId}
                          onHover={() => setActiveId(result.id)}
                          onChoose={() => choose(result)}
                        />
                      ))}
                      {group.loading ? (
                        <div aria-hidden="true" className="space-y-1 px-2 py-1">
                          <div className="h-9 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                          <div className="h-9 w-4/5 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                        </div>
                      ) : null}
                      {group.note ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">{group.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
              <span className="hidden items-center gap-3 [@media(pointer:fine)]:flex">
                <span>
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
                </span>
                <span>
                  <Kbd>Enter</Kbd> to open
                </span>
                <span>
                  <Kbd>Esc</Kbd> to close
                </span>
              </span>
              {!trimmed && recent.length ? (
                <button
                  type="button"
                  className="ml-auto inline-flex min-h-8 items-center rounded-sm px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
                  onClick={() => {
                    clearRecent(userId, clinicId);
                    setRecent([]);
                    inputRef.current?.focus();
                  }}
                >
                  Clear recent
                </button>
              ) : (
                <span className="ml-auto">Only what your role can open is shown.</span>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </>
  );
}

function ResultRow({
  id,
  result,
  active,
  onHover,
  onChoose,
}: {
  id: string;
  result: SearchResult;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const Icon = result.icon ?? KIND_ICON[result.kind];
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      // Pointer down keeps focus in the input, so typing continues after a mis-hover.
      onPointerDown={(event) => event.preventDefault()}
      onPointerMove={onHover}
      onClick={onChoose}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 [@media(pointer:fine)]:min-h-10',
        active && 'bg-selected text-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground',
          active && 'border-primary/30 text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{result.title}</span>
        {result.subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
        ) : null}
      </span>
    </div>
  );
}

function EmptyMessage({ query, isOnline }: { query: string; isOnline: boolean }) {
  return (
    <div className="px-3 py-8 text-center">
      <p className="text-sm font-medium">{query ? `Nothing matches “${query}”` : 'Start typing'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? isOnline
            ? 'Try a patient code, part of a name, or a page like “Follow-up”.'
            : 'You are offline: only pages and patients saved on this device can be found.'
          : 'Search pages, actions, patients and staff.'}
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-sm bg-card px-1 font-sans text-[11px] font-medium shadow-[inset_0_0_0_1px_hsl(var(--border))]">
      {children}
    </kbd>
  );
}

function optionId(listboxId: string, resultId: string) {
  return `${listboxId}-${resultId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function placeholderFor(patients: boolean, staff: boolean) {
  if (patients && staff) return 'Search pages, patients, staff…';
  if (patients) return 'Search pages and patients…';
  return 'Search pages and actions…';
}

/** Patients and staff for one query. Offline, patients come from this device's sealed copy. */
async function searchRecords({
  query,
  clinicId,
  isOnline,
  getToken,
  signal,
  patients,
  staff,
}: {
  query: string;
  clinicId: string;
  isOnline: boolean;
  getToken: ReturnType<typeof useAuth>;
  signal: AbortSignal;
  patients: boolean;
  staff: boolean;
}): Promise<Pick<RemoteState, 'patients' | 'staff' | 'offline' | 'error'>> {
  const clinic = encodeURIComponent(clinicId);
  const q = encodeURIComponent(query);
  if (!isOnline) {
    return {
      patients: patients ? await searchDevicePatients(clinicId, query) : [],
      staff: [],
      offline: true,
      error: null,
    };
  }
  const [patientRows, staffRows] = await Promise.all([
    patients
      ? fetchJson<PatientRow[]>(
          `/clinics/${clinic}/patients/search?q=${q}&take=5`,
          getToken,
          signal,
        )
      : Promise.resolve([]),
    staff
      ? fetchJson<{ items: StaffRow[] }>(`/clinics/${clinic}/users/search?q=${q}`, getToken, signal)
          .then((body) => body.items)
          // Staff is a convenience; a failure there must not hide the patients.
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  return {
    patients: patientRows.map((row) => patientResult(row, clinicId)),
    staff: staffRows.map(staffResult),
    offline: false,
    error: null,
  };
}

interface PatientRow {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  lastVisitAt?: string | null;
}

interface StaffRow {
  id: string;
  displayName: string;
  email: string | null;
  roles: string[];
}

async function fetchJson<T>(
  path: string,
  getToken: ReturnType<typeof useAuth>,
  signal: AbortSignal,
) {
  const res = await apiFetch(path, { getToken, signal, timeoutMs: 8000 });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return (await res.json()) as T;
}

function patientResult(row: PatientRow, clinicId: string): SearchResult {
  const lastSeen = row.lastVisitAt
    ? ` · Last seen ${new Date(row.lastVisitAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' })}`
    : '';
  return {
    id: `patient:${row.id}`,
    kind: 'patient',
    title: formatPersonName(row),
    subtitle: `${row.patientCode}${lastSeen}`,
    href: `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(row.id)}`,
  };
}

function staffResult(row: StaffRow): SearchResult {
  const roles = row.roles.map((role) => role.charAt(0) + role.slice(1).toLowerCase()).join(', ');
  return {
    id: `staff:${row.id}`,
    kind: 'staff',
    title: row.displayName,
    subtitle: [roles, row.email].filter(Boolean).join(' · '),
    href: `/admin/users?q=${encodeURIComponent(row.displayName)}`,
  };
}

/**
 * This device's patients for the clinic, matched in memory. The rows are sealed at rest, so an
 * index cannot search them: reading decrypts, and rows whose key is not loaded stay sealed and are
 * skipped.
 */
async function searchDevicePatients(clinicId: string, query: string): Promise<SearchResult[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = await db.patients.where('primaryClinicId').equals(clinicId).toArray();
  const matches: SearchResult[] = [];
  for (const row of rows) {
    if (isSealedRow(row)) continue;
    const haystack = [row.firstName, row.middleName, row.lastName, row.patientCode]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (words.every((word) => haystack.includes(word))) {
      matches.push(patientResult(row as unknown as PatientRow, clinicId));
      if (matches.length === 5) break;
    }
  }
  return matches;
}
