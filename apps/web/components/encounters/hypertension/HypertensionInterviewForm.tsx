'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALCOHOL_USE_STATUSES,
  ALCOHOL_USE_STATUS_LABELS,
  FREQUENCY_NEVER_SOMETIMES_DAILY,
  FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS,
  FREQUENCY_NEVER_SOMETIMES_OFTEN,
  FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS,
  FREQUENCY_NEVER_SOMETIMES_USUALLY,
  FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS,
  FREQUENCY_RARELY_SOME_MOST,
  FREQUENCY_RARELY_SOME_MOST_LABELS,
  MEDICATION_REMINDER_STRATEGIES,
  MEDICATION_REMINDER_STRATEGY_LABELS,
  MEDICATION_USE_STATUSES,
  MEDICATION_USE_STATUS_LABELS,
  NKWAPA_ANSWERS,
  NKWAPA_ANSWER_LABELS,
  SCREENING_COMPLETION_STATUSES,
  SCREENING_COMPLETION_STATUS_LABELS,
} from '@nkwapa/db/clinical-vocabulary';
import {
  BP_AFFECTING_SUBSTANCES,
  BP_AFFECTING_SUBSTANCE_LABELS,
  BP_REPEAT_STATUSES,
  BP_REPEAT_STATUS_LABELS,
  CARDIOMETABOLIC_CONDITIONS,
  CARDIOMETABOLIC_CONDITION_LABELS,
  FACILITY_KNOWN_STATUSES,
  FACILITY_KNOWN_STATUS_LABELS,
  HOME_BP_CHECK_FREQUENCIES,
  HOME_BP_CHECK_FREQUENCY_LABELS,
  HOME_BP_MONITOR_STATUSES,
  HOME_BP_MONITOR_STATUS_LABELS,
  HOME_BP_SOURCES,
  HOME_BP_SOURCE_LABELS,
  HYPERTENSION_CLINICIAN_PLAN_ITEMS,
  HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS,
  HYPERTENSION_CONCERNS,
  HYPERTENSION_CONCERN_LABELS,
  HYPERTENSION_ESCALATION_REASON_LABELS,
  HYPERTENSION_REVIEW_REASONS,
  HYPERTENSION_REVIEW_REASON_LABELS,
  HYPERTENSION_STATUSES,
  HYPERTENSION_STATUS_LABELS,
  HYPERTENSION_SYMPTOMS,
  HYPERTENSION_SYMPTOM_LABELS,
  HYPERTENSION_VOLUNTEER_ACTIONS,
  HYPERTENSION_VOLUNTEER_ACTION_LABELS,
  PHYSICAL_ACTIVITY_TYPES,
  PHYSICAL_ACTIVITY_TYPE_LABELS,
  PREGNANCY_PLANNING_ANSWERS,
  PREGNANCY_PLANNING_ANSWER_LABELS,
  deriveHypertensionEscalation,
  reviewReasonsForEscalation,
} from '@nkwapa/db/hypertension-interview';
import {
  HYPERTENSION_CLASSIFICATIONS,
  classifyBloodPressure,
  shouldPromptRepeat,
  BP_REPEAT_PROMPT_DIASTOLIC,
  BP_REPEAT_PROMPT_SYSTOLIC,
} from '@nkwapa/db/bp-classification';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { FieldLabel, focusFirstInvalid } from '@/components/ui/field';
import { InlineNotice } from '@/components/ops/OpsShared';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { isFullySynced } from '@/lib/sync';
import { db, type HypertensionAssessmentRecord } from '@/lib/db';
import { SYNC_OPERATION, enqueueOutboxMutation } from '@/lib/outbox';
import { claimEncounterRecord } from '@/lib/encounter-record';
import { useSeededFormValues } from '@/lib/use-seeded-form-values';
import { generateClinicalId } from '@/lib/clinical-measurements';
import {
  HYPERTENSION_FIELD_ORDER,
  fromHypertensionRecord,
  toHypertensionPayload,
  showsHomeReadings,
  showsRepeatReadings,
  validateHypertensionInterview,
  type ClinicalFieldErrors,
  type HypertensionInterviewValues,
} from '@/lib/hypertension-interview';
import {
  formatBloodPressure,
  formatPulse,
  freshestVitals,
  hasBloodPressure,
  type EncounterVitalsReading,
} from '@/lib/encounter-vitals';
import { HYPERTENSION_LABELS } from '@/lib/hypertension';
import { ClinicianPlanSection } from '@/components/encounters/ClinicianPlanSection';
import { InterviewFlow, InterviewSection } from '@/components/encounters/InterviewFlow';
import { MedicationAdherenceSection } from '@/components/encounters/MedicationAdherenceSection';
import { useMedicationAdherence } from '@/lib/use-medication-adherence';
import {
  CheckboxQuestion,
  ChoiceQuestion,
  DateQuestion,
  MultiChoiceQuestion,
  NumberQuestion,
  TextQuestion,
} from './InterviewQuestion';

