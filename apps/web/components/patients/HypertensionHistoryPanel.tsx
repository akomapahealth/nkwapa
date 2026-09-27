'use client';

import { AlertTriangle, HeartPulse } from 'lucide-react';
import {
  HYPERTENSION_ESCALATION_REASON_LABELS,
  HYPERTENSION_REVIEW_REASON_LABELS,
  HYPERTENSION_STATUS_LABELS,
  HYPERTENSION_SYMPTOM_LABELS,
} from '@nkwapa/db';
import { db, type HypertensionAssessmentRecord } from '@/lib/db';
import { HYPERTENSION_LABELS, type HypertensionClassification } from '@/lib/hypertension';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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

/** The subset of the API's hypertension record this history reads. */
export interface HypertensionHistoryItem extends ScreeningHistoryItemBase {
  classification: string | null;
  suspected: boolean;
  confirmed: boolean;
  hypertensionStatus: string | null;
  repeatSystolicBp: number | null;
  repeatDiastolicBp: number | null;
  currentSymptoms: string[];
  urgentReviewRequired: boolean;
  urgentReviewReasons: string[];
  clinicianReviewRequested: boolean;
  reviewReasons: string[];
  notes: string | null;
  author: { id: string; displayName: string } | null;
  todaysVitals: { systolicBp: number | null; diastolicBp: number | null };
}

const COPY: ScreeningHistoryCopy = {
  title: 'Longitudinal hypertension history',
  description:
    'Blood-pressure assessments stay linked to the visit and the reading they classified. Patient-entered home readings stay in Trends.',
  noun: 'hypertension history',
  historyHeading: 'Assessment history',
  previousHeading: 'Previous assessments',
  noCurrentRecord: 'No hypertension assessment has been saved for this encounter.',
  emptyTitle: 'No hypertension assessments yet',
  emptyDescription:
    'A chronological history will appear after staff save hypertension assessments in encounters.',
  offlineDescription:
    'This history could not be refreshed from the server, so it may be missing recent assessments recorded elsewhere.',
};

/** Severity reads the same way here as on the dashboard; not classified is neutral, not a finding. */
const CLASSIFICATION_VARIANT: Record<HypertensionClassification, BadgeProps['variant']> = {
  NORMAL: 'finalized',
  ELEVATED: 'warning',
  STAGE1: 'destructive',
  STAGE2: 'destructive',
  CRISIS: 'destructive',
  UNKNOWN: 'draft',
};

function classificationOf(value: string | null): HypertensionClassification {
  return value && value in HYPERTENSION_LABELS ? (value as HypertensionClassification) : 'UNKNOWN';
}

function labelFrom(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value.replaceAll('_', ' ').toLowerCase();
}

function reading(systolic: number | null, diastolic: number | null): string | null {
  return systolic != null && diastolic != null ? `${systolic}/${diastolic} mmHg` : null;
}

export async function hypertensionFromLocal(
  record: HypertensionAssessmentRecord,
  { encounterStatus }: LocalScreeningContext,
): Promise<HypertensionHistoryItem> {
  // The device holds the visit's vitals too, so an offline history can still show the numbers.
  const vitals = await db.vitals.where('encounterId').equals(record.encounterId).first();
  return {
    id: record.id,
    collectedAt: record.collectedAt ?? record.createdAt ?? new Date().toISOString(),
    sourceEncounter: {
      id: record.encounterId,
      createdAt: record.createdAt ?? new Date().toISOString(),
      status: encounterStatus,
    },
    classification: record.classification ?? null,
    suspected: record.suspected ?? false,
    confirmed: record.confirmed ?? false,
    hypertensionStatus: record.hypertensionStatus ?? null,
    repeatSystolicBp: record.repeatSystolicBp ?? null,
    repeatDiastolicBp: record.repeatDiastolicBp ?? null,
    currentSymptoms: record.currentSymptoms ?? [],
    urgentReviewRequired: record.urgentReviewRequired ?? false,
    urgentReviewReasons: record.urgentReviewReasons ?? [],
    clinicianReviewRequested: record.clinicianReviewRequested ?? false,
    reviewReasons: record.reviewReasons ?? [],
    notes: record.notes ?? null,
    author: null,
    todaysVitals: {
      systolicBp: vitals?.systolicBp ?? null,
      diastolicBp: vitals?.diastolicBp ?? null,
    },
  };
}

export function HypertensionHistoryPanel({
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
  const history = useScreeningHistory<HypertensionHistoryItem, HypertensionAssessmentRecord>({
    clinicId,
    patientId,
    resource: 'hypertension-assessments',
    refreshKey,
    localTable: db.hypertension_assessments,
    fromLocal: hypertensionFromLocal,
    failureMessage: 'Unable to load hypertension history.',
  });

  return (
    <ScreeningHistoryCard
      icon={HeartPulse}
      copy={COPY}
      history={history}
      currentEncounterId={currentEncounterId}
      renderRecord={(item, current) => {
        const classification = classificationOf(item.classification);
        const initial = reading(item.todaysVitals.systolicBp, item.todaysVitals.diastolicBp);
        const repeat = reading(item.repeatSystolicBp, item.repeatDiastolicBp);
        return (
          <ScreeningRecordFrame
            key={item.id}
            clinicId={clinicId}
            item={item}
            author={item.author}
            current={current}
            badges={
              <>
                <Badge variant={CLASSIFICATION_VARIANT[classification]}>
                  {HYPERTENSION_LABELS[classification]}
                </Badge>
                {item.confirmed ? (
                  <Badge variant="outline">Confirmed</Badge>
                ) : item.suspected ? (
                  <Badge variant="outline">Suspected</Badge>
                ) : null}
              </>
            }
          >
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <p className="text-lg font-semibold">{initial ?? 'No reading on the visit'}</p>
              {repeat ? (
                <p className="text-lg font-semibold">
                  <span className="text-sm font-normal text-muted-foreground">Repeat </span>
                  {repeat}
                </p>
              ) : null}
            </div>
            {item.hypertensionStatus ? (
              <p className="text-sm text-muted-foreground">
                {labelFrom(HYPERTENSION_STATUS_LABELS, item.hypertensionStatus)}
              </p>
            ) : null}
            {item.urgentReviewRequired ? (
              <InlineNotice tone="error" live={false}>
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Urgent clinician review
                {item.urgentReviewReasons.length
                  ? `: ${item.urgentReviewReasons
                      .map((reason) => labelFrom(HYPERTENSION_ESCALATION_REASON_LABELS, reason))
                      .join(', ')}`
                  : ''}
              </InlineNotice>
            ) : item.clinicianReviewRequested ? (
              <p className="text-sm">
                <span className="font-medium">Clinician review requested</span>
                {item.reviewReasons.length
                  ? `: ${item.reviewReasons
                      .map((reason) => labelFrom(HYPERTENSION_REVIEW_REASON_LABELS, reason))
                      .join(', ')}`
                  : ''}
              </p>
            ) : null}
            {item.currentSymptoms.length ? (
              <div className="flex flex-wrap gap-2" aria-label="Recorded symptoms">
                {item.currentSymptoms.map((symptom) => (
                  <Badge key={symptom} variant="secondary">
                    {labelFrom(HYPERTENSION_SYMPTOM_LABELS, symptom)}
                  </Badge>
                ))}
              </div>
            ) : null}
            {item.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-6">{item.notes}</p>
            ) : null}
          </ScreeningRecordFrame>
        );
      }}
    />
  );
}
