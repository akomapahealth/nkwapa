import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SYNC_DIABETES_SCREENING_SELECT,
  SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT,
  SYNC_ENCOUNTER_MEDICATION_ADHERENCE_WITHHELD,
  SYNC_DIABETES_SCREENING_WITHHELD,
  SYNC_HYPERTENSION_ASSESSMENT_SELECT,
  SYNC_HYPERTENSION_ASSESSMENT_WITHHELD,
  SYNC_PATIENT_SELECT,
  SYNC_PATIENT_WITHHELD,
} from './sync-projection';

/** Field names declared on one Prisma model, ignoring relations and block attributes. */
function modelFields(model: string): string[] {
  const schema = readFileSync(
    resolve(__dirname, '../../../../packages/db/prisma/schema.prisma'),
    'utf8',
  );
  const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1];
  if (!body) throw new Error(`Model ${model} not found`);

  const scalarTypes =
    /^(String|Int|Float|Boolean|DateTime|Decimal|BigInt|Bytes|Json|Sex|NationalIdType|PatientLocationStatus|GhanaRegion|HypertensionClassification|HypertensionStatus|HypertensionConcern|FacilityKnownStatus|BpRepeatStatus|PatientPosition|BloodPressureCuffSize|HomeBpMonitorStatus|HomeBpCheckFrequency|HomeBpSource|HypertensionSymptom|HypertensionEscalationReason|MedicationReminderStrategy|BpAffectingSubstance|CardiometabolicCondition|NkwapaAnswer|PregnancyPlanningAnswer|ScreeningCompletionStatus|MedicationUseStatus|HypertensionReviewReason|HypertensionClinicianPlanItem|FollowUpWindow|FollowUpOwner|GlucoseType|DiabetesSymptom|DiabetesStatus|DiabetesType|DiabetesConcern|Hba1cStatus|DiabetesUrgentSymptom|DiabetesEscalationReason|DiabetesSuspicion|PhqResponse|DiabetesDistressResponse|DiabetesReviewReason|DiabetesClinicianPlanItem|MedicationAdherenceContext|MedicationDosesMissed|MedicationAdherenceLevel|MedicationSupplyStatus|MedicationProblem)$/;

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/))
    .filter(([, type]) => type && scalarTypes.test(type.replace(/[?[\]]/g, '')))
    .map(([name]) => name);
}

describe('offline sync patient projection', () => {
  const selected = Object.keys(SYNC_PATIENT_SELECT);
  const withheld = Object.keys(SYNC_PATIENT_WITHHELD);

  it('never sends the encrypted national id or its hash', () => {
    // Both were shipped to every browser and written to IndexedDB, and neither was ever read.
    expect(selected).not.toContain('nationalIdCiphertext');
    expect(selected).not.toContain('nationalIdHash');
    expect(withheld).toContain('nationalIdCiphertext');
    expect(withheld).toContain('nationalIdHash');
  });

  it('still sends what the offline registry and chart render', () => {
    for (const field of [
      'id',
      'patientCode',
      'primaryClinicId',
      'firstName',
      'lastName',
      'nationalIdLast4',
      'residentialRegion',
      'updatedAt',
    ]) {
      expect(selected).toContain(field);
    }
  });

  it('requires a decision for every patient column', () => {
    // A migration that adds a column must either send it deliberately or record why it is
    // withheld. Before this, a new column reached every device automatically.
    const undecided = modelFields('Patient').filter(
      (field) => !selected.includes(field) && !withheld.includes(field),
    );
    expect(undecided).toEqual([]);
  });

  it('does not both send and withhold the same column', () => {
    expect(selected.filter((field) => withheld.includes(field))).toEqual([]);
  });

  it('explains every withheld column', () => {
    for (const [field, reason] of Object.entries(SYNC_PATIENT_WITHHELD)) {
      expect(reason.length).toBeGreaterThan(30);
      expect(field).not.toBe('');
    }
  });
});

