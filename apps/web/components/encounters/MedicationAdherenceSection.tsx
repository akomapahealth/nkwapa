'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  MEDICATION_ADHERENCE_LEVELS,
  MEDICATION_ADHERENCE_LEVEL_LABELS,
  MEDICATION_DOSES_MISSED,
  MEDICATION_DOSES_MISSED_LABELS,
  MEDICATION_PROBLEMS,
  MEDICATION_PROBLEM_LABELS,
  MEDICATION_SUPPLY_STATUSES,
  MEDICATION_SUPPLY_STATUS_LABELS,
  NKWAPA_ANSWERS,
  NKWAPA_ANSWER_LABELS,
  ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH,
  isAdherenceEntryAnswered,
  type MedicationAdherenceEntry,
} from '@nkwapa/db';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import {
  ChoiceQuestion,
  MultiChoiceQuestion,
  TextQuestion,
} from '@/components/encounters/hypertension/InterviewQuestion';
import type { AdherenceFieldErrors } from '@/lib/medication-adherence';
import type { MedicationAdherenceContextValue } from '@/lib/medication-adherence';
import type { MedicationRecord } from '@/lib/medication-reconciliation';
import { cn } from '@/lib/utils';

interface MedicationAdherenceSectionProps {
  context: MedicationAdherenceContextValue;
  patientId: string;
  clinicId: string;
  /** Grouped by `Drug.category`, or one undifferentiated list when no category is known. */
  forCondition: readonly MedicationRecord[];
  other: readonly MedicationRecord[];
  categoriesUnavailable: boolean;
  entries: readonly MedicationAdherenceEntry[];
  errors: AdherenceFieldErrors;
  disabled?: boolean;
  reserveErrorSpace?: boolean;
  onChange: (medicationRecordId: string, patch: Partial<MedicationAdherenceEntry>) => void;
  /** Null while the reconciled list is still being read. */
  loading?: boolean;
  loadError?: string | null;
}

const CONDITION_GROUP_LABEL: Record<MedicationAdherenceContextValue, string> = {
  HYPERTENSION: 'Blood-pressure medications',
  DIABETES: 'Diabetes medications',
};

/**
 * The per-medication half of each interview's medication section.
 *
 * The medications are the reconciled patient list and are read-only here -- this section records
 * only what was observed about them at this visit. A volunteer who needs to correct a dose goes to
 * the Medications tab, which is where the medication of record lives; writing a correction here
 * would fill the medication history with non-changes.
 *
 * Both conditions use this component. They ask a different pair of questions -- hypertension asks
 * what was taken today, diabetes asks about the pattern over time -- and the rest is identical, so
 * forking it would be two copies of the same accessibility contract.
 */
