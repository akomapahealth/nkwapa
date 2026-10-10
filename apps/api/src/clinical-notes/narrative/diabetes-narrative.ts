import {
  DIABETES_CLINICIAN_PLAN_ITEM_LABELS,
  DIABETES_CONCERN_LABELS,
  DIABETES_DISTRESS_RESPONSE_LABELS,
  DIABETES_ESCALATION_REASON_LABELS,
  DIABETES_GLUCOSE_CONTEXT_LABELS,
  DIABETES_INTERVIEW_SYMPTOM_LABELS,
  DIABETES_REVIEW_REASON_LABELS,
  DIABETES_STATUS_LABELS,
  DIABETES_TYPE_LABELS,
  DIABETES_URGENT_SYMPTOM_LABELS,
  DIABETES_VOLUNTEER_ACTION_LABELS,
  FOLLOW_UP_OWNER_LABELS,
  FOLLOW_UP_WINDOW_LABELS,
  PHQ2_MAX_SCORE,
  SCREENING_COMPLETION_STATUS_LABELS,
  parseDiabetesNutrition,
} from '@nkwapa/db';
import {
  NOT_RECORDED,
  arr,
  bool,
  num,
  selected,
  str,
  isoDay,
  labelled,
  list,
  lower,
  paragraph,
  section,
  value,
} from './narrative-text';
import type { HapSections, NarrativeInput } from './narrative-types';

const SUSPICION_SENTENCES: Record<string, string> = {
  SUSPECTED: 'is at or above the threshold for that timing',
  NOT_SUSPECTED: 'is below the threshold for that timing',
  NOT_ASSESSED: 'cannot be classified without a measurement timing',
};

/**
 * Render the diabetes interview as prose. See `hypertension-narrative.ts` for the determinism and
 * attribution rules; both generators follow them.
 */