interface HypertensionInterviewFormProps {
  clinicId: string;
  encounterId: string;
  /** Needed to read the reconciled medication list the adherence section asks about. */
  patientId: string;
  initialData?: Record<string, unknown> | null;
  /** Today's vitals, read and shown but never stored on this record. */
  vitals?: EncounterVitalsReading | null;
  canEdit?: boolean;
  /**
   * Whether this actor holds `CAREPLAN.CLINICIAN_PLAN`.
   *
   * Controls both the plan section and the classification override. A volunteer sees neither --
   * not a disabled version of either, because a disabled control still tells them what a doctor
   * may do. The API refuses both independently.
   */
  canRecordClinicianPlan?: boolean;
  onSaved?: () => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

// Spoken wording drafted 2026-11-12 for owner review (BRIEF-INTERVIEW.md section 7).
// What each answer means, where the volunteer has to match the patient's words to a category.
const HYPERTENSION_STATUS_MEANINGS: Record<string, string> = {
  KNOWN_HYPERTENSION: 'A health worker has told them before',
  NEWLY_ELEVATED_BP: "Never told, but today's reading is high",
  NO_KNOWN_HYPERTENSION: "Never told, and today's reading is not high",
  UNSURE: 'The patient does not know',
};
const BP_REPEAT_MEANINGS: Record<string, string> = {
  YES: 'A second reading was taken after rest',
  NO: 'A repeat was needed but not taken',
  NOT_REQUIRED: `Today's reading was below ${BP_REPEAT_PROMPT_SYSTOLIC}/${BP_REPEAT_PROMPT_DIASTOLIC}`,
};

const HYPERTENSION_SECTIONS = [
  { id: 'history', title: 'Hypertension history', short: 'History' },
  { id: 'bp-control', title: 'Blood pressure control', short: 'BP control' },
  { id: 'symptoms', title: 'Current symptoms' },
  { id: 'medications', title: 'Medications and adherence', short: 'Medications' },
  {
    id: 'substances',
    title: 'Other substances affecting blood pressure',
    short: 'Other substances',
  },
  { id: 'lifestyle', title: 'Nutrition and lifestyle', short: 'Lifestyle' },
  { id: 'medical-history', title: 'Relevant medical history', short: 'Medical history' },
  { id: 'screening', title: 'Essential screening status', short: 'Screening status' },
  { id: 'plan', title: 'Actions and referral' },
];

export function HypertensionInterviewForm({
  clinicId,
  encounterId,
  patientId,
  initialData,
  vitals,
  canEdit = true,
  canRecordClinicianPlan = false,
  onSaved,
  saveRef,
}: HypertensionInterviewFormProps) {
  const [values, setValues] = useSeededFormValues(
    initialData?.id as string | undefined,
    initialData,
    fromHypertensionRecord,
  );
  const [errors, setErrors] = useState<ClinicalFieldErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [cachedVitals, setCachedVitals] = useState<EncounterVitalsReading | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bpGoalSystolic, setBpGoalSystolic] = useState('');
  const [bpGoalDiastolic, setBpGoalDiastolic] = useState('');
  /*
    Say which of the two things happened.

    A clinic works offline routinely, so "saved" alone is ambiguous in the way that matters: a
    volunteer needs to know whether the record has reached the server or is still only on this
    laptop. The old form said so and the interview must not quietly drop that.
  */
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const { isOnline, syncNow } = useSync();
  const adherence = useMedicationAdherence(
    clinicId,
    encounterId,
    patientId,
    'HYPERTENSION',
    canEdit,
  );

