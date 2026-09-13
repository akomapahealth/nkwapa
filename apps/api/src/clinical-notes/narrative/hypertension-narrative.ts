import {
  BP_AFFECTING_SUBSTANCE_LABELS,
  CARDIOMETABOLIC_CONDITION_LABELS,
  FOLLOW_UP_OWNER_LABELS,
  FOLLOW_UP_WINDOW_LABELS,
  HOME_BP_CHECK_FREQUENCY_LABELS,
  HOME_BP_MONITOR_STATUS_LABELS,
  HOME_BP_SOURCE_LABELS,
  HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS,
  HYPERTENSION_CONCERN_LABELS,
  HYPERTENSION_ESCALATION_REASON_LABELS,
  HYPERTENSION_REVIEW_REASON_LABELS,
  HYPERTENSION_STATUS_LABELS,
  HYPERTENSION_SYMPTOM_LABELS,
  HYPERTENSION_VOLUNTEER_ACTION_LABELS,
  MEDICATION_USE_STATUS_LABELS,
  SCREENING_COMPLETION_STATUS_LABELS,
  parseHypertensionLifestyle,
} from '@nkwapa/db';
import {
  NOT_RECORDED,
  arr,
  bool,
  num,
  selected,
  str,
  bloodPressure,
  labelled,
  list,
  lower,
  paragraph,
  section,
  value,
} from './narrative-text';
import type { HapSections, NarrativeInput } from './narrative-types';

const CLASSIFICATION_LABELS: Record<string, string> = {
  NORMAL: 'normal',
  ELEVATED: 'elevated',
  STAGE1: 'stage 1 hypertension',
  STAGE2: 'stage 2 hypertension',
  CRISIS: 'hypertensive crisis range',
  UNKNOWN: 'not classified',
};

/**
 * Render the hypertension interview as prose, for the History, Assessment and Plan sections.
 *
 * Deterministic by construction: no locale formatting, no clock, no randomness, and a fixed
 * paragraph order. The output is edited by a clinician and then signed, and a signed note is
 * hashed, so a generator whose output moved between renders would make an unedited note look
 * altered.
 *
 * The clinical specification's "Reviewed by / Date and time" trailer is deliberately absent.
 * `ClinicalNote` records the cosigner and the time in columns and hashes the signed body; a name
 * written into the text is a second copy that can disagree with the columns attesting it.
 */
