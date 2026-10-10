'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { readApiError } from '@/lib/ops';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ScheduledReminder {
  id: string;
  channel: 'SMS' | 'EMAIL';
  status: string;
  failureReason: string | null;
}

/** Today in the browser, `YYYY-MM-DD`, for the date picker's lower bound. */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Schedule a follow-up reminder for this patient (#116).
 *
 * The patient receives the clinic's standard follow-up message, by SMS and email where the chart
 * has them; staff choose only the date. There is no free text, so nothing typed here can reach a
 * patient. Online only: the server checks the chart and the date, and records who scheduled it.
 */
export function ScheduleFollowUpReminderCard({
  clinicId,
  patientId,
}: {
  clinicId: string;
  patientId: string;
}) {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  /** The queued reminders just scheduled here, so a wrong date can be undone straight away. */
  const [justQueued, setJustQueued] = useState<string[]>([]);

  async function undo() {
    if (!getToken || justQueued.length === 0) return;
    setBusy(true);
    try {
      for (const id of justQueued) {
        const response = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/reminders/${encodeURIComponent(id)}/cancel`,
          { method: 'POST', getToken, activeClinicId: clinicId },
        );
        if (!response.ok) throw new Error(await readApiError(response));
      }
      setJustQueued([]);
      setResult({ tone: 'success', text: 'Reminder cancelled. Nothing will be sent.' });
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!getToken || !date) return;
    setBusy(true);
    setResult(null);
    setJustQueued([]);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/reminders/follow-up`,
        {
          method: 'POST',
          getToken,
          activeClinicId: clinicId,
          body: JSON.stringify({ followUpDate: date }),
        },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      const { items } = (await response.json()) as { items: ScheduledReminder[] };
      const queued = items.filter((item) => item.status === 'QUEUED');
      setJustQueued(queued.map((item) => item.id));
      setResult(
        queued.length
          ? {
              tone: 'success',
              text: `Reminder scheduled by ${queued.map((item) => (item.channel === 'SMS' ? 'SMS' : 'email')).join(' and ')}.`,
            }
          : {
              tone: 'warning',
              text: 'Recorded, but this patient has no phone number or email on file, so nothing can be sent. Add one to the chart.',
            },
      );
      setDate('');
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="schedule-follow-up-reminder">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellPlus className="h-5 w-5 text-primary" aria-hidden="true" />
          Follow-up reminder
        </CardTitle>
        <CardDescription>
          Send the patient the clinic&apos;s standard follow-up reminder for a date you choose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="follow-up-reminder-date">Return on</Label>
            <Input
              id="follow-up-reminder-date"
              type="date"
              min={today()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-[200px]"
            />
          </div>
          <Button
            type="button"
            onClick={() => void schedule()}
            disabled={!date || busy || !isOnline}
          >
            {busy ? 'Scheduling…' : 'Schedule reminder'}
          </Button>
        </div>
        {!isOnline ? (
          <p className="text-sm text-muted-foreground">Scheduling a reminder needs a connection.</p>
        ) : null}
        {result ? (
          <InlineNotice tone={result.tone}>
            {result.text}
            {justQueued.length ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-2"
                disabled={busy || !isOnline}
                onClick={() => void undo()}
              >
                Undo
              </Button>
            ) : null}
          </InlineNotice>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Scheduled reminders appear in{' '}
          <Link href="/notifications" className="underline">
            Notifications
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