  /*
    Read today's vitals from the local cache as well as the prop.

    The encounter page awaits the outgoing tab's save but not the refetch that follows it, so a
    volunteer who edits vitals and immediately switches here can arrive before the prop has caught
    up. `freshestVitals` compares timestamps rather than guessing which source is ahead.
  */
  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const row = await db.vitals.where('encounterId').equals(encounterId).first();
        if (cancelled || !row) return;
        setCachedVitals((current) => {
          const next = {
            systolicBp: row.systolicBp ?? null,
            diastolicBp: row.diastolicBp ?? null,
            pulseBpm: row.pulseBpm ?? null,
            weightKg: row.weightKg ?? null,
            heightCm: row.heightCm ?? null,
            bmi: row.bmi ?? null,
            updatedAt: row.updatedAt,
          };
          /*
            Only re-render when the reading actually moved.

            This runs on a timer, and replacing the object every tick would re-render a
            sixty-field form twice a second for nothing.
          */
          if (
            current &&
            current.systolicBp === next.systolicBp &&
            current.diastolicBp === next.diastolicBp &&
            current.pulseBpm === next.pulseBpm &&
            current.updatedAt === next.updatedAt
          ) {
            return current;
          }
          return next;
        });
      } catch {
        /* An unreadable cache is not a reason to block the interview. */
      }
    };

    void read();

    /*
      Poll, rather than read once on mount.
      
      Vitals are written local-first: the row reaches IndexedDB immediately and the server only
      after the outbox drains. The encounter page's refetch asks the API, so a volunteer who
      records a blood pressure and moves straight to this tab arrives before the server knows
      anything, and a single read on mount would leave "Not recorded" on screen next to a reading
      they just took. This was caught by running the interview end to end, not by reading the code.

      Dexie has no change subscription without the observable addon, and `dexie-react-hooks` is not
      a dependency here, so a cheap indexed lookup on a timer is the honest option. It stops as
      soon as the tab unmounts.
    */
    const timer = setInterval(() => void read(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [encounterId]);

  const todaysVitals = useMemo(
    () => freshestVitals(vitals ?? null, cachedVitals),
    [vitals, cachedVitals],
  );

  const repeatSystolic = Number.parseInt(values.repeatSystolicBp, 10);
  const repeatDiastolic = Number.parseInt(values.repeatDiastolicBp, 10);

  /*
    Derived live from the same functions the server runs on write.

    The volunteer sees the consequence of an answer while the patient is still in front of them;
    the server recomputes and is the authority. Both call `@nkwapa/db`, so they cannot disagree.
  */
  const derivedClassification = classifyBloodPressure(
    todaysVitals?.systolicBp ?? null,
    todaysVitals?.diastolicBp ?? null,
  );
  const promptRepeat = shouldPromptRepeat(
    todaysVitals?.systolicBp ?? null,
    todaysVitals?.diastolicBp ?? null,
  );
  const showRepeat = showsRepeatReadings(values);
  const showHomeReadings = showsHomeReadings(values);
  const escalation = deriveHypertensionEscalation({
    symptoms: values.currentSymptoms as never,
    systolicBp: todaysVitals?.systolicBp ?? null,
    diastolicBp: todaysVitals?.diastolicBp ?? null,
    repeatSystolicBp: Number.isFinite(repeatSystolic) ? repeatSystolic : null,
    repeatDiastolicBp: Number.isFinite(repeatDiastolic) ? repeatDiastolic : null,
  });

  const update = useCallback(
    <K extends keyof HypertensionInterviewValues>(
      key: K,
      value: HypertensionInterviewValues[K],
    ) => {
      setValues((current) => {
        const next = { ...current, [key]: value };
        /*
          Revalidate a field only once the form has been submitted and failed.

          MASTER.md section 10: validate on submit, then per field as it is corrected. Validating
          while someone is still typing their first answer tells them a half-entered blood pressure
          is wrong before they have finished entering it.
        */
        setErrors((currentErrors) => {
          if (!hasSubmitted) return currentErrors;
          return validateHypertensionInterview(next);
        });
        return next;
      });
    },
    [hasSubmitted, setValues],
  );

  const updateLifestyle = useCallback(
    (key: keyof HypertensionInterviewValues['lifestyle'], value: unknown) => {
      setValues((current) => {
        const next = { ...current, lifestyle: { ...current.lifestyle, [key]: value } };
        setErrors((currentErrors) =>
          hasSubmitted ? validateHypertensionInterview(next) : currentErrors,
        );
        return next;
      });
    },
    [hasSubmitted, setValues],
  );

  /*
    Preselect the review reason an escalation implies -- visibly, and reversibly.

    The volunteer can see what was selected and unselect it. An escalation that silently edited the
    plan would be one nobody could argue with, and the person in the room may know something the
    thresholds do not.
  */
  const applyEscalationReasons = useCallback(() => {
    const implied = reviewReasonsForEscalation(escalation);
    if (!implied.length) return;
    update('reviewReasons', [
      ...values.reviewReasons.filter((reason) => reason !== 'ROUTINE_REVIEW_ONLY'),
      ...implied.filter((reason) => !values.reviewReasons.includes(reason)),
    ]);
    update('clinicianReviewRequested', true);
  }, [escalation, update, values.reviewReasons]);

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    setHasSubmitted(true);
    const found = validateHypertensionInterview(values);
    setErrors(found);
    /*
      Both halves are validated before either is written.

      The assessment and the adherence set are two records saved by one act, so a payload that
      fails on one must not leave the other written -- a volunteer who fixed the highlighted
      medication answer would otherwise be saving an assessment for the second time.
    */
    const adherenceErrors = adherence.validate();
    if (Object.keys(found).length) {
      focusFirstInvalid(found, [...HYPERTENSION_FIELD_ORDER]);
      throw new Error('Check the highlighted answers before saving.');
    }
    if (Object.keys(adherenceErrors).length) {
      throw new Error('Check the highlighted medication answers before saving.');
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      /*
        Reuse the encounter's existing row rather than minting an id on every save, which is what
        issue #91 was: each save inserted another row for the same encounter and the page could
        hand back an older one.
      */
      const claimed = await claimEncounterRecord(
        db.hypertension_assessments,
        encounterId,
        generateClinicalId,
      );
      const now = new Date().toISOString();
      const payload = {
        encounterId,
        clinicId,
        ...toHypertensionPayload(values, claimed.createdAt ?? now),
        repeatPromptShown: promptRepeat || values.repeatPromptShown,
      };

      const record: HypertensionAssessmentRecord = {
        ...(payload as unknown as HypertensionAssessmentRecord),
        id: claimed.id,
        clinicId,
        encounterId,
        // Cached so the interview can show the consequence offline; the server recomputes on write.
        derivedClassification,
        urgentReviewRequired: escalation.urgentReviewRequired,
        urgentReviewReasons: [...escalation.reasons],
        // Preserved, not restamped: an update is not a creation.
        createdAt: claimed.createdAt ?? now,
        updatedAt: now,
      };

      await db.hypertension_assessments.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'hypertension_assessment',
        entityId: claimed.id,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: payload,
      });
      /*
        Queued before the sync pass, so one drain carries both.

        Saving them as separate passes would let a connection drop between the two and leave the
        server holding an assessment whose medication answers it has never seen.
      */
      await adherence.save();
      const synced = isOnline ? await syncNow(clinicId) : null;
      setSaveMessage(
        isFullySynced(synced)
          ? 'Hypertension assessment saved and synced.'
          : 'Hypertension assessment saved on this device and pending sync.',
      );
      onSaved?.();
    } catch (error) {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : 'Failed to save the assessment.');
      throw error;
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    saving,
    values,
    encounterId,
    clinicId,
    promptRepeat,
    derivedClassification,
    escalation,
    onSaved,
    isOnline,
    syncNow,
    adherence,
  ]);

  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [saveRef, handleSave]);

  const shared = { disabled: !canEdit || saving, reserveErrorSpace: hasSubmitted };
  const q = (id: string) => ({ id, error: errors[id], ...shared });
  // A screening completed in the future is a typo, not an answer.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <InterviewFlow
        label="Hypertension interview"
        sections={HYPERTENSION_SECTIONS}
        canEdit={canEdit}
        onSave={handleSave}
        saveLabel="Save assessment"
        save={{ saving, message: saveMessage, error: saveError }}
        alert={
          escalation.urgentReviewRequired ? (
            <InlineNotice tone="error">
              <span className="block font-medium">This visit needs a clinician now.</span>
              <span className="block">
                {escalation.reasons
                  .map((reason) => HYPERTENSION_ESCALATION_REASON_LABELS[reason])
                  .join(' · ')}
              </span>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={applyEscalationReasons}
                >
                  Add to the reasons for clinician review
                </Button>
              ) : null}
            </InlineNotice>
          ) : null
        }
      >
        <InterviewSection id="history" title="Hypertension history">
          <ChoiceQuestion
            {...q('htn-status')}
            ask="Has a doctor or nurse ever told you that you have high blood pressure?"
            label="Hypertension status"
            value={values.hypertensionStatus}
            onChange={(value) => update('hypertensionStatus', value)}
            options={HYPERTENSION_STATUSES}
            labels={HYPERTENSION_STATUS_LABELS}
            descriptions={HYPERTENSION_STATUS_MEANINGS}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberQuestion
              {...q('htn-year-diagnosed')}
              ask="What year were you first told?"
              label="Year diagnosed"
              value={values.yearDiagnosed}
              onChange={(value) => update('yearDiagnosed', value)}
              placeholder="e.g. 2019"
              disabled={shared.disabled || values.yearDiagnosedUnknown}
            />
            <div className="flex items-end pb-6">
              <CheckboxQuestion
                id="htn-year-unknown"
                label="Year unknown"
                checked={values.yearDiagnosedUnknown}
                onChange={(checked) => update('yearDiagnosedUnknown', checked)}
                disabled={shared.disabled}
              />
            </div>
          </div>
          <ChoiceQuestion
            {...q('htn-main-concern')}
            ask="What worries you most about your blood pressure today?"
            label="Main concern today"
            value={values.mainConcern}
            onChange={(value) => update('mainConcern', value)}
            options={HYPERTENSION_CONCERNS}
            labels={HYPERTENSION_CONCERN_LABELS}
          />
          {values.mainConcern === 'OTHER' ? (
            <TextQuestion
              {...q('htn-main-concern-other')}
              label="Describe the concern"
              required
              value={values.mainConcernOther}
              onChange={(value) => update('mainConcernOther', value)}
              maxLength={200}
            />
          ) : null}
          <ChoiceQuestion
            {...q('htn-usual-care-status')}
            ask="Where do you usually go for your blood pressure care?"
            label="Usual hypertension care site"
            value={values.usualCareFacilityStatus}
            onChange={(value) => update('usualCareFacilityStatus', value)}
            options={FACILITY_KNOWN_STATUSES}
            labels={FACILITY_KNOWN_STATUS_LABELS}
          />
          {values.usualCareFacilityStatus === 'SELECTED' ? (
            <TextQuestion
              {...q('htn-usual-care-facility')}
              label="Facility name"
              required
              value={values.usualCareFacility}
              onChange={(value) => update('usualCareFacility', value)}
              maxLength={200}
            />
          ) : null}
        </InterviewSection>

        <InterviewSection
          id="bp-control"
          title="Blood pressure control"
          description="Today's measurements come from the Vitals tab. They are shown here, not re-entered."
        >
          {/*
          Read-only, with units re-attached, exactly as MASTER.md describes a locked record. These
          values are never written to this record: Vitals is the one place today's measurement
          lives, so correcting a mistyped vital corrects the classification with no second edit.
        */}
          {/* Ruled rows, not a bordered box: a box here read as one more answer card to tap. */}
          <dl className="grid gap-x-6 border-y border-rule sm:grid-cols-3">
            {[
              ['Today’s blood pressure', formatBloodPressure(todaysVitals)],
              ['Pulse', formatPulse(todaysVitals)],
              ['Classification', HYPERTENSION_LABELS[derivedClassification]],
            ].map(([term, detail]) => (
              <div key={term} className="py-3">
                <dt className="type-label font-normal text-muted-foreground">{term}</dt>
                <dd className="mt-1 type-data font-semibold text-foreground">{detail}</dd>
              </div>
            ))}
          </dl>

          {!hasBloodPressure(todaysVitals) ? (
            <InlineNotice tone="info" live={false}>
              {isOnline
                ? 'No blood pressure has been recorded for this visit yet. Record it on the Vitals tab and it will appear here.'
                : 'No blood pressure is available on this device for this visit. Reconnect to check for readings, or record one on the Vitals tab.'}
            </InlineNotice>
          ) : null}

          {promptRepeat && values.repeatPerformed === 'NOT_ASSESSED' ? (
            <InlineNotice tone="warning">
              This reading is high enough to confirm. Let the patient rest quietly for five minutes,
              check the cuff size is right for their arm, then record the repeat below.
            </InlineNotice>
          ) : null}

          <ChoiceQuestion
            {...q('htn-repeat-performed')}
            label="BP measurement repeated today"
            value={values.repeatPerformed}
            onChange={(value) => update('repeatPerformed', value)}
            options={BP_REPEAT_STATUSES}
            labels={BP_REPEAT_STATUS_LABELS}
            descriptions={BP_REPEAT_MEANINGS}
          />
          {showRepeat ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberQuestion
                {...q('htn-repeat-systolic')}
                label="Repeat systolic (mmHg)"
                value={values.repeatSystolicBp}
                onChange={(value) => update('repeatSystolicBp', value)}
              />
              <NumberQuestion
                {...q('htn-repeat-diastolic')}
                label="Repeat diastolic (mmHg)"
                value={values.repeatDiastolicBp}
                onChange={(value) => update('repeatDiastolicBp', value)}
              />
            </div>
          ) : null}
          <ChoiceQuestion
            {...q('htn-home-monitor')}
            ask="Do you have a blood pressure machine at home?"
            label="Home BP monitor"
            value={values.homeMonitorStatus}
            onChange={(value) => update('homeMonitorStatus', value)}
            options={HOME_BP_MONITOR_STATUSES}
            labels={HOME_BP_MONITOR_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-home-frequency')}
            ask="How often do you check your blood pressure at home?"
            label="Checks BP at home"
            value={values.homeCheckFrequency}
            onChange={(value) => update('homeCheckFrequency', value)}
            options={HOME_BP_CHECK_FREQUENCIES}
            labels={HOME_BP_CHECK_FREQUENCY_LABELS}
          />
          {showHomeReadings ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberQuestion
                  {...q('htn-home-systolic')}
                  ask="What does your reading at home usually say? The top number first."
                  label="Usual home systolic (mmHg)"
                  value={values.homeSystolicAvg}
                  onChange={(value) => update('homeSystolicAvg', value)}
                  disabled={shared.disabled || values.homeReadingsUnknown}
                />
                <NumberQuestion
                  {...q('htn-home-diastolic')}
                  label="Usual home diastolic (mmHg)"
                  value={values.homeDiastolicAvg}
                  onChange={(value) => update('homeDiastolicAvg', value)}
                  disabled={shared.disabled || values.homeReadingsUnknown}
                />
              </div>
              <CheckboxQuestion
                id="htn-home-unknown"
                label="Readings unknown"
                checked={values.homeReadingsUnknown}
                onChange={(checked) => update('homeReadingsUnknown', checked)}
                disabled={shared.disabled}
              />
              <ChoiceQuestion
                {...q('htn-home-source')}
                label="Source of home readings"
                value={values.homeReadingSource}
                onChange={(value) => update('homeReadingSource', value)}
                options={HOME_BP_SOURCES}
                labels={HOME_BP_SOURCE_LABELS}
              />
            </>
          ) : null}
        </InterviewSection>

        <InterviewSection id="symptoms" title="Current symptoms">
          <MultiChoiceQuestion
            {...q('htn-symptoms')}
            ask="Right now, do you have any of these? Read each one out."
            label="Symptoms"
            value={values.currentSymptoms}
            onChange={(value) => update('currentSymptoms', value)}
            options={HYPERTENSION_SYMPTOMS}
            labels={HYPERTENSION_SYMPTOM_LABELS}
            exclusive={['NONE']}
          />
        </InterviewSection>

        <InterviewSection
          id="medications"
          title="Medications and adherence"
          description="The medications come from the reconciled list on the Medications tab and are read-only here. Record only what was observed today."
        >
          <MedicationAdherenceSection
            context="HYPERTENSION"
            clinicId={clinicId}
            patientId={patientId}
            forCondition={adherence.forCondition}
            other={adherence.other}
            categoriesUnavailable={adherence.categoriesUnavailable}
            entries={adherence.entries}
            errors={adherence.errors}
            disabled={!canEdit || saving}
            reserveErrorSpace={hasSubmitted}
            onChange={adherence.update}
            loading={adherence.loading}
            loadError={adherence.loadError}
          />
          <MultiChoiceQuestion
            {...q('htn-reminder-strategies')}
            ask="How do you remember to take your medicines?"
            label="How does the patient remember medications?"
            value={values.medicationReminderStrategies}
            onChange={(value) => update('medicationReminderStrategies', value)}
            options={MEDICATION_REMINDER_STRATEGIES}
            labels={MEDICATION_REMINDER_STRATEGY_LABELS}
            exclusive={['NONE']}
          />
          {values.medicationReminderStrategies.includes('OTHER') ? (
            <TextQuestion
              {...q('htn-reminder-other')}
              label="Describe the reminder system"
              required
              value={values.reminderStrategyOther}
              onChange={(value) => update('reminderStrategyOther', value)}
              maxLength={200}
            />
          ) : null}
          <InlineNotice tone="info" live={false}>
            Document what the patient takes and any barriers. Do not recommend medication changes.
          </InlineNotice>
        </InterviewSection>

        <InterviewSection
          id="substances"
          title="Other substances affecting blood pressure"
          description="Recorded for the clinician to consider. This does not mean a substance caused the hypertension."
        >
          <MultiChoiceQuestion
            {...q('htn-substances')}
            ask="Do you currently use any of these?"
            label="Currently uses any of the following?"
            value={values.contributingSubstances}
            onChange={(value) => update('contributingSubstances', value)}
            options={BP_AFFECTING_SUBSTANCES}
            labels={BP_AFFECTING_SUBSTANCE_LABELS}
            exclusive={['NONE', 'UNSURE']}
          />
        </InterviewSection>

        <InterviewSection id="lifestyle" title="Nutrition and lifestyle">
          <div className="space-y-6">
            <ChoiceQuestion
              {...q('htn-lifestyle-salt-cooking')}
              ask="Do you add salt when you cook?"
              label="Adds salt during cooking"
              value={values.lifestyle.saltDuringCooking}
              onChange={(value) => updateLifestyle('saltDuringCooking', value)}
              options={FREQUENCY_NEVER_SOMETIMES_USUALLY}
              labels={FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-salt-table')}
              ask="Do you add salt to your food at the table?"
              label="Adds salt at the table"
              value={values.lifestyle.saltAtTable}
              onChange={(value) => updateLifestyle('saltAtTable', value)}
              options={FREQUENCY_NEVER_SOMETIMES_USUALLY}
              labels={FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-processed')}
              ask="Do you often eat salty or packaged foods?"
              label="Frequently eats salty or processed foods"
              value={values.lifestyle.saltyProcessedFoods}
              onChange={(value) => updateLifestyle('saltyProcessedFoods', value)}
              options={NKWAPA_ANSWERS}
              labels={NKWAPA_ANSWER_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-fruit-veg')}
              ask="How often do you eat fruit or vegetables?"
              label="Fruit or vegetables"
              value={values.lifestyle.fruitVegetables}
              onChange={(value) => updateLifestyle('fruitVegetables', value)}
              options={FREQUENCY_RARELY_SOME_MOST}
              labels={FREQUENCY_RARELY_SOME_MOST_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-sugary-drinks')}
              ask="How often do you drink sweet drinks, like soda or sweetened juice?"
              label="Sugar-sweetened drinks"
              value={values.lifestyle.sugarSweetenedDrinks}
              onChange={(value) => updateLifestyle('sugarSweetenedDrinks', value)}
              options={FREQUENCY_NEVER_SOMETIMES_DAILY}
              labels={FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-food-insecurity')}
              ask="Is it hard for you to get healthy food?"
              label="Difficulty obtaining healthy food"
              value={values.lifestyle.foodInsecurity}
              onChange={(value) => updateLifestyle('foodInsecurity', value)}
              options={FREQUENCY_NEVER_SOMETIMES_OFTEN}
              labels={FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-counselling')}
              ask="Would you like advice about food and nutrition?"
              label="Interested in nutrition counseling"
              value={values.lifestyle.wantsNutritionCounseling}
              onChange={(value) => updateLifestyle('wantsNutritionCounseling', value)}
              options={NKWAPA_ANSWERS}
              labels={NKWAPA_ANSWER_LABELS}
            />
            <NumberQuestion
              {...q('htn-lifestyle-active-days')}
              ask="Last week, on how many days were you physically active?"
              label="Physically active days per week (0-7)"
              value={
                values.lifestyle.activeDaysPerWeek == null
                  ? ''
                  : String(values.lifestyle.activeDaysPerWeek)
              }
              onChange={(value) =>
                updateLifestyle('activeDaysPerWeek', value.trim() ? Number(value) : null)
              }
            />
            <ChoiceQuestion
              {...q('htn-lifestyle-activity')}
              ask="What kind of activity do you usually do?"
              label="Typical activity"
              value={values.lifestyle.typicalActivity}
              onChange={(value) => updateLifestyle('typicalActivity', value)}
              options={PHYSICAL_ACTIVITY_TYPES}
              labels={PHYSICAL_ACTIVITY_TYPE_LABELS}
            />
            {/*
            `typicalActivityOther` has been in the lifestyle payload since the interview shipped
            and was the one OTHER answer with nowhere to write it down, so "Other" recorded that
            the question was answered and discarded the answer.
          */}
            {values.lifestyle.typicalActivity === 'OTHER' ? (
              <TextQuestion
                {...q('htn-lifestyle-activity-other')}
                label="Describe the activity"
                required
                value={values.lifestyle.typicalActivityOther ?? ''}
                onChange={(value) => updateLifestyle('typicalActivityOther', value)}
                maxLength={200}
              />
            ) : null}
            <ChoiceQuestion
              {...q('htn-lifestyle-alcohol')}
              ask="Do you drink alcohol? How often?"
              label="Alcohol use"
              value={values.lifestyle.alcoholUse}
              onChange={(value) => updateLifestyle('alcoholUse', value)}
              options={ALCOHOL_USE_STATUSES}
              labels={ALCOHOL_USE_STATUS_LABELS}
            />
          </div>
          {/*
          Tobacco is asked on the Vitals tab, which writes TobaccoScreening for this encounter.
          Asking again here would let one visit hold two different answers.
        */}
          <InlineNotice tone="info" live={false}>
            Tobacco use is recorded with the vitals for this visit, on the Vitals tab.
          </InlineNotice>
        </InterviewSection>

        <InterviewSection id="medical-history" title="Relevant medical history">
          <MultiChoiceQuestion
            {...q('htn-conditions')}
            ask="Has a health worker ever told you that you have any of these? Read each one out."
            label="Documented or patient-reported conditions"
            value={values.relevantConditions}
            onChange={(value) => update('relevantConditions', value)}
            options={CARDIOMETABOLIC_CONDITIONS}
            labels={CARDIOMETABOLIC_CONDITION_LABELS}
            exclusive={['NONE_KNOWN', 'UNSURE']}
          />
          <div className="space-y-6">
            <ChoiceQuestion
              {...q('htn-pregnant-now')}
              ask="Are you pregnant now?"
              label="Pregnant now"
              value={values.pregnantNow}
              onChange={(value) => update('pregnantNow', value)}
              options={NKWAPA_ANSWERS}
              labels={NKWAPA_ANSWER_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-planning-pregnancy')}
              ask="Are you planning to become pregnant in the next year?"
              label="Planning pregnancy within 12 months"
              value={values.planningPregnancy}
              onChange={(value) => update('planningPregnancy', value)}
              options={PREGNANCY_PLANNING_ANSWERS}
              labels={PREGNANCY_PLANNING_ANSWER_LABELS}
            />
          </div>
        </InterviewSection>

        <InterviewSection
          id="screening"
          title="Essential screening status"
          description="Record what has been done. Do not decide what is indicated."
        >
          <div className="space-y-6">
            <ChoiceQuestion
              {...q('htn-kidney-testing')}
              ask="In the past year, have you had a blood test for your kidneys?"
              label="Kidney function testing in the past year"
              value={values.kidneyFunctionTesting}
              onChange={(value) => update('kidneyFunctionTesting', value)}
              options={SCREENING_COMPLETION_STATUSES}
              labels={SCREENING_COMPLETION_STATUS_LABELS}
            />
            {values.kidneyFunctionTesting === 'COMPLETED' ? (
              <DateQuestion
                {...q('htn-kidney-testing-completed-on')}
                ask="When was that?"
                label="Date of the kidney function testing"
                hint="Leave blank if the patient is not sure when."
                max={today}
                value={values.kidneyFunctionTestingCompletedOn ?? ''}
                onChange={(value) => update('kidneyFunctionTestingCompletedOn', value || null)}
              />
            ) : null}
            <ChoiceQuestion
              {...q('htn-urine-protein')}
              ask="In the past year, have you had a urine test for protein?"
              label="Urine protein testing in the past year"
              value={values.urineProteinTesting}
              onChange={(value) => update('urineProteinTesting', value)}
              options={SCREENING_COMPLETION_STATUSES}
              labels={SCREENING_COMPLETION_STATUS_LABELS}
            />
            {values.urineProteinTesting === 'COMPLETED' ? (
              <DateQuestion
                {...q('htn-urine-protein-completed-on')}
                ask="When was that?"
                label="Date of the urine protein testing"
                hint="Leave blank if the patient is not sure when."
                max={today}
                value={values.urineProteinTestingCompletedOn ?? ''}
                onChange={(value) => update('urineProteinTestingCompletedOn', value || null)}
              />
            ) : null}
            <ChoiceQuestion
              {...q('htn-cholesterol')}
              ask="In the past year, have you had your cholesterol checked?"
              label="Cholesterol testing in the past year"
              value={values.cholesterolTesting}
              onChange={(value) => update('cholesterolTesting', value)}
              options={SCREENING_COMPLETION_STATUSES}
              labels={SCREENING_COMPLETION_STATUS_LABELS}
            />
            {values.cholesterolTesting === 'COMPLETED' ? (
              <DateQuestion
                {...q('htn-cholesterol-completed-on')}
                ask="When was that?"
                label="Date of the cholesterol testing"
                hint="Leave blank if the patient is not sure when."
                max={today}
                value={values.cholesterolTestingCompletedOn ?? ''}
                onChange={(value) => update('cholesterolTestingCompletedOn', value || null)}
              />
            ) : null}
            <ChoiceQuestion
              {...q('htn-ecg')}
              ask="Have you ever had an ECG, a tracing of your heart?"
              label="ECG previously completed"
              value={values.ecgCompleted}
              onChange={(value) => update('ecgCompleted', value)}
              options={SCREENING_COMPLETION_STATUSES}
              labels={SCREENING_COMPLETION_STATUS_LABELS}
            />
            {values.ecgCompleted === 'COMPLETED' ? (
              <DateQuestion
                {...q('htn-ecg-completed-on')}
                ask="When was that?"
                label="Date of the ECG"
                hint="Leave blank if the patient is not sure when."
                max={today}
                value={values.ecgCompletedOn ?? ''}
                onChange={(value) => update('ecgCompletedOn', value || null)}
              />
            ) : null}
            <ChoiceQuestion
              {...q('htn-statin')}
              ask="Are you taking a statin, a medicine for cholesterol?"
              label="Statin"
              value={values.statinUse}
              onChange={(value) => update('statinUse', value)}
              options={MEDICATION_USE_STATUSES}
              labels={MEDICATION_USE_STATUS_LABELS}
            />
            <ChoiceQuestion
              {...q('htn-aspirin')}
              ask="Are you taking aspirin?"
              label="Aspirin"
              value={values.aspirinUse}
              onChange={(value) => update('aspirinUse', value)}
              options={MEDICATION_USE_STATUSES}
              labels={MEDICATION_USE_STATUS_LABELS}
            />
          </div>
        </InterviewSection>

        <InterviewSection id="plan" title="Actions and referral">
          <MultiChoiceQuestion
            {...q('htn-volunteer-actions')}
            label="Actions completed"
            value={values.volunteerActions}
            onChange={(value) => update('volunteerActions', value)}
            options={HYPERTENSION_VOLUNTEER_ACTIONS}
            labels={HYPERTENSION_VOLUNTEER_ACTION_LABELS}
            exclusive={['NO_INTERVENTION_COMPLETED']}
          />
          <MultiChoiceQuestion
            {...q('htn-review-reasons')}
            label="Reason for clinician review"
            value={values.reviewReasons}
            onChange={(value) => update('reviewReasons', value)}
            options={HYPERTENSION_REVIEW_REASONS}
            labels={HYPERTENSION_REVIEW_REASON_LABELS}
            exclusive={['ROUTINE_REVIEW_ONLY']}
          />
          {values.reviewReasons.includes('OTHER') ? (
            <TextQuestion
              {...q('htn-review-reason-other')}
              label="Describe the reason"
              required
              value={values.reviewReasonOther}
              onChange={(value) => update('reviewReasonOther', value)}
              maxLength={200}
            />
          ) : null}
          <div className="space-y-2">
            <FieldLabel htmlFor="htn-notes">Notes</FieldLabel>
            <Textarea
              id="htn-notes"
              value={values.notes}
              onChange={(event) => update('notes', event.target.value)}
              disabled={shared.disabled}
              maxLength={2000}
              rows={3}
            />
          </div>
        </InterviewSection>
      </InterviewFlow>

      {canRecordClinicianPlan ? (
        <FormSectionCard
          title="Clinician classification"
          titleAs="h2"
          description="The classification above is derived from today's reading. Override it only to record a different clinical judgement."
        >
          <p className="text-sm">
            Derived from {formatBloodPressure(todaysVitals)}:{' '}
            <span className="font-medium">{HYPERTENSION_LABELS[derivedClassification]}</span>
          </p>
          <CheckboxQuestion
            id="htn-classification-override"
            label="Record a different classification"
            checked={values.classificationOverridden}
            onChange={(checked) => {
              update('classificationOverridden', checked);
              /*
                Seed the override from the derivation rather than from UNKNOWN.

                A clinician ticking this box is disagreeing about a degree, not starting from
                nothing, and defaulting to "Not classified" would make the safe first save a
                deletion of the finding.
              */
              if (checked && values.classification === 'UNKNOWN') {
                update('classification', derivedClassification);
              }
            }}
            disabled={shared.disabled}
          />
          {values.classificationOverridden ? (
            <ChoiceQuestion
              {...q('htn-classification')}
              label="Classification"
              value={values.classification}
              onChange={(value) => update('classification', value)}
              options={HYPERTENSION_CLASSIFICATIONS}
              labels={HYPERTENSION_LABELS}
            />
          ) : null}
          {/*
            The interview's save bar stays inside the interview, so the override carries its own.
            Same save as the bar: the classification is a field of the assessment.
          */}
          {canEdit && values.classificationOverridden ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void handleSave().catch(() => undefined)}
              >
                {saving ? 'Saving…' : 'Save classification'}
              </Button>
              <p
                role="status"
                className={saveError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
              >
                {saveError ?? saveMessage}
              </p>
            </div>
          ) : null}
        </FormSectionCard>
      ) : null}

      {canRecordClinicianPlan ? (
        <ClinicianPlanSection
          clinicId={clinicId}
          encounterId={encounterId}
          endpoint="hypertension-assessment"
          planItems={HYPERTENSION_CLINICIAN_PLAN_ITEMS}
          planItemLabels={HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS}
          initialPlan={initialData?.clinicianPlan as Record<string, unknown> | null}
          canEdit={canEdit}
          onSaved={onSaved}
          idPrefix="htn"
          extraFields={{
            render: (disabled) => (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberQuestion
                  id="htn-bp-goal-systolic"
                  label="BP goal systolic (mmHg)"
                  value={bpGoalSystolic}
                  onChange={setBpGoalSystolic}
                  disabled={disabled}
                />
                <NumberQuestion
                  id="htn-bp-goal-diastolic"
                  label="BP goal diastolic (mmHg)"
                  value={bpGoalDiastolic}
                  onChange={setBpGoalDiastolic}
                  disabled={disabled}
                />
              </div>
            ),
            toPayload: () => ({
              bpGoalSystolic: bpGoalSystolic.trim() ? Number(bpGoalSystolic) : null,
              bpGoalDiastolic: bpGoalDiastolic.trim() ? Number(bpGoalDiastolic) : null,
            }),
          }}
        />
      ) : null}
    </div>
  );
}
