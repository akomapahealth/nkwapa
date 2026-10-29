'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL, CONTACT_HREF } from './links';

type State = 'operational' | 'degraded' | 'outage';
interface Component {
  name: string;
  state: State;
  latencyMs: number;
  checkedAt: string;
  reason: string;
}
interface Status {
  status: State;
  checkedAt: string;
  components: Component[];
}

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const labels: Record<string, string> = {
  database: 'Database',
  redis: 'Redis',
  queues: 'Background jobs',
  email: 'Email',
  auth: 'Sign in',
  web: 'Website',
};
// What each part does for a clinic, so a reader knows what a problem would affect.
const descriptions: Record<string, string> = {
  database: 'Patient records, visits and clinic data',
  redis: 'Short-lived data behind live updates and job queues',
  queues: 'Reminders, exports and account updates',
  email: 'Invites, reminders and roster emails',
  auth: 'Staff and patient sign in',
  web: 'This website, on the same version as the API',
};
const stateLabels: Record<State, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
};
const headlines: Record<State, string> = {
  operational: 'All systems operational',
  degraded: 'Some systems are degraded',
  outage: 'Major outage',
};
const summaries: Record<State, string> = {
  operational: 'Nkwapa is working normally.',
  degraded: 'Nkwapa is up, but some parts are slow or limited. Records you save are kept.',
  outage: 'A part Nkwapa needs is down. Saving or signing in may not work until it recovers.',
};
const dots: Record<State, string> = {
  operational: 'bg-success',
  degraded: 'bg-warning',
  outage: 'bg-destructive',
};
const tones: Record<State, { icon: typeof CheckCircle2; ink: string; panel: string }> = {
  operational: {
    icon: CheckCircle2,
    ink: 'text-success-ink',
    panel: 'border-success/30 bg-success/10',
  },
  degraded: {
    icon: AlertTriangle,
    ink: 'text-warning-ink',
    panel: 'border-warning/40 bg-warning/10',
  },
  outage: {
    icon: XCircle,
    ink: 'text-destructive-ink',
    panel: 'border-destructive/30 bg-destructive/10',
  },
};
const reasonLabels: Record<string, string> = {
  SLOW: 'Slow to respond',
  TIMEOUT: 'Timed out',
  UNAVAILABLE: 'Unreachable',
  STALE_JOBS: 'Jobs are waiting too long',
  RECENT_FAILURES: 'A job failed in the last few minutes',
  NOT_CONFIGURED: 'Not configured',
  FAKE_PROVIDER: 'Not sending: test provider',
  SEND_FAILED: 'The last send failed',
  VERSION_MISMATCH: 'Half-deployed: website and API versions differ',
};
// A cold free-tier API can take most of a minute to wake; say so instead of spinning.
const TIMEOUT_MS = 10_000;

function report(status: Status | null, message: string, releaseVersion?: string): string {
  const lines = [
    '# Nkwapa system status',
    '',
    `Overall: ${message}`,
    `Checked: ${status ? status.checkedAt : new Date().toISOString()}`,
    ...(releaseVersion ? [`Latest release: v${releaseVersion}`] : []),
    '',
    '| Component | State | Reason | Latency |',
    '| --- | --- | --- | ---: |',
  ];
  for (const item of status?.components ?? []) {
    lines.push(
      `| ${labels[item.name] ?? item.name} | ${stateLabels[item.state]} | ${item.reason} | ${item.latencyMs} ms |`,
    );
  }
  return lines.join('\n');
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StatusPanel({ releaseVersion }: { releaseVersion?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Once on load, on open, and on Refresh, never on a timer: each check runs a database query,
  // and polling from an open tab kept the free API and Neon from ever sleeping (#172).
  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    setChecking(true);
    try {
      const response = await fetch(`${API}/status`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Status request failed');
      const data = (await response.json()) as Status;
      if (!Array.isArray(data.components)) throw new Error('Invalid status response');
      setStatus(data);
      setUnreachable(false);
    } catch (error) {
      if (timedOut || (error as Error).name !== 'AbortError') {
        setStatus(null);
        setUnreachable(true);
      }
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  const message = status
    ? stateLabels[status.status]
    : unreachable
      ? 'API unreachable'
      : 'Checking system status';
  const dot = status ? dots[status.status] : unreachable ? dots.outage : 'bg-muted-foreground';
  const overall: State | null = status ? status.status : unreachable ? 'outage' : null;
  const tone = overall ? tones[overall] : null;
  const OverallIcon = tone?.icon ?? Loader2;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setCopied(false);
          void refresh();
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          data-status-trigger
          className="flex min-h-11 items-center gap-2 rounded-sm text-sm text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} />
          <span>System status: {message}</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-xl gap-0 p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 pb-5 pt-6">
          <div>
            <DialogTitle className="font-heading text-xl font-semibold">System status</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
              Live health of the services behind Nkwapa
              {releaseVersion ? ` · Release v${releaseVersion}` : ''}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </DialogClose>
        </div>

        <div className="px-6 py-5">
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4',
              tone ? tone.panel : 'border-border bg-muted',
            )}
          >
            <OverallIcon
              aria-hidden
              className={cn(
                'mt-0.5 h-5 w-5 shrink-0',
                tone ? tone.ink : 'text-muted-foreground motion-safe:animate-spin',
              )}
            />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {status
                  ? headlines[status.status]
                  : unreachable
                    ? 'The API could not be reached.'
                    : 'Checking system status…'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {status
                  ? summaries[status.status]
                  : unreachable
                    ? 'The server may be starting up after a quiet period, which can take up to a minute. Try again shortly.'
                    : 'This usually takes a few seconds.'}
              </p>
            </div>
          </div>

          {status ? (
            <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
              {status.components.map((item) => {
                const itemTone = tones[item.state];
                const Icon = itemTone.icon;
                return (
                  <li key={item.name} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {labels[item.name] ?? item.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.state === 'operational'
                          ? (descriptions[item.name] ?? '')
                          : (reasonLabels[item.reason] ?? item.reason)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
                      <span className={cn('flex items-center gap-1.5 font-medium', itemTone.ink)}>
                        <Icon aria-hidden className="h-4 w-4" />
                        {stateLabels[item.state]}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {item.latencyMs} ms
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <p className="mt-4 text-xs text-muted-foreground">
            {status ? `Checked ${formatTime(status.checkedAt)}. ` : ''}
            Results can be up to 30 seconds old. If something is not working during a clinic, write
            to{' '}
            <a
              href={CONTACT_HREF}
              className="rounded-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-6 py-3 text-sm">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={checking}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground"
          >
            <RefreshCw
              aria-hidden
              className={cn('h-4 w-4', checking && 'motion-safe:animate-spin')}
            />
            {checking ? 'Checking…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report(status, message, releaseVersion));
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy aria-hidden className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy report'}
          </button>
          <Link
            href="/login?next=%2Fstatus"
            className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-auto"
          >
            Sign in for details
          </Link>
          <span aria-live="polite" className="sr-only">
            {copied ? 'Report copied' : ''}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
