'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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
const colors: Record<State, string> = {
  operational: 'bg-emerald-600',
  degraded: 'bg-amber-500',
  outage: 'bg-red-600',
};
const stateLabels: Record<State, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
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

export function StatusPanel({ releaseVersion }: { releaseVersion?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Once on load and again when the panel opens, never on a timer: each check runs a database
  // query, and polling from an open tab kept the free API and Neon from ever sleeping (#172).
  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
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
  const dot = status ? colors[status.status] : unreachable ? colors.outage : 'bg-muted-foreground';
  return (
    <details
      className="group relative text-sm"
      onToggle={(event) => {
        if (event.currentTarget.open) void refresh();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm text-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <span>System status: {message}</span>
        <span
          aria-hidden="true"
          className="ml-1 text-muted-foreground group-open:rotate-180 motion-reduce:transition-none"
        >
          ⌄
        </span>
      </summary>
      <div className="absolute bottom-full left-0 z-40 mb-2 w-[min(90vw,24rem)] rounded-lg border border-border bg-background p-4 text-foreground shadow-lg sm:left-auto sm:right-0">
        <h2 className="font-heading text-base font-semibold">System status</h2>
        <p className="mt-1 text-muted-foreground">
          {message}
          {status ? ` · Checked ${new Date(status.checkedAt).toLocaleString()}` : ''}
        </p>
        {releaseVersion ? (
          <p className="mt-1 text-muted-foreground">Latest release: v{releaseVersion}</p>
        ) : null}
        {status ? (
          <ul className="mt-3 space-y-2">
            {status.components.map((item) => (
              <li key={item.name}>
                <div className="flex items-center justify-between gap-3">
                  <span>{labels[item.name] ?? item.name}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${colors[item.state]}`}
                    />
                    {stateLabels[item.state]}
                  </span>
                </div>
                {item.state !== 'operational' ? (
                  <p className="text-xs text-muted-foreground">
                    {reasonLabels[item.reason] ?? item.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : unreachable ? (
          <p className="mt-3">The API could not be reached. Try again shortly.</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3">
          <button
            type="button"
            className="min-h-11 font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report(status, message, releaseVersion));
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            Copy report
          </button>
          <Link
            href="/login?next=%2Fstatus"
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in for details
          </Link>
        </div>
        <span aria-live="polite" className="sr-only">
          {copied ? 'Report copied' : ''}
        </span>
      </div>
    </details>
  );
}
