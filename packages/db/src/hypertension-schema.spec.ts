import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALCOHOL_USE_STATUSES,
  FOLLOW_UP_OWNERS,
  FOLLOW_UP_WINDOWS,
  MEDICATION_ADHERENCE_LEVELS,
  MEDICATION_DOSES_MISSED,
  MEDICATION_PROBLEMS,
  MEDICATION_REMINDER_STRATEGIES,
  MEDICATION_SUPPLY_STATUSES,
  MEDICATION_USE_STATUSES,
  NKWAPA_ANSWERS,
  SCREENING_COMPLETION_STATUSES,
} from './clinical-vocabulary';
import {
  BP_AFFECTING_SUBSTANCES,
  BP_REPEAT_STATUSES,
  CARDIOMETABOLIC_CONDITIONS,
  FACILITY_KNOWN_STATUSES,
  HOME_BP_CHECK_FREQUENCIES,
  HOME_BP_MONITOR_STATUSES,
  HOME_BP_SOURCES,
  HYPERTENSION_CLINICIAN_PLAN_ITEMS,
  HYPERTENSION_CONCERNS,
  HYPERTENSION_REVIEW_REASONS,
  HYPERTENSION_STATUSES,
  HYPERTENSION_SYMPTOMS,
  PREGNANCY_PLANNING_ANSWERS,
} from './hypertension-interview';

import { HYPERTENSION_CLASSIFICATIONS } from './bp-classification';

const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

/** Field names declared on a model, ignoring comments, relations and block attributes. */
function modelFieldNames(model: string): string[] {
  const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1];
  if (!body) throw new Error(`Model ${model} not found`);
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/)[0]);
}

function prismaEnum(name: string): string[] {
  const body = new RegExp(`^enum ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1];
  if (!body) throw new Error(`Prisma enum ${name} not found`);
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('///'));
}

/**
 * The vocabularies are declared twice on purpose: once as a Postgres enum, once as a TypeScript
 * constant the form and the note generator read. This is what stops them becoming two different
 * vocabularies.
 *
 * A member added to one and not the other is the failure this catches. Without it, a Prisma enum
 * could gain a value no form renders, or a form could offer an option every write rejects.
 */
const MIRRORED: ReadonlyArray<[string, readonly string[]]> = [
  ['NkwapaAnswer', NKWAPA_ANSWERS],
  ['ScreeningCompletionStatus', SCREENING_COMPLETION_STATUSES],
  ['MedicationUseStatus', MEDICATION_USE_STATUSES],
  ['MedicationSupplyStatus', MEDICATION_SUPPLY_STATUSES],
  ['MedicationAdherenceLevel', MEDICATION_ADHERENCE_LEVELS],
  ['MedicationDosesMissed', MEDICATION_DOSES_MISSED],
  ['MedicationProblem', MEDICATION_PROBLEMS],
  ['MedicationReminderStrategy', MEDICATION_REMINDER_STRATEGIES],
  ['FollowUpWindow', FOLLOW_UP_WINDOWS],
  ['FollowUpOwner', FOLLOW_UP_OWNERS],
  ['HypertensionStatus', HYPERTENSION_STATUSES],
  ['HypertensionConcern', HYPERTENSION_CONCERNS],
  ['FacilityKnownStatus', FACILITY_KNOWN_STATUSES],
  ['BpRepeatStatus', BP_REPEAT_STATUSES],
  ['HomeBpMonitorStatus', HOME_BP_MONITOR_STATUSES],
  ['HomeBpCheckFrequency', HOME_BP_CHECK_FREQUENCIES],
  ['HomeBpSource', HOME_BP_SOURCES],
  ['HypertensionSymptom', HYPERTENSION_SYMPTOMS],
  ['BpAffectingSubstance', BP_AFFECTING_SUBSTANCES],
  ['CardiometabolicCondition', CARDIOMETABOLIC_CONDITIONS],
  ['PregnancyPlanningAnswer', PREGNANCY_PLANNING_ANSWERS],
  ['HypertensionReviewReason', HYPERTENSION_REVIEW_REASONS],
  ['HypertensionClinicianPlanItem', HYPERTENSION_CLINICIAN_PLAN_ITEMS],
  ['HypertensionClassification', HYPERTENSION_CLASSIFICATIONS],
];

describe('hypertension interview schema', () => {
  it.each(MIRRORED)('%s holds exactly the members the vocabulary declares', (name, members) => {
    expect(prismaEnum(name).sort()).toEqual([...members].sort());
  });

  /*
    Alcohol lives in the lifestyle JSONB, not in a column, so it has no Prisma enum.

    This asserts the absence deliberately: someone adding an `AlcoholUseStatus` enum has almost
    certainly decided to promote the field to a column, which is a schema decision that should
    arrive with a migration rather than as a side effect.
  */
  it('declares no Prisma enum for the JSONB-only alcohol scale', () => {
    expect(schema).not.toMatch(/^enum AlcoholUseStatus \{/m);
    expect(ALCOHOL_USE_STATUSES.length).toBeGreaterThan(0);
  });

  /*
    Tobacco is recorded once per encounter, on TobaccoScreening, captured in the vitals bundle.

    The interview reads that record rather than asking again. Two tobacco answers on one visit
    would leave nothing saying which a clinician should believe.
  */
  it('keeps tobacco on TobaccoScreening rather than on the assessment', () => {
    // Field declarations only: the model's own comment explains the absence and says "tobacco".
    const fields = modelFieldNames('HypertensionAssessment');
    expect(fields.filter((name) => /tobacco/i.test(name))).toEqual([]);
    expect(prismaEnum('TobaccoUseStatus')).toEqual(
      expect.arrayContaining(['CURRENT_OCCASIONAL', 'CURRENT_DAILY']),
    );
  });

  /*
    Today's blood pressure is read from Vitals, never copied here.

    A `systolicBp` column on this record would let one encounter hold two disagreeing answers to
    "what was the blood pressure today", and nothing would say which the classification used.
    Only the *repeat* reading, which is genuinely a different measurement, lives here.
  */
  it("does not copy today's reading onto the assessment", () => {
    const fields = modelFieldNames('HypertensionAssessment');
    expect(fields).toContain('repeatSystolicBp');
    expect(fields).not.toContain('systolicBp');
    expect(fields).not.toContain('diastolicBp');
    expect(fields).not.toContain('pulseBpm');
  });

  it('keeps provenance on the assessment, closing the gap with DiabetesScreening', () => {
    const fields = modelFieldNames('HypertensionAssessment');
    expect(fields).toEqual(expect.arrayContaining(['collectedAt', 'authoredByUserId']));
  });
});
