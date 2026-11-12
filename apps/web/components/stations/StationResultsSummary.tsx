'use client';

import { useClinicUnits } from '@/lib/bootstrap-context';
import { formatGlucose, formatHeight, formatWeight } from '@nkwapa/db/measurement-units';

import { classifyBloodPressure } from '@nkwapa/db/bp-classification';
import { isHypoglycemic } from '@nkwapa/db/diabetes-thresholds';
import type { DiabetesScreeningRecord, VitalsRecord } from '@/lib/db';
import { summarizeEyeScreening, type EyeScreeningRecord } from '@/lib/eye-screening';
import { StatusLabel } from '@/components/ui/status-label';
import { formatOpsDateTime } from '@/lib/ops';
import { performerLabel, type StationKind, type StationVisit } from '@/lib/stations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

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
  ruled = false,
  timeline,
  vitals,
  diabetes,
  eye = null,
  timezone,
}: {
  ruled?: boolean;
  timeline: StationVisit[];
  vitals: VitalsRecord | null;
  diabetes: DiabetesScreeningRecord | null;
  eye?: EyeScreeningRecord | null;
  timezone: string;
}) {
  const units = useClinicUnits();
  const recordedAt = (kind: StationKind) => {
    const stop = [...timeline]
      .reverse()
      .find((visit) => visit.station.kind === kind && visit.status !== 'CANCELLED');
    if (!stop) return 'Station not visited';
    if (stop.status === 'SKIPPED') return `Skipped: ${stop.endReason ?? 'no reason given'}`;
    if (stop.status !== 'COMPLETED') return 'In progress';
    const who = stop.completedBy
      ? performerLabel(stop.completedBy.displayName, stop.performedByName)
      : 'unknown';
    return `${who}, ${stop.completedAt ? formatOpsDateTime(stop.completedAt, timezone) : ''}`;
  };

  const bp = classifyBloodPressure(vitals?.systolicBp, vitals?.diastolicBp);
  const bpFlag = bp === 'STAGE1' || bp === 'STAGE2' || bp === 'CRISIS';
  const glucose = diabetes?.glucoseMgDl;
  const glucoseFlag =
    diabetes?.derivedSuspicion === 'SUSPECTED' || (glucose != null && isHypoglycemic(glucose));
  const bmi = vitals?.bmi;
  const bmiFlag = bmi != null && (bmi < 18.5 || bmi >= 25);
  const eyeSummary = summarizeEyeScreening(eye);
  const visitedEye = timeline.some((visit) => visit.station.kind === 'EYE');

  const rows: Array<{
    label: string;
    value: string;
    detail?: React.ReactNode;
    flag: boolean;
    by: string;
  }> = [
    {
      label: 'Blood pressure',
      value:
        vitals?.systolicBp != null && vitals?.diastolicBp != null
          ? `${vitals.systolicBp}/${vitals.diastolicBp} mmHg`
          : 'Not recorded',
      // The stage as its severity tag, so Crisis does not read like Stage 1 in the shared amber box.
      detail: bp !== 'UNKNOWN' ? <StatusLabel value={bp} className="mt-1" /> : undefined,
      flag: bpFlag,
      by: recordedAt('BLOOD_PRESSURE'),
    },
    {
      label: 'Blood glucose',
      value: formatGlucose(glucose, units.glucoseUnit) ?? 'Not recorded',
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
          ? `${formatWeight(vitals?.weightKg, units.bodyUnit) ?? '–'} · ${formatHeight(vitals?.heightCm, units.bodyUnit) ?? '–'}`
          : 'Not recorded',
      detail: bmi != null ? `BMI ${bmi}` : undefined,
      flag: bmiFlag,
      by: recordedAt('ANTHROPOMETRY'),
    },
    // Clinics whose line predates the eye station, or that closed it, show no eye row.
    ...(eyeSummary || visitedEye
      ? [
          {
            label: 'Vision (best per eye)',
            value: eyeSummary
              ? `OD ${eyeSummary.right ?? '–'} · OS ${eyeSummary.left ?? '–'}`
              : 'Not recorded',
            detail: eyeSummary?.detail || undefined,
            flag: eyeSummary?.flag ?? false,
            by: recordedAt('EYE'),
          },
        ]
      : []),
  ];

  return (
    <Card
      className={
        ruled
          ? 'rounded-none border-0 border-t-2 border-rule-strong bg-transparent shadow-none'
          : undefined
      }
    >
      <CardHeader className={ruled ? 'px-0 pb-3 pt-4' : undefined}>
        <CardTitle className="text-xl">Results from today’s stations</CardTitle>
        <CardDescription>
          Medical history recorded at intake: {recordedAt('INTAKE')}. Open the patient’s chart for
          the full history and allergies.
        </CardDescription>
      </CardHeader>
      <CardContent className={ruled ? 'px-0 pb-5' : undefined}>
        {/* Ruled cells, not tiles: tiles nested a box in the card. A flag says so in words, not tint alone. */}
        <dl className="grid gap-x-6 md:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <div key={row.label} className="border-t border-rule py-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 text-lg font-semibold">{row.value}</dd>
              {row.detail ? <dd className="text-sm">{row.detail}</dd> : null}
              {row.flag ? (
                <dd className="inline-flex items-center gap-1 text-sm font-medium text-warning-ink">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Out of range
                </dd>
              ) : null}
              <dd className="mt-2 text-xs text-muted-foreground">Recorded by {row.by}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