export function MedicationAdherenceSection({
  context,
  patientId,
  clinicId,
  forCondition,
  other,
  categoriesUnavailable,
  entries,
  errors,
  disabled,
  reserveErrorSpace,
  onChange,
  loading,
  loadError,
}: MedicationAdherenceSectionProps) {
  const entryByRecordId = useMemo(
    () => new Map(entries.map((entry) => [entry.medicationRecordId, entry])),
    [entries],
  );

  const total = forCondition.length + other.length;
  const answered = entries.filter(isAdherenceEntryAnswered).length;

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading the patient&rsquo;s medications…</p>
    );
  }

  if (loadError) {
    return (
      <InlineNotice tone="warning" live={false}>
        {loadError}
      </InlineNotice>
    );
  }

  if (total === 0) {
    return (
      <InlineNotice tone="info" live={false}>
        No current medications are on this patient&rsquo;s reconciled list, so there is nothing to
        ask about yet.{' '}
        <Link
          href={`/patients/${patientId}?clinicId=${encodeURIComponent(clinicId)}&tab=medications`}
          className="underline underline-offset-4"
        >
          Record medications
        </Link>{' '}
        first.
      </InlineNotice>
    );
  }

  const renderGroup = (label: string, records: readonly MedicationRecord[], note?: string) =>
    records.length ? (
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h4 className="text-sm font-medium">{label}</h4>
          {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
        </div>
        <div className="space-y-3">
          {records.map((record) => (
            <MedicationAdherenceCard
              key={record.id}
              context={context}
              record={record}
              entry={entryByRecordId.get(record.id)}
              errors={errors}
              disabled={disabled}
              reserveErrorSpace={reserveErrorSpace}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4" id={`adherence-section-${context.toLowerCase()}`}>
      {/*
        A running count, because this is the one part of the interview whose length the volunteer
        cannot see from the form. Six medications is six near-identical cards, and "2 of 6" is what
        tells them whether they have worked down the list or lost their place in it.
      */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {answered} of {total} medication{total === 1 ? '' : 's'} recorded
      </p>

      {categoriesUnavailable ? (
        renderGroup(
          'Current medications',
          other,
          'Medication classes are unavailable on this device, so all current medications are listed together.',
        )
      ) : (
        <>
          {renderGroup(CONDITION_GROUP_LABEL[context], forCondition)}
          {renderGroup(
            'Other current medications',
            other,
            'Listed because the catalogue cannot reliably classify every medication.',
          )}
        </>
      )}
    </div>
  );
}

function MedicationAdherenceCard({
  context,
  record,
  entry,
  errors,
  disabled,
  reserveErrorSpace,
  onChange,
}: {
  context: MedicationAdherenceContextValue;
  record: MedicationRecord;
  entry?: MedicationAdherenceEntry;
  errors: AdherenceFieldErrors;
  disabled?: boolean;
  reserveErrorSpace?: boolean;
  onChange: (medicationRecordId: string, patch: Partial<MedicationAdherenceEntry>) => void;
}) {
  if (!entry) return null;

  const revision = record.currentRevision;
  const answered = isAdherenceEntryAnswered(entry);
  const q = (field: string) => ({
    id: `adherence-${record.id}-${field}`,
    error: errors[`${record.id}.${field}`],
    disabled,
    reserveErrorSpace,
  });
  const update = (patch: Partial<MedicationAdherenceEntry>) => onChange(record.id, patch);

  return (
    <section
      className={cn(
        'rounded-lg border p-4 transition-colors',
        answered ? 'border-border' : 'border-dashed',
      )}
      aria-labelledby={`adherence-${record.id}-heading`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 id={`adherence-${record.id}-heading`} className="font-medium leading-tight">
            {revision.medicationName}
          </h5>
          {/*
            The dose is shown and never editable here. It is the medication of record, and the
            answers below are observations about it.
          */}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {describeMedication(record) || 'No dose recorded'}
          </p>
        </div>
        <Badge variant={answered ? 'secondary' : 'outline'} className="shrink-0">
          {answered ? 'Recorded' : 'Not yet asked'}
        </Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {context === 'HYPERTENSION' ? (
          <>
            <ChoiceQuestion
              {...q('tookToday')}
              label="Took it today?"
              value={entry.tookToday}
              onChange={(value) => update({ tookToday: value as never })}
              options={NKWAPA_ANSWERS}
              labels={NKWAPA_ANSWER_LABELS}
            />
            <ChoiceQuestion
              {...q('dosesMissed7d')}
              label="Doses missed in the past 7 days"
              value={entry.dosesMissed7d}
              onChange={(value) => update({ dosesMissed7d: value as never })}
              options={MEDICATION_DOSES_MISSED}
              labels={MEDICATION_DOSES_MISSED_LABELS}
            />
          </>
        ) : (
          <ChoiceQuestion
            {...q('takingAsPrescribed')}
            label="Taking it as prescribed?"
            value={entry.takingAsPrescribed}
            onChange={(value) => update({ takingAsPrescribed: value as never })}
            options={MEDICATION_ADHERENCE_LEVELS}
            labels={MEDICATION_ADHERENCE_LEVEL_LABELS}
          />
        )}
        <ChoiceQuestion
          {...q('supplyRemaining')}
          label="Supply remaining"
          value={entry.supplyRemaining}
          onChange={(value) => update({ supplyRemaining: value as never })}
          options={MEDICATION_SUPPLY_STATUSES}
          labels={MEDICATION_SUPPLY_STATUS_LABELS}
        />
      </div>

      <div className="mt-4 space-y-4">
        <MultiChoiceQuestion
          {...q('problems')}
          label="Any problems taking it?"
          hint="Leave blank if this was not asked. Tick None when it was asked and there are none."
          value={entry.problems}
          onChange={(value) => update({ problems: value as never })}
          options={MEDICATION_PROBLEMS}
          labels={MEDICATION_PROBLEM_LABELS}
          exclusive={['NONE']}
        />
        {entry.problems.includes('OTHER') ? (
          <TextQuestion
            {...q('problemsOther')}
            label="Describe the problem"
            required
            value={entry.problemsOther ?? ''}
            onChange={(value) => update({ problemsOther: value || null })}
            maxLength={ADHERENCE_PROBLEMS_OTHER_MAX_LENGTH}
          />
        ) : null}
      </div>
    </section>
  );
}

/** Dose, route and frequency as one line, skipping whatever the record does not carry. */
function describeMedication(record: MedicationRecord): string {
  const revision = record.currentRevision;
  return [
    revision.strength,
    [revision.dose, revision.doseUnit].filter(Boolean).join(' ') || null,
    revision.route,
    revision.frequency,
  ]
    .filter(Boolean)
    .join(' · ');
}
