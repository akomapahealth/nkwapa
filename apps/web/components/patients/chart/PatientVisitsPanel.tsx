'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  buildEncounterHref,
  fetchPatientChartVisits,
  type ChartVisitRecord,
} from '@/lib/patient-chart';
import { useCursorList } from '@/lib/use-cursor-list';
import { formatOpsDateTime } from '@/lib/ops';
import { ChartLockedBadge, ChartStatusBadge, type ChartState } from './ChartStatusBadge';
import { ChartRecordCard, ChartRecordList } from './ChartRecordList';

const CAPTURE_LABELS: Array<{ key: keyof ChartVisitRecord['recorded']; label: string }> = [
  { key: 'vitals', label: 'Vitals' },
  { key: 'diabetesScreening', label: 'Diabetes screening' },
  { key: 'tobaccoScreening', label: 'Tobacco screening' },
  { key: 'hypertensionAssessment', label: 'Hypertension assessment' },
  { key: 'carePlan', label: 'Care plan' },
];

function CaptureChips({ visit }: { visit: ChartVisitRecord }) {
  const captured = CAPTURE_LABELS.filter(({ key }) => visit.recorded[key] === true).map(
    ({ label }) => label,
  );
  if (visit.recorded.prescriptions > 0) {
    captured.push(
      visit.recorded.prescriptions === 1
        ? '1 prescription'
        : `${visit.recorded.prescriptions} prescriptions`,
    );
  }
  // `noteStatus` is absent entirely for roles without note access, so an undefined
  // check keeps note existence hidden rather than reporting "no note".
  if (visit.recorded.noteStatus !== undefined && visit.recorded.noteStatus !== null) {
    captured.push('Clinical note');
  }

  if (captured.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing was recorded at this visit yet.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {captured.map((label) => (
        <li
          key={label}
          className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

function VisitRecordCard({ visit, clinicId }: { visit: ChartVisitRecord; clinicId: string }) {
  const attribution = [
    visit.createdBy ? `Opened by ${visit.createdBy.displayName}` : null,
    visit.reviewedBy ? `Reviewed by ${visit.reviewedBy.displayName}` : null,
    visit.finalizedBy ? `Finalized by ${visit.finalizedBy.displayName}` : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    <ChartRecordCard
      title={formatOpsDateTime(visit.createdAt)}
      meta={
        <>
          {visit.clinic.name}
          {attribution.length > 0 ? ` · ${attribution.join(' · ')}` : ''}
        </>
      }
      badges={
        <>
          <ChartStatusBadge state={visit.status as ChartState} />
          {visit.recorded.noteStatus ? (
            <ChartStatusBadge state={visit.recorded.noteStatus as ChartState} />
          ) : null}
          {visit.locked ? <ChartLockedBadge /> : null}
        </>
      }
      footer={
        <Link
          href={buildEncounterHref(clinicId, visit.id)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
        >
          Open visit
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      <CaptureChips visit={visit} />
    </ChartRecordCard>
  );
}

export function PatientVisitsPanel({
  clinicId,
  patientId,
}: {
  clinicId: string;
  patientId: string;
}) {
  const fetchPage = useCallback(
    (getToken: Parameters<typeof fetchPatientChartVisits>[2], cursor: string | null) =>
      fetchPatientChartVisits(clinicId, patientId, getToken, cursor),
    [clinicId, patientId],
  );

  const list = useCursorList<ChartVisitRecord>({
    fetchPage,
    resourceKey: `${clinicId}:${patientId}:visits`,
    errorMessage: 'Visit history could not be loaded.',
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Visit history</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Every encounter for this patient, newest first, with what was recorded at each one.
        </p>
      </CardHeader>
      <CardContent>
        <ChartRecordList
          list={list}
          label="Visit history"
          emptyTitle="No visits yet"
          emptyDescription="This patient has not started a clinic encounter yet."
          errorTitle="Visit history could not be loaded"
        >
          {(visit) => <VisitRecordCard visit={visit} clinicId={clinicId} />}
        </ChartRecordList>
      </CardContent>
    </Card>
  );
}
