import { Prisma } from '@prisma/client';

/**
 * The patient fields the offline client receives.
 *
 * `GET /sync/pull` previously returned whole Prisma rows, so every column a migration added was
 * shipped to every browser and written to IndexedDB automatically. That put the encrypted national
 * id and its hash on every clinician's device even though nothing on the client can decrypt one or
 * ever read the other.
 *
 * Listing the fields explicitly makes the decision to send something deliberate, and makes a new
 * column opt-in rather than opt-out.
 */
export const SYNC_PATIENT_SELECT = {
  id: true,
  patientCode: true,
  primaryClinicId: true,
  firstName: true,
  lastName: true,
  dob: true,
  sex: true,
  phoneE164: true,
  email: true,
  nationalIdType: true,
  // Shown when confirming a patient's identity. The ciphertext and hash are not sent.
  nationalIdLast4: true,
  residentialLocationStatus: true,
  residentialRegion: true,
  residentialDistrict: true,
  residentialCommunity: true,
  residentialAddressNote: true,
  mergedIntoPatientId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PatientSelect;

/**
 * Patient columns deliberately withheld from the offline client, and why.
 *
 * A column named here must not appear in SYNC_PATIENT_SELECT; a column in neither is a decision
 * nobody has made yet, which sync-projection.spec.ts reports as a failure.
 */
export const SYNC_PATIENT_WITHHELD: Record<string, string> = {
  nationalIdCiphertext:
    'Only the server holds the decryption key, so the ciphertext is unreadable on the device and is pure exposure if it is stolen.',
  nationalIdHash:
    'Duplicate detection happens server-side; the hash was stored and indexed offline without ever being read.',
  portalUserId:
    'Links a chart to a portal account. Offline capture never needs it, and it associates a patient with a login.',
  mergedAt:
    'Merge provenance is an administrative record reviewed online; pull already excludes merged patients.',
  mergedByUserId:
    'Merge provenance is an administrative record reviewed online; pull already excludes merged patients.',
};

export type SyncPatientProjection = Prisma.PatientGetPayload<{
  select: typeof SYNC_PATIENT_SELECT;
}>;

/**
 * The hypertension-assessment fields the offline client receives.
 *
 * The whole row used to be sent, which was harmless while the record held a classification and two
 * booleans. The guided interview (#114) added a supervising-clinician block to the same row, and
 * sending that to every device would defeat the permission that gates it: `CAREPLAN.CLINICIAN_PLAN`
 * is doctor-only, but a volunteer's browser would have written the plan into IndexedDB, where it is
 * readable in devtools by anyone holding the laptop.
 *
 * So the clinician block is withheld here as well as omitted from the API response. Two layers,
 * because a boundary that depends on one layer is one refactor from not being a boundary.
 */
export const SYNC_HYPERTENSION_ASSESSMENT_SELECT = {
  id: true,
  clinicId: true,
  encounterId: true,
  classification: true,
  derivedClassification: true,
  classificationOverridden: true,
  suspected: true,
  confirmed: true,
  hypertensionStatus: true,
  yearDiagnosed: true,
  yearDiagnosedUnknown: true,
  mainConcern: true,
  mainConcernOther: true,
  usualCareFacility: true,
  usualCareFacilityStatus: true,
  repeatPerformed: true,
  repeatSystolicBp: true,
  repeatDiastolicBp: true,
  repeatPosition: true,
  repeatCuffSize: true,
  repeatMeasuredAt: true,
  repeatPromptShown: true,
  homeMonitorStatus: true,
  homeCheckFrequency: true,
  homeSystolicAvg: true,
  homeDiastolicAvg: true,
  homeReadingsUnknown: true,
  homeReadingSource: true,
  currentSymptoms: true,
  urgentReviewRequired: true,
  urgentReviewReasons: true,
  medicationReminderStrategies: true,
  reminderStrategyOther: true,
  contributingSubstances: true,
  substanceSchemaVersion: true,
  substanceDetails: true,
  lifestyleSchemaVersion: true,
  lifestyle: true,
  relevantConditions: true,
  pregnantNow: true,
  planningPregnancy: true,
  kidneyFunctionTesting: true,
  urineProteinTesting: true,
  cholesterolTesting: true,
  ecgCompleted: true,
  kidneyFunctionTestingCompletedOn: true,
  urineProteinTestingCompletedOn: true,
  cholesterolTestingCompletedOn: true,
  ecgCompletedOn: true,
  statinUse: true,
  aspirinUse: true,
  volunteerActionsSchemaVersion: true,
  volunteerActions: true,
  clinicianReviewRequested: true,
  reviewReasons: true,
  reviewReasonOther: true,
  notes: true,
  collectedAt: true,
  authoredByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HypertensionAssessmentSelect;

/**
 * Hypertension columns deliberately withheld from the offline client, and why.
 *
 * A column named here must not appear in SYNC_HYPERTENSION_ASSESSMENT_SELECT; a column in neither
 * is a decision nobody has made yet, which sync-projection.spec.ts reports as a failure.
 */
export const SYNC_HYPERTENSION_ASSESSMENT_WITHHELD: Record<string, string> = {
  clinicianPlanItems:
    'The supervising clinician plan is gated on CAREPLAN.CLINICIAN_PLAN; caching it offline would put it on every volunteer device, readable in devtools.',
  clinicianPlanOther: 'Part of the clinician plan block; see clinicianPlanItems.',
  bpGoalSystolic: 'Part of the clinician plan block; see clinicianPlanItems.',
  bpGoalDiastolic: 'Part of the clinician plan block; see clinicianPlanItems.',
  followUpWindow:
    'Set by the clinician. The patient-visible consequence is CarePlan.followUpDate, which syncs on its own record.',
  followUpOther: 'Part of the clinician plan block; see clinicianPlanItems.',
  followUpOwner: 'Part of the clinician plan block; see clinicianPlanItems.',
  clinicianComments:
    'Free clinical text written by a doctor for a doctor. It is the nearest thing on this record to note content, which is server-only by policy.',
  clinicianPlanAuthorId:
    'Names which doctor wrote a plan the device is not allowed to hold in the first place.',
  clinicianPlanAuthoredAt:
    'Reveals that a plan exists and when it was written, which is more than a device without the plan should know.',
};

export type SyncHypertensionAssessmentProjection = Prisma.HypertensionAssessmentGetPayload<{
  select: typeof SYNC_HYPERTENSION_ASSESSMENT_SELECT;
}>;

/**
 * The diabetes-screening fields the offline client receives.
 *
 * Same reasoning as the hypertension projection above: the guided interview (#114) added a
 * supervising-clinician block to a row that used to be sent whole, and sending it would put a
 * doctor-only plan into every volunteer's IndexedDB, where it is readable in devtools.
 */
export const SYNC_DIABETES_SCREENING_SELECT = {
  id: true,
  clinicId: true,
  encounterId: true,
  glucoseMgDl: true,
  glucoseType: true,
  hba1cPercent: true,
  symptoms: true,
  symptomsJson: true,
  legacySymptomsUnmapped: true,
  diabetesStatus: true,
  diabetesType: true,
  yearDiagnosed: true,
  yearDiagnosedUnknown: true,
  mainConcern: true,
  mainConcernOther: true,
  hba1cStatus: true,
  hba1cMeasuredOn: true,
  homeGlucoseMonitoring: true,
  homeGlucoseLowMgDl: true,
  homeGlucoseHighMgDl: true,
  urgentSymptoms: true,
  urgentReviewRequired: true,
  urgentReviewReasons: true,
  derivedSuspicion: true,
  nutritionSchemaVersion: true,
  nutrition: true,
  phq2Interest: true,
  phq2Mood: true,
  phq2Total: true,
  phq2Positive: true,
  distressOverwhelmed: true,
  distressFailing: true,
  distressPositive: true,
  eyeExam: true,
  footExam: true,
  kidneyTesting: true,
  eyeExamCompletedOn: true,
  footExamCompletedOn: true,
  kidneyTestingCompletedOn: true,
  bpCheckedToday: true,
  currentFootWound: true,
  volunteerActionsSchemaVersion: true,
  volunteerActions: true,
  clinicianReviewRequested: true,
  reviewReasons: true,
  reviewReasonOther: true,
  notes: true,
  collectedAt: true,
  authoredByUserId: true,
  createdAt: true,
  updatedAt: true,
  // The offline chart names who recorded a screening; the pull has always carried it.
  authoredBy: { select: { id: true, displayName: true } },
} as const satisfies Prisma.DiabetesScreeningSelect;

/**
 * Diabetes columns deliberately withheld from the offline client, and why.
 *
 * A column named here must not appear in SYNC_DIABETES_SCREENING_SELECT; a column in neither is a
 * decision nobody has made yet, which sync-projection.spec.ts reports as a failure.
 */
export const SYNC_DIABETES_SCREENING_WITHHELD: Record<string, string> = {
  clinicianPlanItems:
    'The supervising clinician plan is gated on CAREPLAN.CLINICIAN_PLAN; caching it offline would put it on every volunteer device, readable in devtools.',
  clinicianPlanOther: 'Part of the clinician plan block; see clinicianPlanItems.',
  followUpWindow:
    'Set by the clinician. The patient-visible consequence is CarePlan.followUpDate, which syncs on its own record.',
  followUpOther: 'Part of the clinician plan block; see clinicianPlanItems.',
  followUpOwner: 'Part of the clinician plan block; see clinicianPlanItems.',
  clinicianComments:
    'Free clinical text written by a doctor for a doctor, which is the nearest thing on this record to note content, and note content is server-only by policy.',
  clinicianPlanAuthorId:
    'Names which doctor wrote a plan the device is not allowed to hold in the first place.',
  clinicianPlanAuthoredAt:
    'Reveals that a plan exists and when it was written, which is more than a device without the plan should know.',
};

export type SyncDiabetesScreeningProjection = Prisma.DiabetesScreeningGetPayload<{
  select: typeof SYNC_DIABETES_SCREENING_SELECT;
}>;

/**
 * The medication-adherence fields the offline client receives.
 *
 * Nothing on this record is clinician-only -- the whole point of it is that a volunteer records it
 * at the chair-side -- so the withheld list is short. It is written out anyway, because the value
 * of this pattern is that a column added by a later migration cannot reach every device by
 * default: `sync-projection.spec.ts` fails until somebody decides.
 */
export const SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT = {
  id: true,
  clinicId: true,
  encounterId: true,
  context: true,
  medicationRecordId: true,
  observedRevisionId: true,
  tookToday: true,
  dosesMissed7d: true,
  takingAsPrescribed: true,
  supplyRemaining: true,
  problems: true,
  problemsOther: true,
  authoredByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.EncounterMedicationAdherenceSelect;

/**
 * Adherence columns deliberately withheld from the offline client, and why.
 *
 * A column named here must not appear in SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT; a column in
 * neither is a decision nobody has made yet, which sync-projection.spec.ts reports as a failure.
 */
export const SYNC_ENCOUNTER_MEDICATION_ADHERENCE_WITHHELD: Record<string, string> = {};

export type SyncEncounterMedicationAdherenceProjection =
  Prisma.EncounterMedicationAdherenceGetPayload<{
    select: typeof SYNC_ENCOUNTER_MEDICATION_ADHERENCE_SELECT;
  }>;
