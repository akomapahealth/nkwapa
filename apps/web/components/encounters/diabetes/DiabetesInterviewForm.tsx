'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DIABETES_CLINICIAN_PLAN_ITEMS,
  DIABETES_CLINICIAN_PLAN_ITEM_LABELS,
  DIABETES_CONCERNS,
  DIABETES_CONCERN_LABELS,
  DIABETES_DISTRESS_RESPONSES,
  DIABETES_DISTRESS_RESPONSE_LABELS,
  DIABETES_ESCALATION_REASON_LABELS,
  DIABETES_GLUCOSE_CONTEXTS,
  DIABETES_GLUCOSE_CONTEXT_LABELS,
  DIABETES_INTERVIEW_SYMPTOMS,
  DIABETES_INTERVIEW_SYMPTOM_LABELS,
  DIABETES_REVIEW_REASONS,
  DIABETES_REVIEW_REASON_LABELS,
  DIABETES_STATUSES,
  DIABETES_STATUS_LABELS,
  DIABETES_TYPES,
  DIABETES_TYPE_LABELS,
  DIABETES_URGENT_SYMPTOMS,
  DIABETES_URGENT_SYMPTOM_LABELS,
  DIABETES_VOLUNTEER_ACTIONS,
  DIABETES_VOLUNTEER_ACTION_LABELS,
  FREQUENCY_NEVER_SOMETIMES_DAILY,
  FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS,
  FREQUENCY_NEVER_SOMETIMES_OFTEN,
  FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS,
  FREQUENCY_NEVER_SOMETIMES_USUALLY,
  FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS,
  FREQUENCY_RARELY_SOME_MOST,
  FREQUENCY_RARELY_SOME_MOST_LABELS,
  HBA1C_STATUSES,
  HBA1C_STATUS_LABELS,
  MEALS_PER_DAY_BANDS,
  MEALS_PER_DAY_BAND_LABELS,
  NKWAPA_ANSWERS,
  NKWAPA_ANSWER_LABELS,
  PHQ2_MAX_SCORE,
  PHQ2_RESPONSES,
  PHQ2_RESPONSE_LABELS,
  SCREENING_COMPLETION_STATUSES,
  SCREENING_COMPLETION_STATUS_LABELS,
  deriveDiabetesEscalation,
  evaluateDiabetesMentalHealth,
  evaluateGlucoseSuspicion,
  reviewReasonsForDiabetesEscalation,
} from '@nkwapa/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { FieldLabel, RequiredLegend, focusFirstInvalid } from '@/components/ui/field';
import { InlineNotice } from '@/components/ops/OpsShared';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { db, type DiabetesScreeningRecord } from '@/lib/db';
import { SYNC_OPERATION, enqueueOutboxMutation } from '@/lib/outbox';
import { claimEncounterRecord } from '@/lib/encounter-record';
import { useSeededFormValues } from '@/lib/use-seeded-form-values';
import { generateClinicalId } from '@/lib/clinical-measurements';
import {
  DIABETES_FIELD_ORDER,
  fromDiabetesRecord,
  toDiabetesPayload,
  validateDiabetesInterview,
  type ClinicalFieldErrors,
  type DiabetesInterviewValues,
} from '@/lib/diabetes-interview';
import { ClinicianPlanSection } from '@/components/encounters/ClinicianPlanSection';
import { MedicationAdherenceSection } from '@/components/encounters/MedicationAdherenceSection';
import { useMedicationAdherence } from '@/lib/use-medication-adherence';
import {
  CheckboxQuestion,
  ChoiceQuestion,
  DateQuestion,
  MultiChoiceQuestion,
  NumberQuestion,
  TextQuestion,
} from '@/components/encounters/hypertension/InterviewQuestion';

const SUSPICION_LABELS: Record<string, string> = {
  SUSPECTED: 'Above the threshold for this timing',
  NOT_SUSPECTED: 'Below the threshold for this timing',
  NOT_ASSESSED: 'Not classified',
};

