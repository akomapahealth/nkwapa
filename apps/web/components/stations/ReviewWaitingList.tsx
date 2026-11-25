'use client';

import { ArrowRight } from 'lucide-react';
import { formatGlucose, type GlucoseUnit } from '@nkwapa/db/measurement-units';
import { LONG_WAIT_MINUTES } from '@/components/dashboard/StationLineLanes';
import { DemoBadge } from '@/components/patients/DemoPatientField';
import { DoctorRequestChip } from '@/components/stations/DoctorRequestChip';
import { LineFlagChip } from '@/components/stations/LineFlags';
import { Button } from '@/components/ui/button';
import { useClinicUnits } from '@/lib/bootstrap-context';
import { dayNumberLabel } from '@/lib/ops';
import {
  minutesSince,
  patientName,
  sortReviewQueue,
  type KeyReadings,
  type StationVisit,
} from '@/lib/stations';
import { cn } from '@/lib/utils';

/** "BP 182/110 · Glucose 7.2 mmol/L · BMI 27.4", with a dash for anything not taken yet. */
export function keyReadingsLine(readings: KeyReadings | undefined, glucoseUnit: GlucoseUnit) {
  const bp = readings?.bp ? `${readings.bp.systolic}/${readings.bp.diastolic}` : '–';
  const glucose = formatGlucose(readings?.glucose?.mgDl, glucoseUnit) ?? '–';
  const bmi = readings?.bmi != null ? readings.bmi.toFixed(1) : '–';
  return `BP ${bp} · Glucose ${glucose} · BMI ${bmi}`;
}

/**
 * Who is here and waiting for a doctor at review, most urgent first (#419). Only patients not yet
 * taken; "Take patient" claims the review visit and opens it, through the caller's handler.
 */
export function ReviewWaitingList({
  visits,
  canTake,
  busyId,
  onTake,
  className,
}: {
  visits: readonly StationVisit[];
  canTake: boolean;
  busyId: string | null;
  onTake: (visit: StationVisit) => void;
  className?: string;
}) {
  const { glucoseUnit } = useClinicUnits();
  const waiting = sortReviewQueue(visits.filter((visit) => visit.status === 'QUEUED'));
  return (
    <section
      aria-labelledby="review-waiting-title"
      data-testid="review-waiting-list"
      className={cn('min-w-0', className)}
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
        <h2 id="review-waiting-title" className="text-lg font-semibold">
          Waiting for review
        </h2>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Most urgent first
        </span>
      </div>
      {waiting.length ? (
        <ol>
          {waiting.map((visit) => {
            const minutes = minutesSince(visit.queuedAt);
            const long = minutes > LONG_WAIT_MINUTES;
            const name = patientName(visit.patient);
            // On a phone the button sits under the readings, so they keep the row's width.
            const take = (className: string) => (
              <Button
                size="sm"
                onClick={() => onTake(visit)}
                disabled={!canTake}
                aria-label={busyId === visit.id ? undefined : `Take patient ${name}`}
                className={className}
              >
                {busyId === visit.id ? 'Taking…' : 'Take patient'}
                <ArrowRight aria-hidden="true" />
              </Button>
            );
            return (
              <li
                key={visit.id}
                data-testid="review-waiting-row"
                className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-border px-2 py-3"
              >
                <span
                  className="whitespace-nowrap font-mono text-base font-semibold tabular-nums"
                  translate="no"
                >
                  {visit.dayNumber ? (
                    dayNumberLabel(visit.dayNumber)
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">
                      Number on sync
                    </span>
                  )}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-semibold">{name}</p>
                  <DemoBadge isDemo={visit.patient.isDemo} />
                  <div className="flex flex-wrap gap-1.5">
                    <DoctorRequestChip request={visit.doctorRequest} />
                    <LineFlagChip flags={visit.lineFlags} />
                  </div>
                  <p className="break-words text-sm tabular-nums text-muted-foreground">
                    {keyReadingsLine(visit.keyReadings, glucoseUnit)}
                  </p>
                  {take('mt-1 compact:hidden')}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={cn('text-sm tabular-nums', long && 'font-semibold text-warning-ink')}
                  >
                    {minutes} min
                  </span>
                  {take('hidden compact:inline-flex')}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">Nobody is waiting for review.</p>
      )}
    </section>
  );
}
