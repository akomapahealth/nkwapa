'use client';

import { AlertTriangle, Droplets } from 'lucide-react';
import { DIABETES_SYMPTOM_LABELS, type DiabetesSymptom } from '@nkwapa/db';
import { db, type DiabetesScreeningRecord } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { InlineNotice } from '@/components/ops/OpsShared';
import {
  ScreeningHistoryCard,
  ScreeningRecordFrame,
  type ScreeningHistoryCopy,
} from '@/components/patients/ScreeningHistoryCard';
import {
  useScreeningHistory,
  type LocalScreeningContext,
  type ScreeningHistoryItemBase,
} from '@/lib/use-screening-history';

interface DiabetesHistoryItem extends ScreeningHistoryItemBase {
  clinicId: string;
  patientId: string;
  glucoseMgDl: number | null;
  glucoseType: 'FASTING' | 'RANDOM' | 'UNKNOWN';
  hba1cPercent: number | null;
  symptoms: DiabetesSymptom[];
  notes: string | null;
  author: { id: string; displayName: string } | null;
  legacySymptomsUnmapped: boolean;
  isEditable: boolean;
}

const COPY: ScreeningHistoryCopy = {
  title: 'Longitudinal diabetes history',
  description:
    'Staff-recorded screenings remain linked to their source visits. Patient-entered portal measurements are unchanged and stay in Trends.',
  noun: 'diabetes history',
  historyHeading: 'Screening history',
  previousHeading: 'Previous screenings',
  noCurrentRecord: 'No diabetes screening has been saved for this encounter.',
  emptyTitle: 'No previous diabetes screenings',
  emptyDescription:
    'A chronological history will appear after staff save screenings in encounters.',
  offlineDescription:
    'This history could not be refreshed from the server, so it may be missing recent screenings recorded elsewhere.',
};

function contextLabel(value: DiabetesHistoryItem['glucoseType']): string {
  if (value === 'FASTING') return 'Fasting';
  if (value === 'RANDOM') return 'Random';
  return 'Unknown / not documented';
}

function fromLocal(
  record: DiabetesScreeningRecord,
  { encounterStatus }: LocalScreeningContext,
): DiabetesHistoryItem {
  return {
    id: record.id,
    clinicId: record.clinicId,
    patientId: '',
    glucoseMgDl: record.glucoseMgDl ?? null,
    glucoseType: (record.glucoseType as DiabetesHistoryItem['glucoseType']) ?? 'UNKNOWN',
    hba1cPercent: record.hba1cPercent ?? null,
    symptoms: record.symptoms ?? [],
    notes: record.notes ?? null,
    collectedAt: record.collectedAt ?? record.createdAt ?? new Date().toISOString(),
    author: record.authoredBy ?? null,
    sourceEncounter: {
      id: record.encounterId,
      createdAt: record.createdAt ?? new Date().toISOString(),
      status: record.encounterStatus ?? encounterStatus,
    },
    legacySymptomsUnmapped: record.legacySymptomsUnmapped ?? false,
    isEditable: encounterStatus !== 'FINALIZED',
  };
}

export function DiabetesHistoryPanel({
  clinicId,
  patientId,
  currentEncounterId,
  refreshKey,
}: {
  clinicId: string;
  patientId: string;
  currentEncounterId?: string;
  /** See `useScreeningHistory`. */
  refreshKey?: string | number | null;
}) {
  const history = useScreeningHistory<DiabetesHistoryItem, DiabetesScreeningRecord>({
    clinicId,
    patientId,
    resource: 'diabetes-screenings',
    refreshKey,
    localTable: db.diabetes_screenings,
    fromLocal,
    failureMessage: 'Unable to load diabetes history.',
  });

  return (
    <ScreeningHistoryCard
      icon={Droplets}
      copy={COPY}
      history={history}
      currentEncounterId={currentEncounterId}
      renderRecord={(item, current) => (
        <ScreeningRecordFrame
          key={item.id}
          clinicId={clinicId}
          item={item}
          author={item.author}
          current={current}
          badges={<Badge variant="outline">{contextLabel(item.glucoseType)}</Badge>}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <p className="text-lg font-semibold">
              {item.glucoseMgDl == null ? 'No glucose value' : `${item.glucoseMgDl} mg/dL`}
            </p>
            <p className="text-lg font-semibold">
              {item.hba1cPercent == null ? 'No HbA1c value' : `HbA1c ${item.hba1cPercent}%`}
            </p>
          </div>
          {item.symptoms.length ? (
            <div className="flex flex-wrap gap-2" aria-label="Recorded symptoms">
              {item.symptoms.map((symptom) => (
                <Badge key={symptom} variant="secondary">
                  {DIABETES_SYMPTOM_LABELS[symptom]}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No symptoms selected.</p>
          )}
          {item.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-6">{item.notes}</p>
          ) : null}
          {item.legacySymptomsUnmapped ? (
            <InlineNotice tone="info">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Some legacy symptom content could not be mapped. The original content is preserved.
            </InlineNotice>
          ) : null}
        </ScreeningRecordFrame>
      )}
    />
  );
}