interface DiabetesInterviewFormProps {
  clinicId: string;
  encounterId: string;
  /** Needed to read the reconciled medication list the adherence section asks about. */
  patientId: string;
  initialData?: Record<string, unknown> | null;
  canEdit?: boolean;
  /** Whether this actor holds `CAREPLAN.CLINICIAN_PLAN`. See the note on the plan section. */
  canRecordClinicianPlan?: boolean;
  onSaved?: () => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function DiabetesInterviewForm({
  clinicId,
  encounterId,
  patientId,
  initialData,
  canEdit = true,
  canRecordClinicianPlan = false,
  onSaved,
  saveRef,
}: DiabetesInterviewFormProps) {
  const [values, setValues] = useSeededFormValues(
    initialData?.id as string | undefined,
    initialData,
    fromDiabetesRecord,
  );
  const [errors, setErrors] = useState<ClinicalFieldErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const adherence = useMedicationAdherence(clinicId, encounterId, patientId, 'DIABETES', canEdit);
  const [saveError, setSaveError] = useState<string | null>(null);
  /*
    Say which of the two things happened.

    A clinic works offline routinely, so "saved" alone is ambiguous in the way that matters: a
    volunteer needs to know whether the record has reached the server or is still only on this
    laptop. The old form said so and the interview must not quietly drop that.
  */
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const { isOnline, syncNow } = useSync();

  const glucose = Number.parseInt(values.glucoseMgDl, 10);
  const glucoseValue = Number.isFinite(glucose) ? glucose : null;

  /*
    Derived live from the same functions the server recomputes on write.

    The volunteer sees the consequence of an answer while the patient is still in front of them;
    the server is the authority. Both call `@nkwapa/db`, so they cannot disagree.
  */
  const suspicion = evaluateGlucoseSuspicion(glucoseValue, values.glucoseType as never);
  const mentalHealth = evaluateDiabetesMentalHealth({
    phq2Interest: values.phq2Interest as never,
    phq2Mood: values.phq2Mood as never,
    distressOverwhelmed: values.distressOverwhelmed as never,
    distressFailing: values.distressFailing as never,
  });
  const escalation = deriveDiabetesEscalation({
    urgentSymptoms: values.urgentSymptoms as never,
    currentFootWound: values.currentFootWound as never,
    glucoseMgDl: glucoseValue,
    glucoseContext: values.glucoseType as never,
  });

  const update = useCallback(
    <K extends keyof DiabetesInterviewValues>(key: K, value: DiabetesInterviewValues[K]) => {
      setValues((current) => {
        const next = { ...current, [key]: value };
        setErrors((currentErrors) =>
          hasSubmitted ? validateDiabetesInterview(next) : currentErrors,
        );
        return next;
      });
    },
    [hasSubmitted, setValues],
  );

  const updateNutrition = useCallback(
    (key: keyof DiabetesInterviewValues['nutrition'], value: unknown) => {
      setValues((current) => {
        const next = { ...current, nutrition: { ...current.nutrition, [key]: value } };
        setErrors((currentErrors) =>
          hasSubmitted ? validateDiabetesInterview(next) : currentErrors,
        );
        return next;
      });
    },
    [hasSubmitted, setValues],
  );

  /* Preselect the implied review reasons visibly and reversibly. */
  const applyReviewReasons = useCallback(
    (implied: readonly string[]) => {
      if (!implied.length) return;
      update('reviewReasons', [
        ...values.reviewReasons.filter((reason) => reason !== 'ROUTINE_REVIEW_ONLY'),
        ...implied.filter((reason) => !values.reviewReasons.includes(reason)),
      ]);
      update('clinicianReviewRequested', true);
    },
    [update, values.reviewReasons],
  );

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    setHasSubmitted(true);
    const found = validateDiabetesInterview(values);
    setErrors(found);
    /*
      Both halves are validated before either is written, so a failure on one does not leave the
      other saved. See the same note on the hypertension form.
    */
    const adherenceErrors = adherence.validate();
    if (Object.keys(found).length) {
      focusFirstInvalid(found, [...DIABETES_FIELD_ORDER]);
      throw new Error('Check the highlighted answers before saving.');
    }
    if (Object.keys(adherenceErrors).length) {
      throw new Error('Check the highlighted medication answers before saving.');
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const claimed = await claimEncounterRecord(
        db.diabetes_screenings,
        encounterId,
        generateClinicalId,
      );
      const now = new Date().toISOString();
      const payload = {
        encounterId,
        clinicId,
        ...toDiabetesPayload(values, claimed.createdAt ?? now),
      };

      const record: DiabetesScreeningRecord = {
        ...(payload as unknown as DiabetesScreeningRecord),
        id: claimed.id,
        clinicId,
        encounterId,
        // Cached so the interview can show the consequence offline; the server recomputes.
        derivedSuspicion: suspicion,
        phq2Total: mentalHealth.phq2Total,
        phq2Positive: mentalHealth.phq2Positive,
        distressPositive: mentalHealth.distressPositive,
        urgentReviewRequired: escalation.urgentReviewRequired,
        urgentReviewReasons: [...escalation.reasons],
        createdAt: claimed.createdAt ?? now,
        updatedAt: now,
      };

      await db.diabetes_screenings.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'diabetes_screening',
        entityId: claimed.id,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: payload,
      });
      // Queued before the sync pass, so one drain carries the screening and its adherence set.
      await adherence.save();
      const synced = isOnline ? await syncNow(clinicId) : null;
      setSaveMessage(
        synced?.success
          ? 'Diabetes screening saved and synced.'
          : 'Diabetes screening saved on this device and pending sync.',
      );
      onSaved?.();
    } catch (error) {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : 'Failed to save the screening.');
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
    suspicion,
    mentalHealth,
    escalation,
    onSaved,
    isOnline,
    adherence,
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
  // A screening completed in the future is a typo, not an answer.
  const today = new Date().toISOString().slice(0, 10);
  const monitorsAtHome = values.homeGlucoseMonitoring === 'YES';

  return (
    <div className="space-y-4">
      {canEdit ? <RequiredLegend /> : null}

      <FormSectionCard title="1. Diabetes history" titleAs="h2">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('dm-status')}
            label="Diabetes status"
            value={values.diabetesStatus}
            onChange={(value) => update('diabetesStatus', value)}
            options={DIABETES_STATUSES}
            labels={DIABETES_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-type')}
            label="Diabetes type"
            value={values.diabetesType}
            onChange={(value) => update('diabetesType', value)}
            options={DIABETES_TYPES}
            labels={DIABETES_TYPE_LABELS}
          />
          <NumberQuestion
            {...q('dm-year-diagnosed')}
            label="Year diagnosed"
            value={values.yearDiagnosed}
            onChange={(value) => update('yearDiagnosed', value)}
            placeholder="e.g. 2018"
            disabled={shared.disabled || values.yearDiagnosedUnknown}
          />
          <div className="flex items-end pb-6">
            <CheckboxQuestion
              id="dm-year-unknown"
              label="Year unknown"
              checked={values.yearDiagnosedUnknown}
              onChange={(checked) => update('yearDiagnosedUnknown', checked)}
              disabled={shared.disabled}
            />
          </div>
        </div>
        <ChoiceQuestion
          {...q('dm-main-concern')}
          label="Main concern today"
          value={values.mainConcern}
          onChange={(value) => update('mainConcern', value)}
          options={DIABETES_CONCERNS}
          labels={DIABETES_CONCERN_LABELS}
        />
        {values.mainConcern === 'OTHER' ? (
          <TextQuestion
            {...q('dm-main-concern-other')}
            label="Describe the concern"
            required
            value={values.mainConcernOther}
            onChange={(value) => update('mainConcernOther', value)}
            maxLength={200}
          />
        ) : null}
      </FormSectionCard>

      <FormSectionCard title="2. Diabetes control" titleAs="h2">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberQuestion
            {...q('dm-glucose')}
            label="Today's glucose (mg/dL)"
            value={values.glucoseMgDl}
            onChange={(value) => update('glucoseMgDl', value)}
          />
          <ChoiceQuestion
            {...q('dm-glucose-timing')}
            label="When was the sample taken?"
            value={values.glucoseType}
            onChange={(value) => update('glucoseType', value)}
            options={DIABETES_GLUCOSE_CONTEXTS}
            labels={DIABETES_GLUCOSE_CONTEXT_LABELS}
          />
        </div>
        {glucoseValue !== null ? (
          <p className="text-sm text-muted-foreground">
            Threshold result: <span className="font-medium">{SUSPICION_LABELS[suspicion]}</span>
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('dm-hba1c-status')}
            label="Most recent HbA1c"
            value={values.hba1cStatus}
            onChange={(value) => update('hba1cStatus', value)}
            options={HBA1C_STATUSES}
            labels={HBA1C_STATUS_LABELS}
          />
          {values.hba1cStatus === 'VALUE_KNOWN' ? (
            <>
              <NumberQuestion
                {...q('dm-hba1c')}
                label="HbA1c (%)"
                value={values.hba1cPercent}
                onChange={(value) => update('hba1cPercent', value)}
              />
              <div className="space-y-2">
                <FieldLabel htmlFor="dm-hba1c-date">Date taken</FieldLabel>
                <Input
                  id="dm-hba1c-date"
                  type="date"
                  value={values.hba1cMeasuredOn}
                  onChange={(event) => update('hba1cMeasuredOn', event.target.value)}
                  disabled={shared.disabled}
                />
              </div>
            </>
          ) : null}
        </div>

        <ChoiceQuestion
          {...q('dm-home-monitoring')}
          label="Checks glucose at home"
          value={values.homeGlucoseMonitoring}
          onChange={(value) => update('homeGlucoseMonitoring', value)}
          options={NKWAPA_ANSWERS}
          labels={NKWAPA_ANSWER_LABELS}
        />
        {monitorsAtHome ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberQuestion
              {...q('dm-home-low')}
              label="Usual lowest reading (mg/dL)"
              value={values.homeGlucoseLowMgDl}
              onChange={(value) => update('homeGlucoseLowMgDl', value)}
            />
            <NumberQuestion
              {...q('dm-home-high')}
              label="Usual highest reading (mg/dL)"
              value={values.homeGlucoseHighMgDl}
              onChange={(value) => update('homeGlucoseHighMgDl', value)}
            />
          </div>
        ) : null}

        <MultiChoiceQuestion
          {...q('dm-symptoms')}
          label="Symptoms within the past month"
          value={values.symptoms}
          onChange={(value) => update('symptoms', value)}
          options={DIABETES_INTERVIEW_SYMPTOMS}
          labels={DIABETES_INTERVIEW_SYMPTOM_LABELS}
          exclusive={['NONE']}
        />

        {/*
          Asked separately from the list above, and about a different period.

          The clinical specification names these as requiring immediate review while listing none
          of them except the wound in its own checklist -- and that checklist is a recall question.
        */}
        <MultiChoiceQuestion
          {...q('dm-urgent-symptoms')}
          label="Happening right now"
          hint="Ask about this moment, not the past month."
          value={values.urgentSymptoms}
          onChange={(value) => update('urgentSymptoms', value)}
          options={DIABETES_URGENT_SYMPTOMS}
          labels={DIABETES_URGENT_SYMPTOM_LABELS}
          exclusive={['NONE']}
        />

        {escalation.urgentReviewRequired ? (
          <InlineNotice tone="error">
            <span className="block font-medium">This visit needs a clinician now.</span>
            <span className="block">
              {escalation.reasons
                .map((reason) => DIABETES_ESCALATION_REASON_LABELS[reason])
                .join(' · ')}
            </span>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => applyReviewReasons(reviewReasonsForDiabetesEscalation(escalation))}
              >
                Add to the reasons for clinician review
              </Button>
            ) : null}
          </InlineNotice>
        ) : null}
      </FormSectionCard>

      <FormSectionCard
        title="3. Medications and adherence"
        titleAs="h2"
        description="The medications come from the reconciled list on the Medications tab and are read-only here. Record only what was observed today."
      >
        <MedicationAdherenceSection
          context="DIABETES"
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
        <InlineNotice tone="info" live={false}>
          Document what the patient takes and any barriers. Do not recommend medication changes.
        </InlineNotice>
      </FormSectionCard>

      <FormSectionCard title="4. Nutrition" titleAs="h2">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('dm-nutrition-meals')}
            label="Meals per day"
            value={values.nutrition.mealsPerDay}
            onChange={(value) => updateNutrition('mealsPerDay', value)}
            options={MEALS_PER_DAY_BANDS}
            labels={MEALS_PER_DAY_BAND_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-nutrition-skips')}
            label="Frequently skips meals"
            value={values.nutrition.skipsMeals}
            onChange={(value) => updateNutrition('skipsMeals', value)}
            options={NKWAPA_ANSWERS}
            labels={NKWAPA_ANSWER_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-nutrition-sugary-drinks')}
            label="Sugar-sweetened drinks"
            value={values.nutrition.sugarSweetenedDrinks}
            onChange={(value) => updateNutrition('sugarSweetenedDrinks', value)}
            options={FREQUENCY_NEVER_SOMETIMES_DAILY}
            labels={FREQUENCY_NEVER_SOMETIMES_DAILY_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-nutrition-adds-sugar')}
            label="Adds sugar to food or drinks"
            value={values.nutrition.addsSugar}
            onChange={(value) => updateNutrition('addsSugar', value)}
            options={FREQUENCY_NEVER_SOMETIMES_USUALLY}
            labels={FREQUENCY_NEVER_SOMETIMES_USUALLY_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-nutrition-fruit-veg')}
            label="Fruit or vegetables"
            value={values.nutrition.fruitVegetables}
            onChange={(value) => updateNutrition('fruitVegetables', value)}
            options={FREQUENCY_RARELY_SOME_MOST}
            labels={FREQUENCY_RARELY_SOME_MOST_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-nutrition-food-insecurity')}
            label="Difficulty obtaining enough healthy food"
            value={values.nutrition.foodInsecurity}
            onChange={(value) => updateNutrition('foodInsecurity', value)}
            options={FREQUENCY_NEVER_SOMETIMES_OFTEN}
            labels={FREQUENCY_NEVER_SOMETIMES_OFTEN_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-nutrition-counselling')}
            label="Interested in nutrition counseling"
            value={values.nutrition.wantsNutritionCounseling}
            onChange={(value) => updateNutrition('wantsNutritionCounseling', value)}
            options={NKWAPA_ANSWERS}
            labels={NKWAPA_ANSWER_LABELS}
          />
        </div>
      </FormSectionCard>

      <FormSectionCard
        title="5. Mental health and diabetes distress"
        titleAs="h2"
        description="Over the past two weeks, how often has the patient experienced:"
      >
        <ChoiceQuestion
          {...q('dm-phq2-interest')}
          label="Little interest or pleasure in doing things?"
          value={values.phq2Interest}
          onChange={(value) => update('phq2Interest', value)}
          options={PHQ2_RESPONSES}
          labels={PHQ2_RESPONSE_LABELS}
        />
        <ChoiceQuestion
          {...q('dm-phq2-mood')}
          label="Feeling down, depressed, or hopeless?"
          value={values.phq2Mood}
          onChange={(value) => update('phq2Mood', value)}
          options={PHQ2_RESPONSES}
          labels={PHQ2_RESPONSE_LABELS}
        />
        {/*
          The score appears only once both items are answered.

          A running total over one answer reads as a completed screen sitting halfway to the
          cut-off, which is exactly the misreading the nullable column exists to prevent.
        */}
        {mentalHealth.phq2Total !== null ? (
          <p className="text-sm">
            PHQ-2 score:{' '}
            <span className="font-medium">
              {mentalHealth.phq2Total} / {PHQ2_MAX_SCORE}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            The score appears once both questions are answered.
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          During the past month, how much has the patient been bothered by:
        </p>
        <ChoiceQuestion
          {...q('dm-distress-overwhelmed')}
          label="Feeling overwhelmed by living with diabetes"
          value={values.distressOverwhelmed}
          onChange={(value) => update('distressOverwhelmed', value)}
          options={DIABETES_DISTRESS_RESPONSES}
          labels={DIABETES_DISTRESS_RESPONSE_LABELS}
        />
        <ChoiceQuestion
          {...q('dm-distress-failing')}
          label="Feeling that they are failing with their diabetes routine"
          value={values.distressFailing}
          onChange={(value) => update('distressFailing', value)}
          options={DIABETES_DISTRESS_RESPONSES}
          labels={DIABETES_DISTRESS_RESPONSE_LABELS}
        />

        {mentalHealth.reviewReasons.length ? (
          <InlineNotice tone="warning">
            <span className="block font-medium">
              This screen should be reviewed by a clinician.
            </span>
            <span className="block">
              {mentalHealth.reviewReasons
                .map((reason) => DIABETES_REVIEW_REASON_LABELS[reason])
                .join(' · ')}
            </span>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => applyReviewReasons(mentalHealth.reviewReasons)}
              >
                Add to the reasons for clinician review
              </Button>
            ) : null}
          </InlineNotice>
        ) : null}
      </FormSectionCard>

      <FormSectionCard
        title="6. Essential screening status"
        titleAs="h2"
        description="Record what has been done. A detailed foot examination is not expected without competency-based training."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceQuestion
            {...q('dm-eye-exam')}
            label="Eye examination within the past year"
            value={values.eyeExam}
            onChange={(value) => update('eyeExam', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          {values.eyeExam === 'COMPLETED' ? (
            <DateQuestion
              {...q('dm-eye-exam-completed-on')}
              label="Date of the eye examination"
              hint="Leave blank if the patient is not sure when."
              max={today}
              value={values.eyeExamCompletedOn ?? ''}
              onChange={(value) => update('eyeExamCompletedOn', value || null)}
            />
          ) : null}
          <ChoiceQuestion
            {...q('dm-foot-exam')}
            label="Foot examination within the past year"
            value={values.footExam}
            onChange={(value) => update('footExam', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          {values.footExam === 'COMPLETED' ? (
            <DateQuestion
              {...q('dm-foot-exam-completed-on')}
              label="Date of the foot examination"
              hint="Leave blank if the patient is not sure when."
              max={today}
              value={values.footExamCompletedOn ?? ''}
              onChange={(value) => update('footExamCompletedOn', value || null)}
            />
          ) : null}
          <ChoiceQuestion
            {...q('dm-kidney-testing')}
            label="Kidney testing within the past year"
            value={values.kidneyTesting}
            onChange={(value) => update('kidneyTesting', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          {values.kidneyTesting === 'COMPLETED' ? (
            <DateQuestion
              {...q('dm-kidney-testing-completed-on')}
              label="Date of the kidney testing"
              hint="Leave blank if the patient is not sure when."
              max={today}
              value={values.kidneyTestingCompletedOn ?? ''}
              onChange={(value) => update('kidneyTestingCompletedOn', value || null)}
            />
          ) : null}
          <ChoiceQuestion
            {...q('dm-bp-checked')}
            label="Blood pressure checked today"
            value={values.bpCheckedToday}
            onChange={(value) => update('bpCheckedToday', value)}
            options={SCREENING_COMPLETION_STATUSES}
            labels={SCREENING_COMPLETION_STATUS_LABELS}
          />
          <ChoiceQuestion
            {...q('dm-foot-wound')}
            label="Current foot wound"
            value={values.currentFootWound}
            onChange={(value) => update('currentFootWound', value)}
            options={NKWAPA_ANSWERS}
            labels={NKWAPA_ANSWER_LABELS}
          />
        </div>
      </FormSectionCard>

      <FormSectionCard title="Guided plan" titleAs="h2">
        <MultiChoiceQuestion
          {...q('dm-volunteer-actions')}
          label="Actions completed"
          value={values.volunteerActions}
          onChange={(value) => update('volunteerActions', value)}
          options={DIABETES_VOLUNTEER_ACTIONS}
          labels={DIABETES_VOLUNTEER_ACTION_LABELS}
          exclusive={['NO_INTERVENTION_COMPLETED']}
        />
        <MultiChoiceQuestion
          {...q('dm-review-reasons')}
          label="Reason for clinician review"
          value={values.reviewReasons}
          onChange={(value) => update('reviewReasons', value)}
          options={DIABETES_REVIEW_REASONS}
          labels={DIABETES_REVIEW_REASON_LABELS}
          exclusive={['ROUTINE_REVIEW_ONLY']}
        />
        {values.reviewReasons.includes('OTHER') ? (
          <TextQuestion
            {...q('dm-review-reason-other')}
            label="Describe the reason"
            required
            value={values.reviewReasonOther}
            onChange={(value) => update('reviewReasonOther', value)}
            maxLength={200}
          />
        ) : null}
        <div className="space-y-2">
          <FieldLabel htmlFor="dm-notes">Notes</FieldLabel>
          <Textarea
            id="dm-notes"
            value={values.notes}
            onChange={(event) => update('notes', event.target.value)}
            disabled={shared.disabled}
            maxLength={2000}
            rows={3}
          />
        </div>
        <InlineNotice tone="info" live={false}>
          Do not recommend medication changes. Record what the patient takes in section 3.
        </InlineNotice>
      </FormSectionCard>

      {saveError ? <InlineNotice tone="error">{saveError}</InlineNotice> : null}
      {saveMessage ? <InlineNotice tone="success">{saveMessage}</InlineNotice> : null}

      {canEdit ? (
        <Button onClick={() => void handleSave().catch(() => undefined)} disabled={saving}>
          {saving ? 'Saving…' : 'Save screening'}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">This screening is read-only.</p>
      )}

      {canRecordClinicianPlan ? (
        <ClinicianPlanSection
          clinicId={clinicId}
          encounterId={encounterId}
          endpoint="diabetes-screening"
          planItems={DIABETES_CLINICIAN_PLAN_ITEMS}
          planItemLabels={DIABETES_CLINICIAN_PLAN_ITEM_LABELS}
          initialPlan={initialData?.clinicianPlan as Record<string, unknown> | null}
          canEdit={canEdit}
          onSaved={onSaved}
          idPrefix="dm"
        />
      ) : null}
    </div>
  );
}
