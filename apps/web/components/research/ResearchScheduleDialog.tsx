'use client';

import { useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DESTINATION_LABELS,
  WEEKDAYS,
  describeCadence,
  ordinal,
  type ResearchCadence,
  type ResearchSchedule,
  type ResearchScheduleList,
  type ResearchStorageProvider,
} from '@/lib/research';

export interface ScheduleDraft {
  cadence: ResearchCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  localHour: number;
  coverageStartDate: string;
  destination: ResearchStorageProvider;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, index) => index + 1);

function draftFrom(
  schedule: ResearchSchedule | null,
  context: ResearchScheduleList,
): ScheduleDraft {
  if (schedule) {
    return {
      cadence: schedule.cadence,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      localHour: schedule.localHour,
      coverageStartDate: schedule.coverageStartDate,
      destination: schedule.destination,
    };
  }
  // The year of yesterday, not today: coverage must start before today, and on 1 January
  // the current year's start is today.
  const yearStart = `${new Date(Date.now() - 86_400_000).getUTCFullYear()}-01-01`;
  return {
    cadence: 'MONTHLY',
    dayOfWeek: 1,
    dayOfMonth: 1,
    // Early morning: the day before is closed and the clinic is not using the server.
    localHour: 3,
    coverageStartDate: yearStart,
    destination: context.defaultDestination,
  };
}

/**
 * Create or edit a schedule. The form is keyed by the schedule it edits, so opening it starts
 * from that schedule rather than whatever was typed last time.
 */
export function ResearchScheduleDialog({
  open,
  schedule,
  context,
  onClose,
  onSubmit,
}: {
  open: boolean;
  schedule: ResearchSchedule | null;
  context: ResearchScheduleList;
  onClose: () => void;
  onSubmit: (draft: ScheduleDraft) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto rounded-lg border-border/80">
        {open ? (
          <ScheduleForm
            key={schedule?.id ?? 'new'}
            schedule={schedule}
            context={context}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({
  schedule,
  context,
  onClose,
  onSubmit,
}: {
  schedule: ResearchSchedule | null;
  context: ResearchScheduleList;
  onClose: () => void;
  onSubmit: (draft: ScheduleDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => draftFrom(schedule, context));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const editingApproved = schedule !== null && schedule.status !== 'PENDING_APPROVAL';
  const destinations = context.destinations.length
    ? context.destinations
    : [context.defaultDestination];

  const submit = async () => {
    setBusy(true);
    try {
      if (await onSubmit(draft)) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">
          {schedule ? 'Edit schedule' : 'Schedule research exports'}
        </DialogTitle>
        <DialogDescription>
          Each run covers consented patients from the coverage start through the last full day
          before it runs.
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="scheduleCadence">Repeats</Label>
            <Select
              value={draft.cadence}
              onValueChange={(value: ResearchCadence) => set('cadence', value)}
            >
              <SelectTrigger id="scheduleCadence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {draft.cadence === 'WEEKLY' ? (
            <div className="space-y-2">
              <Label htmlFor="scheduleDay">On</Label>
              <Select
                value={String(draft.dayOfWeek ?? 1)}
                onValueChange={(value) => set('dayOfWeek', Number(value))}
              >
                <SelectTrigger id="scheduleDay">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, index) => (
                    <SelectItem key={day} value={String(index + 1)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="scheduleDay">On the</Label>
              <Select
                value={String(draft.dayOfMonth ?? 1)}
                onValueChange={(value) => set('dayOfMonth', Number(value))}
              >
                <SelectTrigger id="scheduleDay" aria-describedby="scheduleDayHint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_MONTH.map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {ordinal(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="scheduleDayHint" className="text-xs text-muted-foreground">
                Up to the 28th, so February never skips a run.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="scheduleHour">At</Label>
            <Select
              value={String(draft.localHour)}
              onValueChange={(value) => set('localHour', Number(value))}
            >
              <SelectTrigger id="scheduleHour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((hour) => (
                  <SelectItem key={hour} value={String(hour)}>
                    {String(hour).padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduleCoverage">Coverage starts</Label>
            <Input
              id="scheduleCoverage"
              type="date"
              required
              value={draft.coverageStartDate}
              onChange={(event) => set('coverageStartDate', event.target.value)}
            />
          </div>

          {destinations.length > 1 ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="scheduleDestination">Publish to</Label>
              <Select
                value={draft.destination}
                onValueChange={(value: ResearchStorageProvider) => set('destination', value)}
              >
                <SelectTrigger id="scheduleDestination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((destination) => (
                    <SelectItem key={destination} value={destination}>
                      {DESTINATION_LABELS[destination]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm">
          <CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">
              {describeCadence(draft, context.timezone)}
            </p>
            <p className="text-muted-foreground">
              Publishes to {DESTINATION_LABELS[draft.destination]}. A run with fewer than{' '}
              {context.minSubjects} consented patients is skipped, not published.
            </p>
          </div>
        </div>

        {context.approvalRequired ? (
          <InlineNotice tone="info" live={false}>
            {editingApproved
              ? 'Saving a change sends this schedule back to a director for approval. It will not run until it is approved again.'
              : 'A director must approve this schedule before its first run.'}
          </InlineNotice>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !draft.coverageStartDate}>
            {busy ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            {schedule ? 'Save schedule' : 'Create schedule'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
