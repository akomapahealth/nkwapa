'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowUpRight, HeartPulse } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PatientTrendsPanel } from '@/components/patients/PatientTrendsPanel';
import {
  buildEncounterHref,
  fetchPatientChartVitals,
  type ChartVitalsRecord,
} from '@/lib/patient-chart';
import { useCursorList } from '@/lib/use-cursor-list';
import { formatOpsDateTime } from '@/lib/ops';
import { ChartLockedBadge, ChartStatusBadge } from './ChartStatusBadge';
import { ChartMeasurement, ChartRecordCard, ChartRecordList } from './ChartRecordList';

function formatBloodPressure(record: ChartVitalsRecord): string | null {
  if (record.systolicBp === null || record.diastolicBp === null) return null;
  return `${record.systolicBp}/${record.diastolicBp}`;
}

function VitalsRecordCard({ record, clinicId }: { record: ChartVitalsRecord; clinicId: string }) {
  const bloodPressure = formatBloodPressure(record);
  return (
    <ChartRecordCard
      title={bloodPressure ? `Blood pressure ${bloodPressure} mmHg` : 'Measurements recorded'}
      meta={
        <>
          {formatOpsDateTime(record.recordedAt)}
          {record.recordedBy ? ` · ${record.recordedBy.displayName}` : ''}
          {` · ${record.clinic.name}`}
        </>
      }
      badges={
        <>
          <ChartStatusBadge state={record.encounterStatus} />
          {record.locked ? <ChartLockedBadge /> : null}
        </>
      }
      footer={
        <Link
          href={buildEncounterHref(clinicId, record.encounterId)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
        >
          Open source visit
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <ChartMeasurement label="Pulse" value={record.pulseBpm} suffix=" bpm" />
        <ChartMeasurement label="Temperature" value={record.temperatureCelsius} suffix=" °C" />
        <ChartMeasurement label="Respiratory rate" value={record.respiratoryRate} suffix="/min" />
        <ChartMeasurement label="SpO₂" value={record.spo2Percent} suffix="%" />
        <ChartMeasurement label="Weight" value={record.weightKg} suffix=" kg" />
        <ChartMeasurement label="Height" value={record.heightCm} suffix=" cm" />
        <ChartMeasurement label="BMI" value={record.bmi} />
      </dl>
      {record.notes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{record.notes}</p>
      ) : null}
    </ChartRecordCard>
  );
}

export function PatientVitalsPanel({
  clinicId,
  patientId,
}: {
  clinicId: string;
  patientId: string;
}) {
  const fetchPage = useCallback(
    (getToken: Parameters<typeof fetchPatientChartVitals>[2], cursor: string | null) =>
      fetchPatientChartVitals(clinicId, patientId, getToken, cursor),
    [clinicId, patientId],
  );

  const list = useCursorList<ChartVitalsRecord>({
    fetchPage,
    resourceKey: `${clinicId}:${patientId}:vitals`,
    errorMessage: 'Vitals history could not be loaded.',
  });

  return (
    <div className="space-y-4">
      <PatientTrendsPanel clinicId={clinicId} patientId={patientId} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Recorded vitals</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every measurement set in reverse chronological order, linked to the visit it was
            recorded at.
          </p>
        </CardHeader>
        <CardContent>
          <ChartRecordList
            list={list}
            label="Recorded vitals history"
            emptyTitle="No vitals recorded yet"
            emptyDescription="Measurements captured during a visit will appear here."
            errorTitle="Vitals history could not be loaded"
          >
            {(record) => <VitalsRecordCard record={record} clinicId={clinicId} />}
          </ChartRecordList>
        </CardContent>
      </Card>
    </div>
  );
}