describe('offline sync hypertension projection', () => {
  const selected = Object.keys(SYNC_HYPERTENSION_ASSESSMENT_SELECT);
  const withheld = Object.keys(SYNC_HYPERTENSION_ASSESSMENT_WITHHELD);

  /*
    The supervising clinician plan is doctor-only, and IndexedDB is readable in devtools.

    Sending it would mean a volunteer's laptop holds a plan the API refuses to show them, which
    defeats the permission rather than enforcing it. This is the second of the two layers; the
    service also omits the block from its response.
  */
  it('never sends the supervising clinician plan to a device', () => {
    for (const field of [
      'clinicianPlanItems',
      'clinicianPlanOther',
      'bpGoalSystolic',
      'bpGoalDiastolic',
      'followUpWindow',
      'followUpOther',
      'followUpOwner',
      'clinicianComments',
      'clinicianPlanAuthorId',
      'clinicianPlanAuthoredAt',
    ]) {
      expect(selected).not.toContain(field);
      expect(withheld).toContain(field);
    }
  });

  it('still sends what the offline interview renders', () => {
    for (const field of [
      'id',
      'encounterId',
      'classification',
      'derivedClassification',
      'classificationOverridden',
      'hypertensionStatus',
      'currentSymptoms',
      'urgentReviewRequired',
      'urgentReviewReasons',
      'lifestyle',
      'reviewReasons',
      'collectedAt',
      'updatedAt',
    ]) {
      expect(selected).toContain(field);
    }
  });

  it('requires a decision for every hypertension column', () => {
    const undecided = modelFields('HypertensionAssessment').filter(
      (field) => !selected.includes(field) && !withheld.includes(field),
    );
    expect(undecided).toEqual([]);
  });

  it('never names a column in both lists', () => {
    expect(selected.filter((field) => withheld.includes(field))).toEqual([]);
  });
});

describe('offline sync diabetes projection', () => {
  const selected = Object.keys(SYNC_DIABETES_SCREENING_SELECT);
  const withheld = Object.keys(SYNC_DIABETES_SCREENING_WITHHELD);

  it('never sends the supervising clinician plan to a device', () => {
    for (const field of [
      'clinicianPlanItems',
      'clinicianPlanOther',
      'followUpWindow',
      'followUpOther',
      'followUpOwner',
      'clinicianComments',
      'clinicianPlanAuthorId',
      'clinicianPlanAuthoredAt',
    ]) {
      expect(selected).not.toContain(field);
      expect(withheld).toContain(field);
    }
  });

  it('still sends what the offline interview renders', () => {
    for (const field of [
      'id',
      'encounterId',
      'glucoseMgDl',
      'glucoseType',
      'symptoms',
      'urgentSymptoms',
      'derivedSuspicion',
      'phq2Total',
      'phq2Positive',
      'nutrition',
      'collectedAt',
      'updatedAt',
    ]) {
      expect(selected).toContain(field);
    }
  });

  it('requires a decision for every diabetes column', () => {
    const undecided = modelFields('DiabetesScreening').filter(
      (field) => !selected.includes(field) && !withheld.includes(field),
    );
    expect(undecided).toEqual([]);
  });

  it('never names a column in both lists', () => {
    expect(selected.filter((field) => withheld.includes(field))).toEqual([]);
  });
});

describe('offline sync medication adherence projection', () => {
  const selected = Object.keys(SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT);
  const withheld = Object.keys(SYNC_ENCOUNTER_MEDICATION_ADHERENCE_WITHHELD);

  it('sends what the offline interview renders', () => {
    for (const field of [
      'id',
      'encounterId',
      'context',
      'medicationRecordId',
      /*
        The revision the volunteer had on screen.

        Without it a device that reconciles a medication between the save and the sync would show
        an observation next to a dose it was never made about.
      */
      'observedRevisionId',
      'tookToday',
      'dosesMissed7d',
      'takingAsPrescribed',
      'supplyRemaining',
      'problems',
      'updatedAt',
    ]) {
      expect(selected).toContain(field);
    }
  });

  it('requires a decision for every adherence column', () => {
    const undecided = modelFields('EncounterMedicationAdherence').filter(
      (field) => !selected.includes(field) && !withheld.includes(field),
    );
    expect(undecided).toEqual([]);
  });

  it('never names a column in both lists', () => {
    expect(selected.filter((field) => withheld.includes(field))).toEqual([]);
  });
});
