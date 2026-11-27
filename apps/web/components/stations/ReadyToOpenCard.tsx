'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, MinusCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';
import { fetchClinicReadiness, type ClinicReadiness, type ReadinessState } from '@/lib/stations';
import { readinessRows, readinessText } from '@/lib/readiness';
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { Button } from '@/components/ui/button';

/** Often enough to see a shift start or a device sync before the doors open. */
const POLL_MS = 30_000;

const LOOK: Record<
  ReadinessState,
  { icon: typeof CheckCircle2; tone: 'success' | 'warning' | 'neutral'; word: string }
> = {
  PASS: { icon: CheckCircle2, tone: 'success', word: 'Ready' },
  WARN: { icon: AlertTriangle, tone: 'warning', word: 'Check' },
  NA: { icon: MinusCircle, tone: 'neutral', word: 'Not needed' },
};

/**
 * "Ready to open" (#411): the manager's morning checklist at the top of the station board. Open
 * until the first check-in of the day, then one line that can be reopened.
 */
export function ReadyToOpenCard({
  clinicId,
  clinicName,
}: {
  clinicId: string;
  clinicName: string;
}) {
  const getToken = useAuth();
  const [readiness, setReadiness] = useState<ClinicReadiness | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);
  const { state: copyState, copy } = useCopyToClipboard();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!getToken) return;
      try {
        setReadiness(await fetchClinicReadiness(clinicId, getToken, signal));
      } catch {
        // A missed poll keeps the last answer; the next one tries again.
      }
    },
    [clinicId, getToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  if (!readiness) return null;
  const rows = readinessRows(readiness);
  const applicable = rows.filter((row) => row.state !== 'NA');
  const passing = applicable.filter((row) => row.state === 'PASS').length;
  // Open before the first patient; the manager's own toggle wins after that.
  const expanded = open ?? readiness.checkInsToday === 0;

  return (
    <section aria-labelledby="ready-to-open" className="border-t-2 border-rule-strong pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ready-to-open" className="type-section-title">
          Ready to open
          <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
            {passing} of {applicable.length} checks pass
          </span>
        </h2>
        <div className="flex gap-2">
          {expanded ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copy(readinessText(readiness, clinicName))}
            >
              {copyState === 'copied' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copyState === 'copied' ? 'Copied' : 'Copy checklist'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls="ready-to-open-checks"
            onClick={() => setOpen(!expanded)}
          >
            {expanded ? 'Hide checks' : 'Show checks'}
            <ChevronDown
              className={expanded ? 'h-4 w-4 rotate-180' : 'h-4 w-4'}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {copyState === 'copied'
          ? 'Checklist copied.'
          : copyState === 'failed'
            ? 'Could not copy.'
            : ''}
      </span>
      {expanded ? (
        <ul id="ready-to-open-checks" data-testid="ready-to-open">
          {rows.map((row) => {
            const look = LOOK[row.state];
            return (
              <AppActionRow
                key={row.id}
                icon={look.icon}
                tone={look.tone}
                // The state is said in words, never by colour alone.
                title={`${look.word}: ${row.title}`}
                detail={row.detail}
                action={
                  row.link ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={row.link.href}>{row.link.label}</Link>
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
