'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/toast';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useBootstrap } from '@/lib/bootstrap-context';
import { db } from '@/lib/db';
import { formatOpsTime, formatRoleLabel } from '@/lib/ops';
import { cn } from '@/lib/utils';
import {
  STAFF_FEEDBACK_CATEGORIES,
  STAFF_FEEDBACK_MAX_TEXT,
  fetchAppVersion,
  maskRoute,
  queueStaffFeedback,
  type StaffFeedbackCategory,
  type StaffFeedbackContext,
} from '@/lib/staff-feedback';

/** Opens the dialog from anywhere; a station page passes the station it is working. */
export const REPORT_PROBLEM_EVENT = 'nkwapa:report-problem:open';

export interface ReportProblemStation {
  kind: string;
  name: string;
}

export function openReportProblem(station?: ReportProblemStation) {
  window.dispatchEvent(new CustomEvent(REPORT_PROBLEM_EVENT, { detail: { station } }));
}

/**
 * "Report a problem" (#422): what went wrong, in the moment, with where it happened attached.
 * The reporter sees everything that is sent before sending it.
 */
export function ReportProblemDialog() {
  const bootstrapCtx = useBootstrap();
  const clinicId = bootstrapCtx?.activeClinicId ?? null;
  const roles = bootstrapCtx?.bootstrap?.effectiveRolesForActiveClinic ?? [];
  const { isOnline, syncNow } = useSync();

  const [open, setOpen] = useState(false);
  const [station, setStation] = useState<ReportProblemStation | null>(null);
  const [category, setCategory] = useState<StaffFeedbackCategory | null>(null);
  const [text, setText] = useState('');
  const [context, setContext] = useState<Omit<StaffFeedbackContext, 'online'> | null>(null);
  const [busy, setBusy] = useState(false);
  const textId = useId();
  const warningId = useId();
  const legendId = useId();

  const role = roles.map(formatRoleLabel).join(', ') || 'Staff';

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ station?: ReportProblemStation }>).detail;
      setStation(detail?.station ?? null);
      setCategory(null);
      setText('');
      setContext(null);
      setOpen(true);
    };
    window.addEventListener(REPORT_PROBLEM_EVENT, onOpen);
    return () => window.removeEventListener(REPORT_PROBLEM_EVENT, onOpen);
  }, []);

  // Gathered when the dialog opens, so what the reporter reads is what is sent.
  useEffect(() => {
    if (!open || !clinicId) return;
    let current = true;
    void (async () => {
      const [version, outboxSize] = await Promise.all([
        fetchAppVersion(),
        db.outbox.where('clinicId').equals(clinicId).count(),
      ]);
      if (!current) return;
      setContext({
        route: maskRoute(window.location.pathname),
        role,
        version,
        outboxSize,
        occurredAt: new Date().toISOString(),
      });
    })();
    return () => {
      current = false;
    };
  }, [open, clinicId, role]);

  const send = useCallback(async () => {
    if (!clinicId || !category || !context) return;
    setBusy(true);
    try {
      const key = await queueStaffFeedback(db, clinicId, {
        category,
        text,
        stationKind: station?.kind ?? null,
        context: { ...context, online: isOnline, occurredAt: new Date().toISOString() },
      });
      if (isOnline) await syncNow(clinicId).catch(() => undefined);
      const waiting = await db.outbox.where('idempotencyKey').equals(key).count();
      setOpen(false);
      showToast(
        waiting
          ? {
              tone: 'info',
              title: 'Report saved',
              description: 'It will send when you are back online.',
            }
          : {
              tone: 'success',
              title: 'Report sent',
              description: 'Thank you. Your director will see it.',
            },
      );
    } catch {
      showToast({ tone: 'error', title: 'The report could not be saved. Try again.' });
    } finally {
      setBusy(false);
    }
  }, [clinicId, category, context, text, station, isOnline, syncNow]);

  const details: Array<[string, string]> = context
    ? [
        ['Page', context.route],
        ['Station', station?.name ?? 'None'],
        ['Role', context.role],
        ['App version', context.version ?? 'Unknown'],
        ['Connection', isOnline ? 'Online' : 'Offline'],
        [
          'Waiting to sync',
          context.outboxSize === 1 ? '1 change' : `${context.outboxSize} changes`,
        ],
        ['Time', formatOpsTime(context.occurredAt)],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? setOpen(next) : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto rounded-lg border-border/80">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Report a problem</DialogTitle>
          <DialogDescription>
            Tell us what went wrong while it is fresh. Your clinic&apos;s director reads these.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <fieldset aria-labelledby={legendId}>
            <legend id={legendId} className="mb-2 text-sm font-medium">
              What happened?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {STAFF_FEEDBACK_CATEGORIES.map((option) => {
                const checked = category === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex min-h-[var(--button-height)] cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      checked
                        ? 'border-primary bg-selected font-medium'
                        : 'border-input bg-card hover:bg-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name="report-problem-category"
                      value={option.value}
                      checked={checked}
                      onChange={() => setCategory(option.value)}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor={textId}>Describe it (optional)</Label>
            <p id={warningId} className="flex items-start gap-1.5 text-sm text-warning-ink">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Do not type patient names, codes or phone numbers.
            </p>
            <Textarea
              id={textId}
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, STAFF_FEEDBACK_MAX_TEXT))}
              aria-describedby={warningId}
              maxLength={STAFF_FEEDBACK_MAX_TEXT}
              rows={3}
              placeholder="What were you doing, and what did you see?"
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {text.length}/{STAFF_FEEDBACK_MAX_TEXT}
            </p>
          </div>

          <section aria-label="Sent with this report" className="rounded-md bg-muted/60 p-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sent with this report
            </h3>
            {context ? (
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                {details.map(([term, value]) => (
                  <div key={term} className="contents">
                    <dt className="text-muted-foreground">{term}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Gathering details…
              </p>
            )}
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!category || !context}>
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
