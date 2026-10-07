'use client';

import { classifyBloodPressure, isHypoglycemic } from '@nkwapa/db';
import type { DiabetesScreeningRecord, VitalsRecord } from '@/lib/db';
import { HYPERTENSION_LABELS } from '@/lib/hypertension';
import { formatOpsDateTime } from '@/lib/ops';
import type { StationKind, StationVisit } from '@/lib/stations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const GLUCOSE_TIMING: Record<string, string> = {
  FASTING: 'fasting',
  BEFORE_MEAL: 'before a meal',
  POST_PRANDIAL_2H: '2 h after a meal',
  RANDOM: 'random',
  UNKNOWN: 'timing not known',
};

/**
 * Every station's results on one screen (#167), each with who recorded it and when, so the review
 * station can interpret them together. Out-of-range values are flagged, not diagnosed.
 */
export function StationResultsSummary({
  timeline,
  vitals,
  diabetes,
  timezone,
}: {
  timeline: StationVisit[];
  vitals: VitalsRecord | null;
  diabetes: DiabetesScreeningRecord | null;
  timezone: string;
}) {
  const recordedAt = (kind: StationKind) => {
    const stop = [...timeline]
      .reverse()
      .find((visit) => visit.station.kind === kind && visit.status !== 'CANCELLED');
    if (!stop) return 'Station not visited';
    if (stop.status === 'SKIPPED') return `Skipped: ${stop.endReason ?? 'no reason given'}`;
    if (stop.status !== 'COMPLETED') return 'In progress';
    const who = stop.completedBy?.displayName ?? 'unknown';
    return `${who}, ${stop.completedAt ? formatOpsDateTime(stop.completedAt, timezone) : ''}`;
  };

  const bp = classifyBloodPressure(vitals?.systolicBp, vitals?.diastolicBp);
  const bpFlag = bp === 'STAGE1' || bp === 'STAGE2' || bp === 'CRISIS';
  const glucose = diabetes?.glucoseMgDl;
  const glucoseFlag =
    diabetes?.derivedSuspicion === 'SUSPECTED' || (glucose != null && isHypoglycemic(glucose));
  const bmi = vitals?.bmi;
  const bmiFlag = bmi != null && (bmi < 18.5 || bmi >= 25);

  const rows: Array<{
    label: string;
    value: string;
    detail?: string;
    flag: boolean;
    by: string;
  }> = [
    {
      label: 'Blood pressure',
      value:
        vitals?.systolicBp != null && vitals?.diastolicBp != null
          ? `${vitals.systolicBp}/${vitals.diastolicBp} mmHg`
          : 'Not recorded',
      detail: bp !== 'UNKNOWN' ? HYPERTENSION_LABELS[bp] : undefined,
      flag: bpFlag,
      by: recordedAt('BLOOD_PRESSURE'),
    },
    {
      label: 'Blood glucose',
      value: glucose != null ? `${glucose} mg/dL` : 'Not recorded',
      detail:
        glucose != null
          ? [
              GLUCOSE_TIMING[diabetes?.glucoseType ?? 'UNKNOWN'],
              isHypoglycemic(glucose)
                ? 'low'
                : diabetes?.derivedSuspicion === 'SUSPECTED'
                  ? 'above screening threshold'
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
      flag: glucoseFlag,
      by: recordedAt('GLUCOSE'),
    },
    {
      label: 'Weight and height',
      value:
        vitals?.weightKg != null || vitals?.heightCm != null
          ? `${vitals?.weightKg ?? '–'} kg · ${vitals?.heightCm ?? '–'} cm`
          : 'Not recorded',
      detail: bmi != null ? `BMI ${bmi}` : undefined,
      flag: bmiFlag,
      by: recordedAt('ANTHROPOMETRY'),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Results from today’s stations</CardTitle>
        <CardDescription>
          Medical history recorded at intake: {recordedAt('INTAKE')}. Open the patient’s chart for
          the full history and allergies.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 md:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn('rounded-lg border p-3', row.flag && 'border-warning/40 bg-warning/10')}
            >
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 text-lg font-semibold">{row.value}</dd>
              {row.detail ? <dd className="text-sm">{row.detail}</dd> : null}
              <dd className="mt-2 text-xs text-muted-foreground">Recorded by {row.by}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
