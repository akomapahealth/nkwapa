'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GetToken } from '@/lib/api';
import {
  PRACTICE_COUNT_MAX,
  PRACTICE_COUNT_MIN,
  addPracticePatients,
  clearPractice,
  describePracticeClear,
  fetchPracticeSummary,
  practiceCountValue,
  practiceIsClear,
  type PracticeSummary,
} from '@/lib/stations';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { confirmAction } from '@/components/ui/confirm-dialog';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionHeader as CardHeader,
  RecordSectionTitle as CardTitle,
} from '@/components/patients/RecordSection';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Practice before a screening day (#410): a director fills the line with demo patients, every
 * volunteer takes one through a station, and the director clears them again. Shown only to
 * holders of PATIENT.DEMO.MANAGE.
 */
export function PracticeSession({
  clinicId,
  getToken,
  firstStationName,
}: {
  clinicId: string;
  getToken: GetToken;
  /** The first open station, where checked-in demo patients wait. */
  firstStationName: string | null;
}) {
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [count, setCount] = useState('10');
  const [checkIn, setCheckIn] = useState(true);
  const [busy, setBusy] = useState<'add' | 'clear' | null>(null);
  const [message, setMessage] = useState<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  // A second tap before React re-renders the disabled button still lands; this ref does not.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchPracticeSummary(clinicId, getToken);
      setSummary(next);
      setSummaryFailed(false);
      return next;
    } catch (failure) {
      setSummaryFailed(true);
      throw failure;
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const run = async (kind: 'add' | 'clear', action: () => Promise<string | null>) => {
    if (inFlight.current) {
      setMessage({ tone: 'info', text: 'Wait for the last change to finish, then try again.' });
      return;
    }
    inFlight.current = true;
    setBusy(kind);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ tone: 'success', text: done });
    } catch (failure) {
      setMessage({
        tone: 'error',
        text: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      await load().catch(() => {});
      inFlight.current = false;
      setBusy(null);
    }
  };

  const countValue = practiceCountValue(count);
  const where = firstStationName ?? 'the first station';

  const add = () =>
    run('add', async () => {
      if (countValue === null) return null;
      const result = await addPracticePatients(clinicId, { count: countValue, checkIn }, getToken);
      const added = `Added ${plural(result.created, 'demo patient')}.`;
      if (result.checkedIn === 0) return `${added} Check them in from the patient list.`;
      return result.queuedAtStation
        ? `${added} They are waiting at ${result.queuedAtStation}.`
        : `${added} They are checked in. Open a station so they can join the line.`;
    });

  /** Counts again, then asks. Holds the in-flight flag meanwhile, so Add cannot run under it. */
  const confirmClear = async (): Promise<boolean> => {
    let current: PracticeSummary;
    try {
      current = await load();
    } catch (failure) {
      setMessage({
        tone: 'error',
        text: failure instanceof Error ? failure.message : String(failure),
      });
      return false;
    }
    if (practiceIsClear(current)) {
      setMessage({ tone: 'info', text: 'Nothing to clear.' });
      return false;
    }
    return confirmAction({
      title: 'Clear the practice session?',
      description: describePracticeClear(current),
      confirmLabel: 'Clear practice',
      cancelLabel: 'Keep practising',
    });
  };

  const clear = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage(null);
    let confirmed = false;
    try {
      confirmed = await confirmClear();
    } finally {
      inFlight.current = false;
    }
    if (!confirmed) return;
    await run('clear', async () => {
      const result = await clearPractice(clinicId, getToken);
      const parts = [
        result.cancelledCheckIns > 0 &&
          `${plural(result.cancelledCheckIns, 'demo patient')} taken out of the line`,
        result.deletedDrafts > 0 && `${plural(result.deletedDrafts, 'unfinished visit')} deleted`,
      ].filter(Boolean);
      return parts.length > 0 ? `Practice cleared: ${parts.join(', ')}.` : 'Practice cleared.';
    });
  };

  const inLine = summary?.openCheckIns ?? 0;

  return (
    <Card data-testid="practice-session">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Practice session</CardTitle>
        <p className="max-w-prose text-sm text-muted-foreground">
          Fill the line with demo patients so every volunteer can take one through a station before
          real patients arrive. Demo patients carry a Demo tag and never count in reports.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <InlineNotice tone={message.tone}>{message.text}</InlineNotice> : null}

        <form
          className="flex flex-wrap items-end gap-x-4 gap-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="order-1 w-28 space-y-1">
            <Label htmlFor="practice-count">Demo patients</Label>
            <Input
              id="practice-count"
              type="number"
              inputMode="numeric"
              min={PRACTICE_COUNT_MIN}
              max={PRACTICE_COUNT_MAX}
              value={count}
              aria-invalid={countValue === null}
              aria-describedby="practice-count-hint"
              onChange={(event) => setCount(event.target.value)}
            />
          </div>
          <div className="order-3 flex min-h-10 items-center gap-2 sm:order-2">
            <Checkbox
              id="practice-check-in"
              checked={checkIn}
              onCheckedChange={(checked) => setCheckIn(checked === true)}
            />
            <Label htmlFor="practice-check-in">Check them in at {where}</Label>
          </div>
          <Button
            type="submit"
            className="order-4 sm:order-3"
            disabled={countValue === null || busy !== null}
          >
            {busy === 'add' ? 'Adding…' : 'Add demo patients'}
          </Button>
          <p
            id="practice-count-hint"
            className={
              countValue === null
                ? 'order-2 basis-full text-sm text-destructive sm:order-4'
                : 'order-2 basis-full text-sm text-muted-foreground sm:order-4'
            }
          >
            {countValue === null
              ? `Enter a whole number from ${PRACTICE_COUNT_MIN} to ${PRACTICE_COUNT_MAX}.`
              : `From ${PRACTICE_COUNT_MIN} to ${PRACTICE_COUNT_MAX} at a time.`}
          </p>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm" data-testid="practice-summary">
            {summaryFailed
              ? 'Could not count demo patients. Check the connection and try again.'
              : summary === null
                ? 'Counting demo patients…'
                : practiceIsClear(summary)
                  ? 'No demo patients to clear.'
                  : summary.charts > 0
                    ? `${plural(summary.charts, 'demo patient')} to clear` +
                      (inLine > 0 ? `, ${inLine} still in the line.` : '.')
                    : 'Demo patients from an earlier practice are still in the line.'}
          </p>
          <Button
            variant="outline"
            // Never disabled for an empty session: that would drop keyboard focus after a clear.
            disabled={busy !== null}
            onClick={() => void clear()}
          >
            {busy === 'clear' ? 'Clearing…' : 'Clear practice'}
          </Button>
        </div>

        <ProgressiveHelp title="Practice script">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Everyone starts a shift and chooses their station.</li>
            <li>
              At {where}, take demo patient 1, register them and send them on to the next station.
            </li>
            <li>At blood pressure, take them and record three readings, then send them on.</li>
            <li>Do the same at glucose, measurements and eye.</li>
            <li>At review, a doctor opens the visit and completes it.</li>
            <li>End your shift, then sign out. They are two separate buttons.</li>
          </ol>
          <p className="mt-3">
            Swap stations until everyone has done each step once, then clear the practice.
          </p>
        </ProgressiveHelp>
      </CardContent>
    </Card>
  );
}