export function renderHypertensionNarrative(input: NarrativeInput): HapSections {
  const a = input.assessment;
  const lifestyle = parseHypertensionLifestyle(a.lifestyle ?? null).payload;

  const status = lower(HYPERTENSION_STATUS_LABELS, a.hypertensionStatus);
  const diagnosedIn = bool(a.yearDiagnosedUnknown)
    ? 'an unknown year'
    : value(num(a.yearDiagnosed) ?? str(a.yearDiagnosed));
  const facility =
    a.usualCareFacilityStatus === 'SELECTED'
      ? value(num(a.usualCareFacility) ?? str(a.usualCareFacility))
      : a.usualCareFacilityStatus === 'NONE'
        ? 'no regular facility'
        : NOT_RECORDED;

  const reasonForVisit = paragraph(
    'Reason for visit',
    `${input.patientName} was seen for a hypertension follow-up. The patient has ${status}, ` +
      `diagnosed in ${diagnosedIn}, and usually receives care at ${facility}. ` +
      `The patient's main concern today was ${lower(HYPERTENSION_CONCERN_LABELS, a.mainConcern)}` +
      `${a.mainConcern === 'OTHER' && a.mainConcernOther ? ` (${str(a.mainConcernOther)})` : ''}.`,
  );

  const initial = bloodPressure(input.vitals?.systolicBp, input.vitals?.diastolicBp);
  const repeat = bloodPressure(num(a.repeatSystolicBp), num(a.repeatDiastolicBp));
  const homeAverage = bloodPressure(num(a.homeSystolicAvg), num(a.homeDiastolicAvg));
  const bloodPressureParagraph = paragraph(
    'Blood pressure',
    `Initial blood pressure was ${initial} with a pulse of ${value(input.vitals?.pulseBpm)}. ` +
      (repeat === NOT_RECORDED
        ? 'No repeat measurement was recorded. '
        : `After a period of rest, repeat blood pressure was ${repeat}. `) +
      `Home monitoring: ${lower(HOME_BP_MONITOR_STATUS_LABELS, a.homeMonitorStatus)}, ` +
      `checked ${lower(HOME_BP_CHECK_FREQUENCY_LABELS, a.homeCheckFrequency)}. ` +
      (bool(a.homeReadingsUnknown)
        ? 'Home readings are not known.'
        : `Reported home readings average ${homeAverage}, based on ${lower(HOME_BP_SOURCE_LABELS, a.homeReadingSource)}.`),
  );

  const symptoms = labelled(arr(a.currentSymptoms), HYPERTENSION_SYMPTOM_LABELS);
  const symptomsParagraph = paragraph(
    'Symptoms',
    symptoms.length
      ? `The patient reported ${list(symptoms).toLowerCase()}.`
      : 'No symptoms were recorded.',
  );

  const substances = labelled(arr(a.contributingSubstances), BP_AFFECTING_SUBSTANCE_LABELS);
  const contributors = paragraph(
    'Potential contributors',
    substances.length
      ? `The patient reported using ${list(substances).toLowerCase()}.`
      : 'No contributing substances were recorded.',
  );

  const lifestyleParagraph = paragraph(
    'Nutrition and lifestyle',
    `The patient adds salt during cooking ${lifestyle.saltDuringCooking.toLowerCase()} and at the table ` +
      `${lifestyle.saltAtTable.toLowerCase()}. Fruit or vegetables are consumed ` +
      `${lifestyle.fruitVegetables.replace(/_/g, ' ').toLowerCase()}. ` +
      `Difficulty obtaining healthy food: ${lifestyle.foodInsecurity.toLowerCase()}. ` +
      `The patient is physically active ${value(lifestyle.activeDaysPerWeek)} days per week. ` +
      `Alcohol use is ${lifestyle.alcoholUse.toLowerCase()}. ` +
      'Tobacco use is recorded with this visit’s vitals.',
  );

  const conditions = labelled(arr(a.relevantConditions), CARDIOMETABOLIC_CONDITION_LABELS);
  const screening = paragraph(
    'Relevant history and screening',
    `Relevant conditions include ${list(conditions, 'none recorded').toLowerCase()}. ` +
      `Kidney-function testing is ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.kidneyFunctionTesting)}, ` +
      `urine protein testing is ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.urineProteinTesting)}, ` +
      `cholesterol testing is ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.cholesterolTesting)}, ` +
      `and prior ECG is ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.ecgCompleted)}. ` +
      `Statin: ${lower(MEDICATION_USE_STATUS_LABELS, a.statinUse)}. ` +
      `Aspirin: ${lower(MEDICATION_USE_STATUS_LABELS, a.aspirinUse)}.`,
  );

  const medications = input.medications ?? [];
  const medicationsParagraph = paragraph(
    'Medications',
    medications.length
      ? `Current blood-pressure medications include ${list(medications)}.`
      : 'No blood-pressure medications were recorded for this visit.',
  );

  /*
    The derivation is stated with the reading it came from.

    A classification on its own reads as a clinician's judgement. Naming the measurement it was
    computed from is what lets a reviewer disagree with it.
  */
  const derived = lower(CLASSIFICATION_LABELS, a.derivedClassification);
  const recorded = lower(CLASSIFICATION_LABELS, a.classification);
  const assessmentParagraph = paragraph(
    'Blood pressure classification',
    `Today's reading of ${initial} is ${derived} under the clinic's thresholds.` +
      (bool(a.classificationOverridden)
        ? ` The supervising clinician recorded ${recorded} instead.`
        : ''),
  );

  const escalation = labelled(arr(a.urgentReviewReasons), HYPERTENSION_ESCALATION_REASON_LABELS);
  const escalationParagraph = bool(a.urgentReviewRequired)
    ? paragraph(
        'Immediate clinician review',
        `This visit was flagged for immediate review: ${list(escalation).toLowerCase()}.`,
      )
    : null;

  const actions = labelled(selected(a.volunteerActions), HYPERTENSION_VOLUNTEER_ACTION_LABELS);
  const reviewReasons = labelled(arr(a.reviewReasons), HYPERTENSION_REVIEW_REASON_LABELS);
  const volunteerParagraph = paragraph(
    'Actions completed by the volunteer team',
    `${list(actions, 'No interventions were recorded')}.` +
      (reviewReasons.length
        ? ` Clinician review was requested for: ${list(reviewReasons).toLowerCase()}.`
        : ''),
  );

  const plan = input.clinicianPlan;
  const planParagraph = plan
    ? paragraph(
        'Supervising clinician assessment and plan',
        `Blood-pressure goal: ${bloodPressure(plan.bpGoalSystolic, plan.bpGoalDiastolic)}. ` +
          `Plan: ${list(labelled(plan.items, HYPERTENSION_CLINICIAN_PLAN_ITEM_LABELS), 'none recorded').toLowerCase()}. ` +
          `Additional comments: ${value(plan.comments)}.`,
      )
    : null;

  const followUp = plan
    ? paragraph(
        'Follow-up',
        `Follow-up is planned ${lower(FOLLOW_UP_WINDOW_LABELS, plan.followUpWindow)} ` +
          `with ${lower(FOLLOW_UP_OWNER_LABELS, plan.followUpOwner)}.`,
      )
    : null;

  return {
    history: section([
      reasonForVisit,
      bloodPressureParagraph,
      symptomsParagraph,
      medicationsParagraph,
      contributors,
      lifestyleParagraph,
      screening,
    ]),
    assessment: section([assessmentParagraph, escalationParagraph]),
    plan: section([volunteerParagraph, planParagraph, followUp]),
  };
}
