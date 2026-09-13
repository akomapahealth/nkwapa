'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALCOHOL_USE_STATUSES,
  ALCOHOL_USE_STATUS_LABELS,
  BP_AFFECTING_SUBSTANCES,
  BP_AFFECTING_SUBSTANCE_LABELS,
  BP_REPEAT_STATUSES,
  BP_REPEAT_STATUS_LABELS,
  CARDIOMETABOLIC_CONDITIONS,
  CARDIOMETABOLIC_CONDITION_LABELS,
  FACILITY_KNOWN_STATUSES,
  FACILITY_KNOWN_STATUS_LABELS,
  FREQUENCY_NEVER_SOMETIMES_DAILY,
  FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS,
  FREQUENCY_NEVER_SOMETIMES_OFTEN,
  FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS,
  FREQUENCY_NEVER_SOMETIMES_USUALLY,
  FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS,
  FREQUENCY_RARELY_SOME_MOST,
  FREQUENCY_RARELY_SOME_MOST_LABELS,
  HOME_BP_CHECK_FREQUENCIES,
  HOME_BP_CHECK_FREQUENCY_LABELS,
  HOME_BP_MONITOR_STATUSES,
  HOME_BP_MONITOR_STATUS_LABELS,
  HOME_BP_SOURCES,
  HOME_BP_SOURCE_LABELS,
  HYPERTENSION_CLASSIFICATIONS,
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
  MEDICATION_REMINDER_STRATEGIES,
  MEDICATION_REMINDER_STRATEGY_LABELS,
  MEDICATION_USE_STATUSES,
  MEDICATION_USE_STATUS_LABELS,
  NKWAPA_ANSWERS,
  NKWAPA_ANSWER_LABELS,
  PHYSICAL_ACTIVITY_TYPES,
  PHYSICAL_ACTIVITY_TYPE_LABELS,
  PREGNANCY_PLANNING_ANSWERS,
  PREGNANCY_PLANNING_ANSWER_LABELS,
  SCREENING_COMPLETION_STATUSES,
  SCREENING_COMPLETION_STATUS_LABELS,
  classifyBloodPressure,
  deriveHypertensionEscalation,
  reviewReasonsForEscalation,
  shouldPromptRepeat,
} from '@nkwapa/db';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { FieldLabel, RequiredLegend, focusFirstInvalid } from '@/components/ui/field';
import { InlineNotice } from '@/components/ops/OpsShared';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { db, type HypertensionAssessmentRecord } from '@/lib/db';
import { SYNC_OPERATION, enqueueOutboxMutation } from '@/lib/outbox';
import { claimEncounterRecord } from '@/lib/encounter-record';
import { generateClinicalId } from '@/lib/clinical-measurements';
import {
  HYPERTENSION_FIELD_ORDER,
  fromHypertensionRecord,
  toHypertensionPayload,
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
import {
  CheckboxQuestion,
  ChoiceQuestion,
  MultiChoiceQuestion,
  NumberQuestion,
  TextQuestion,
} from './InterviewQuestion';

interface HypertensionInterviewFormProps {
  clinicId: string;
  encounterId: string;
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

export function HypertensionInterviewForm({
  clinicId,
  encounterId,
  initialData,
  vitals,
  canEdit = true,
  canRecordClinicianPlan = false,
  onSaved,
  saveRef,
}: HypertensionInterviewFormProps) {
  const [values, setValues] = useState<HypertensionInterviewValues>(() =>
    fromHypertensionRecord(initialData),
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

  /*
    Re-seed when the record arrives.

    `useState(initial)` reads its argument once, and the encounter page loads this record
    asynchronously -- from the API, then from the local cache. Without this the form mounts before
    the data exists and never catches up, which is issue #91 in its original form.
  */
  useEffect(() => {
    if (!initialData) return;
    setValues(fromHypertensionRecord(initialData));
  }, [initialData]);

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
    [hasSubmitted],
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
    [hasSubmitted],
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
    if (Object.keys(found).length) {
      focusFirstInvalid(found, [...HYPERTENSION_FIELD_ORDER]);
      throw new Error('Check the highlighted answers before saving.');
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
      const synced = isOnline ? await syncNow(clinicId) : null;
      setSaveMessage(
        synced?.success
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
  ]);

  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [saveRef, handleSave]);

  const shared = { disabled: !canEdit || saving, reserveErrorSpace: hasSubmitted };
  const q = (id: string) => ({ id, error: errors[id], ...shared });

  return (
    <div className="space-y-4">
      {canEdit ? <RequiredLegend /> : null}

      <FormSectionCard title="1. Hypertension history" titleAs="h2">
        <ChoiceQuestion
          {...q('htn-status')}
          label="Hypertension status"
          value={values.hypertensionStatus}
          onChange={(value) => update('hypertensionStatus', value)}
          options={HYPERTENSION_STATUSES}
          labels={HYPERTENSION_STATUS_LABELS}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberQuestion
            {...q('htn-year-diagnosed')}
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
      </FormSectionCard>

      <FormSectionCard
        title="2. Blood pressure control"
        titleAs="h2"
        description="Today's measurements come from the Vitals tab. They are shown here, not re-entered."
      >
        {/*
          Read-only, with units re-attached, exactly as MASTER.md describes a locked record. These
          values are never written to this record: Vitals is the one place today's measurement
          lives, so correcting a mistyped vital corrects the classification with no second edit.
        */}
        <dl className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Today&rsquo;s blood pressure</dt>
            <dd className="text-base font-medium">{formatBloodPressure(todaysVitals)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Pulse</dt>
            <dd className="text-base font-medium">{formatPulse(todaysVitals)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Classification</dt>
            <dd className="text-base font-medium">{HYPERTENSION_LABELS[derivedClassification]}</dd>
          </div>
        </dl>

        {!hasBloodPressure(todaysVitals) ? (
          <InlineNotice tone="info" live={false}>
            No blood pressure has been recorded for this visit yet. Record it on the Vitals tab and
            it will appear here.
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
        />
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
        <ChoiceQuestion
          {...q('htn-home-monitor')}
          label="Home BP monitor"
          value={values.homeMonitorStatus}
          onChange={(value) => update('homeMonitorStatus', value)}
          options={HOME_BP_MONITOR_STATUSES}
          labels={HOME_BP_MONITOR_STATUS_LABELS}
        />
        <ChoiceQuestion
          {...q('htn-home-frequency')}
          label="Checks BP at home"
          value={values.homeCheckFrequency}
          onChange={(value) => update('homeCheckFrequency', value)}
          options={HOME_BP_CHECK_FREQUENCIES}
          labels={HOME_BP_CHECK_FREQUENCY_LABELS}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberQuestion
            {...q('htn-home-systolic')}
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
      </FormSectionCard>

      <FormSectionCard
        title="3. Current symptoms"
        titleAs="h2"
        description="Is the patient experiencing any of these right now?"
      >
        <MultiChoiceQuestion
          {...q('htn-symptoms')}
          label="Current symptoms"
          value={values.currentSymptoms}
          onChange={(value) => update('currentSymptoms', value)}
          options={HYPERTENSION_SYMPTOMS}
          labels={HYPERTENSION_SYMPTOM_LABELS}
          exclusive={['NONE']}
        />
        {escalation.urgentReviewRequired ? (
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
        ) : null}
      </FormSectionCard>

      <FormSectionCard
        title="4. Medication-taking support"
        titleAs="h2"
        description="Record what the patient is taking on the Medications tab. This section is about how they remember."
      >
        <MultiChoiceQuestion
          {...q('htn-reminder-strategies')}
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
      </FormSectionCard>

      <FormSectionCard
        title="5. Other substances affecting blood pressure"
        titleAs="h2"
        description="Recorded for the clinician to consider. This does not mean a substance caused the hypertension."
      >
        <MultiChoiceQuestion
          {...q('htn-substances')}
          label="Currently uses any of the following?"
          value={values.contributingSubstances}
          onChange={(value) => update('contributingSubstances', value)}
          options={BP_AFFECTING_SUBSTANCES}
          labels={BP_AFFECTING_SUBSTANCE_LABELS}
          exclusive={['NONE', 'UNSURE']}
        />
      </FormSectionCard>

      <FormSectionCard title="6. Nutrition and lifestyle" titleAs="h2">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('htn-lifestyle-salt-cooking')}
            label="Adds salt during cooking"
            value={values.lifestyle.saltDuringCooking}
            onChange={(value) => updateLifestyle('saltDuringCooking', value)}
            options={FREQUENCY_NEVER_SOMETIMES_USUALLY}
            labels={FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-salt-table')}
            label="Adds salt at the table"
            value={values.lifestyle.saltAtTable}
            onChange={(value) => updateLifestyle('saltAtTable', value)}
            options={FREQUENCY_NEVER_SOMETIMES_USUALLY}
            labels={FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-processed')}
            label="Frequently eats salty or processed foods"
            value={values.lifestyle.saltyProcessedFoods}
            onChange={(value) => updateLifestyle('saltyProcessedFoods', value)}
            options={NKWAPA_ANSWERS}
            labels={NKWAPA_ANSWER_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-fruit-veg')}
            label="Fruit or vegetables"
            value={values.lifestyle.fruitVegetables}
            onChange={(value) => updateLifestyle('fruitVegetables', value)}
            options={FREQUENCY_RARELY_SOME_MOST}
            labels={FREQUENCY_RARELY_SOME_MOST_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-sugary-drinks')}
            label="Sugar-sweetened drinks"
            value={values.lifestyle.sugarSweetenedDrinks}
            onChange={(value) => updateLifestyle('sugarSweetenedDrinks', value)}
            options={FREQUENCY_NEVER_SOMETIMES_DAILY}
            labels={FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-food-insecurity')}
            label="Difficulty obtaining healthy food"
            value={values.lifestyle.foodInsecurity}
            onChange={(value) => updateLifestyle('foodInsecurity', value)}
            options={FREQUENCY_NEVER_SOMETIMES_OFTEN}
            labels={FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-counselling')}
            label="Interested in nutrition counseling"
            value={values.lifestyle.wantsNutritionCounseling}
            onChange={(value) => updateLifestyle('wantsNutritionCounseling', value)}
            options={NKWAPA_ANSWERS}
            labels={NKWAPA_ANSWER_LABELS}
          />
          <NumberQuestion
            {...q('htn-lifestyle-active-days')}
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
            label="Typical activity"
            value={values.lifestyle.typicalActivity}
            onChange={(value) => updateLifestyle('typicalActivity', value)}
            options={PHYSICAL_ACTIVITY_TYPES}
            labels={PHYSICAL_ACTIVITY_TYPE_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-lifestyle-alcohol')}
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
      </FormSectionCard>

      <FormSectionCard title="7. Relevant medical history" titleAs="h2">
        <MultiChoiceQuestion
          {...q('htn-conditions')}
          label="Documented or patient-reported conditions"
          value={values.relevantConditions}
          onChange={(value) => update('relevantConditions', value)}
          options={CARDIOMETABOLIC_CONDITIONS}
          labels={CARDIOMETABOLIC_CONDITION_LABELS}
          exclusive={['NONE_KNOWN', 'UNSURE']}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('htn-pregnant-now')}
            label="Pregnant now"
            value={values.pregnantNow}
            onChange={(value) => update('pregnantNow', value)}
            options={NKWAPA_ANSWERS}
            labels={NKWAPA_ANSWER_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-planning-pregnancy')}
            label="Planning pregnancy within 12 months"
            value={values.planningPregnancy}
            onChange={(value) => update('planningPregnancy', value)}
            options={PREGNANCY_PLANNING_ANSWERS}
            labels={PREGNANCY_PLANNING_ANSWER_LABELS}
          />
        </div>
      </FormSectionCard>

      <FormSectionCard
        title="8. Essential screening status"
        titleAs="h2"
        description="Record what has been done. Do not decide what is indicated."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('htn-kidney-testing')}
            label="Kidney function testing in the past year"
            value={values.kidneyFunctionTesting}
            onChange={(value) => update('kidneyFunctionTesting', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-urine-protein')}
            label="Urine protein testing in the past year"
            value={values.urineProteinTesting}
            onChange={(value) => update('urineProteinTesting', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-cholesterol')}
            label="Cholesterol testing in the past year"
            value={values.cholesterolTesting}
            onChange={(value) => update('cholesterolTesting', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-ecg')}
            label="ECG previously completed"
            value={values.ecgCompleted}
            onChange={(value) => update('ecgCompleted', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-statin')}
            label="Statin"
            value={values.statinUse}
            onChange={(value) => update('statinUse', value)}
            options={MEDICATION_USE_STATUSES}
            labels={MEDICATION_USE_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('htn-aspirin')}
            label="Aspirin"
            value={values.aspirinUse}
            onChange={(value) => update('aspirinUse', value)}
            options={MEDICATION_USE_STATUSES}
            labels={MEDICATION_USE_STATUS_LABELS}
          />
        </div>
      </FormSectionCard>

      <FormSectionCard title="Guided plan" titleAs="h2">
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
      </FormSectionCard>

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
        </FormSectionCard>
      ) : null}

      {saveError ? <InlineNotice tone="error">{saveError}</InlineNotice> : null}
      {saveMessage ? <InlineNotice tone="success">{saveMessage}</InlineNotice> : null}

      {canEdit ? (
        <Button onClick={() => void handleSave().catch(() => undefined)} disabled={saving}>
          {saving ? 'Saving…' : 'Save assessment'}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">This assessment is read-only.</p>
      )}

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