export function renderDiabetesNarrative(input: NarrativeInput): HapSections {
  const a = input.assessment;
  const nutrition = parseDiabetesNutrition(a.nutrition ?? null).payload;

  const diagnosedIn = bool(a.yearDiagnosedUnknown)
    ? 'an unknown year'
    : value(num(a.yearDiagnosed) ?? str(a.yearDiagnosed));
  const reasonForVisit = paragraph(
    'Reason for visit',
    `${input.patientName} was seen for a diabetes follow-up. The patient has ` +
      `${lower(DIABETES_STATUS_LABELS, a.diabetesStatus)} (${lower(DIABETES_TYPE_LABELS, a.diabetesType)}), ` +
      `diagnosed in ${diagnosedIn}. The patient's main concern today was ` +
      `${lower(DIABETES_CONCERN_LABELS, a.mainConcern)}` +
      `${a.mainConcern === 'OTHER' && a.mainConcernOther ? ` (${str(a.mainConcernOther)})` : ''}.`,
  );

  const hba1c =
    a.hba1cStatus === 'VALUE_KNOWN'
      ? `${value(num(a.hba1cPercent) ?? str(a.hba1cPercent))}% on ${isoDay(a.hba1cMeasuredOn)}`
      : lower(
          { UNKNOWN: 'unknown', NEVER_CHECKED: 'never checked', NOT_ASSESSED: NOT_RECORDED },
          a.hba1cStatus,
        );

  const control = paragraph(
    'Diabetes control',
    `Today's capillary blood glucose was ${value(num(a.glucoseMgDl) ?? str(a.glucoseMgDl))} mg/dL, measured ` +
      `${lower(DIABETES_GLUCOSE_CONTEXT_LABELS, a.glucoseType)}. The most recent HbA1c was ${hba1c}. ` +
      (a.homeGlucoseMonitoring === 'YES'
        ? `The patient monitors blood glucose at home; reported readings range from ${value(num(a.homeGlucoseLowMgDl) ?? str(a.homeGlucoseLowMgDl))} to ${value(num(a.homeGlucoseHighMgDl) ?? str(a.homeGlucoseHighMgDl))} mg/dL.`
        : 'The patient does not monitor blood glucose at home.'),
  );

  const pastMonth = labelled(arr(a.symptoms), DIABETES_INTERVIEW_SYMPTOM_LABELS);
  const rightNow = labelled(arr(a.urgentSymptoms), DIABETES_URGENT_SYMPTOM_LABELS);
  /*
    The two lists are rendered as two sentences about two periods.

    Collapsing them would lose the distinction the record exists to keep: a foot wound last month
    and an open wound now are different facts, and only the second one stops a visit.
  */
  const symptoms = paragraph(
    'Symptoms',
    `During the past month, the patient reported ${list(pastMonth, 'no diabetes-related symptoms').toLowerCase()}. ` +
      `At the time of the visit: ${list(rightNow, 'nothing reported').toLowerCase()}.`,
  );

  const medications = input.medications ?? [];
  const medicationsParagraph = paragraph(
    'Medications',
    medications.length
      ? `Current diabetes medications include ${list(medications)}.`
      : 'No diabetes medications were recorded for this visit.',
  );

  const nutritionParagraph = paragraph(
    'Nutrition',
    `The patient typically eats ${nutrition.mealsPerDay.replace(/_/g, ' ').toLowerCase()} meals per day and ` +
      `${nutrition.skipsMeals === 'YES' ? 'does' : 'does not'} frequently skip meals. ` +
      `Sugar-sweetened beverages are consumed ${nutrition.sugarSweetenedDrinks.toLowerCase()}, and sugar is added ` +
      `to food or drinks ${nutrition.addsSugar.toLowerCase()}. Fruit or vegetables are consumed ` +
      `${nutrition.fruitVegetables.replace(/_/g, ' ').toLowerCase()}. Difficulty obtaining healthy food: ` +
      `${nutrition.foodInsecurity.toLowerCase()}.`,
  );

  /*
    An incomplete screen is described as incomplete.

    Rendering a null total as 0 would put a completed negative screen into the record for a
    question nobody finished asking.
  */
  const phq2 =
    num(a.phq2Total) !== null
      ? `PHQ-2 score was ${num(a.phq2Total)}/${PHQ2_MAX_SCORE}.`
      : 'The PHQ-2 screen was not completed.';
  const mentalHealth = paragraph(
    'Mental health and diabetes distress',
    `${phq2} Diabetes-distress screening was ${bool(a.distressPositive) ? 'positive' : 'negative'}: ` +
      `feeling overwhelmed, ${lower(DIABETES_DISTRESS_RESPONSE_LABELS, a.distressOverwhelmed)}; ` +
      `feeling of failing the routine, ${lower(DIABETES_DISTRESS_RESPONSE_LABELS, a.distressFailing)}.`,
  );

  const preventive = paragraph(
    'Preventive care',
    `Eye examination: ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.eyeExam)}. ` +
      `Foot examination: ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.footExam)}. ` +
      `Kidney screening: ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.kidneyTesting)}. ` +
      `Blood pressure checked today: ${lower(SCREENING_COMPLETION_STATUS_LABELS, a.bpCheckedToday)}. ` +
      `Current foot wound: ${lower({ YES: 'yes', NO: 'no', UNSURE: 'unsure', NOT_ASSESSED: NOT_RECORDED }, a.currentFootWound)}.`,
  );

  const assessmentParagraph = paragraph(
    'Glucose assessment',
    `Today's reading of ${value(num(a.glucoseMgDl) ?? str(a.glucoseMgDl))} mg/dL, measured ` +
      `${lower(DIABETES_GLUCOSE_CONTEXT_LABELS, a.glucoseType)}, ` +
      `${SUSPICION_SENTENCES[str(a.derivedSuspicion) ?? ''] ?? SUSPICION_SENTENCES.NOT_ASSESSED}.`,
  );

  const escalation = labelled(arr(a.urgentReviewReasons), DIABETES_ESCALATION_REASON_LABELS);
  const escalationParagraph = bool(a.urgentReviewRequired)
    ? paragraph(
        'Immediate clinician review',
        `This visit was flagged for immediate review: ${list(escalation).toLowerCase()}.`,
      )
    : null;

  const actions = labelled(selected(a.volunteerActions), DIABETES_VOLUNTEER_ACTION_LABELS);
  const reviewReasons = labelled(arr(a.reviewReasons), DIABETES_REVIEW_REASON_LABELS);
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
        `Plan: ${list(labelled(plan.items, DIABETES_CLINICIAN_PLAN_ITEM_LABELS), 'none recorded').toLowerCase()}. ` +
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
      control,
      symptoms,
      medicationsParagraph,
      nutritionParagraph,
      mentalHealth,
      preventive,
    ]),
    assessment: section([assessmentParagraph, escalationParagraph]),
    plan: section([volunteerParagraph, planParagraph, followUp]),
  };
}
