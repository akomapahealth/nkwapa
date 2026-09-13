import Dexie, { type Table } from 'dexie';
import { migrateLegacyPulse } from './db-migrations';

export interface PatientRecord {
  id: string;
  primaryClinicId: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dob?: string;
  sex?: string;
  phoneE164?: string;
  email?: string;
  nationalIdType?: string;
  // The ciphertext and its hash are deliberately absent: only the server can decrypt one and
  // nothing on the client ever read either, so they are not synced or stored on the device.
  // The last four digits are shown when confirming a patient's identity.
  nationalIdLast4?: string;
  // Residential location (see @nkwapa/db residential-location helpers).
  residentialLocationStatus?: string;
  residentialRegion?: string | null;
  residentialDistrict?: string | null;
  residentialCommunity?: string | null;
  residentialAddressNote?: string | null;
  createdByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EncounterRecord {
  id: string;
  clinicId: string;
  patientId: string;
  status?: string;
  createdByUserId?: string;
  preceptorReviewedById?: string;
  doctorFinalizedById?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VitalsRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  systolicBp?: number;
  diastolicBp?: number;
  /** @deprecated Migrated to pulseBpm in Dexie v4. */
  heartRate?: number;
  pulseBpm?: number;
  bpSite?: string;
  bpSiteOther?: string;
  patientPosition?: string;
  patientPositionOther?: string;
  cuffSize?: string;
  cuffSizeOther?: string;
  temperatureCelsius?: number;
  temperatureSource?: string;
  temperatureSourceOther?: string;
  respiratoryRate?: number;
  spo2Percent?: number;
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TobaccoScreeningRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  smokingStatus: string;
  smokelessTobaccoStatus: string;
  passiveExposure: string;
  readinessToQuit: string;
  counselingGiven: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewPending?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DiabetesScreeningRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  glucoseMgDl?: number;
  glucoseType?: string;
  hba1cPercent?: number;
  symptoms?: import('@nkwapa/db').DiabetesSymptom[];
  symptomsJson?: string;
  legacySymptomsUnmapped?: boolean;
  notes?: string;
  collectedAt?: string;
  authoredByUserId?: string;
  authoredBy?: { id: string; displayName: string };
  encounterStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  // Guided interview (#114).
  diabetesStatus?: string;
  diabetesType?: string;
  yearDiagnosed?: number | null;
  yearDiagnosedUnknown?: boolean;
  mainConcern?: string;
  mainConcernOther?: string | null;
  hba1cStatus?: string;
  hba1cMeasuredOn?: string | null;
  homeGlucoseMonitoring?: string;
  homeGlucoseLowMgDl?: number | null;
  homeGlucoseHighMgDl?: number | null;
  /** Right now, as opposed to `symptoms`, which asks about the past month. */
  urgentSymptoms?: string[];
  urgentReviewRequired?: boolean;
  urgentReviewReasons?: string[];
  /** Cached so the interview can show the threshold result offline; the server recomputes. */
  derivedSuspicion?: string;
  nutrition?: Record<string, unknown> | null;
  phq2Interest?: string;
  phq2Mood?: string;
  phq2Total?: number | null;
  phq2Positive?: boolean;
  distressOverwhelmed?: string;
  distressFailing?: string;
  distressPositive?: boolean;
  eyeExam?: string;
  footExam?: string;
  kidneyTesting?: string;
  bpCheckedToday?: string;
  currentFootWound?: string;
  volunteerActions?: Record<string, unknown> | null;
  clinicianReviewRequested?: boolean;
  reviewReasons?: string[];
  reviewReasonOther?: string | null;

  /*
    The supervising clinician plan is deliberately absent, as on the hypertension record.
    `SYNC_DIABETES_SCREENING_WITHHELD` keeps it out of the pull; declaring the fields here would
    invite a future `put` that writes them locally anyway.
  */
}

export interface HypertensionAssessmentRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  classification?: string;
  /**
   * What the thresholds say about this encounter's vitals, recomputed server-side on every write.
   * Cached so the interview can show a volunteer what the reading implies while offline.
   */
  derivedClassification?: string;
  classificationOverridden?: boolean;
  suspected?: boolean;
  confirmed?: boolean;

  hypertensionStatus?: string;
  yearDiagnosed?: number | null;
  yearDiagnosedUnknown?: boolean;
  mainConcern?: string;
  mainConcernOther?: string | null;
  usualCareFacility?: string | null;
  usualCareFacilityStatus?: string;

  repeatPerformed?: string;
  repeatSystolicBp?: number | null;
  repeatDiastolicBp?: number | null;
  repeatPosition?: string | null;
  repeatCuffSize?: string | null;
  repeatPromptShown?: boolean;
  homeMonitorStatus?: string;
  homeCheckFrequency?: string;
  homeSystolicAvg?: number | null;
  homeDiastolicAvg?: number | null;
  homeReadingsUnknown?: boolean;
  homeReadingSource?: string;

  currentSymptoms?: string[];
  urgentReviewRequired?: boolean;
  urgentReviewReasons?: string[];

  medicationReminderStrategies?: string[];
  reminderStrategyOther?: string | null;
  contributingSubstances?: string[];
  substanceDetails?: Record<string, unknown> | null;
  lifestyle?: Record<string, unknown> | null;

  relevantConditions?: string[];
  pregnantNow?: string;
  planningPregnancy?: string;

  kidneyFunctionTesting?: string;
  urineProteinTesting?: string;
  cholesterolTesting?: string;
  ecgCompleted?: string;
  statinUse?: string;
  aspirinUse?: string;

  volunteerActions?: Record<string, unknown> | null;
  clinicianReviewRequested?: boolean;
  reviewReasons?: string[];
  reviewReasonOther?: string | null;

  /*
    The supervising clinician plan is deliberately absent.

    `SYNC_HYPERTENSION_ASSESSMENT_WITHHELD` keeps it out of the pull, because IndexedDB is readable
    in devtools and caching it would put a doctor-only plan on every volunteer's laptop. Declaring
    the fields here would invite a future `put` that writes them locally anyway.
  */

  notes?: string;
  collectedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CarePlanRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  counselingGiven?: boolean;
  medicationPrescribed?: boolean;
  followUpDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientConsentRecord {
  id: string;
  patientId: string;
  clinicId: string;
  consentType?: string;
  status?: string;
  consentVersion?: string;
  consentTextSnapshot?: string;
  grantedAt?: string;
  revokedAt?: string;
  recordedByUserId?: string;
  witnessName?: string;
  witnessPhoneE164?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PrescriptionRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  drugId: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  instructions?: string;
  prescribedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicalHistoryRecord {
  id: string;
  clinicId: string;
  patientId: string;
  category: string;
  currentRevisionId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicalHistoryRevisionRecord {
  id: string;
  recordId: string;
  revisionNumber: number;
  status: string;
  onsetDate?: string;
  occurrenceDate?: string;
  resolvedDate?: string;
  detailsSchemaVersion: number;
  details: Record<string, unknown>;
  notes?: string;
  sourceEncounterId?: string;
  authoredByUserId: string;
  createdAt?: string;
}

export interface PatientMedicationRecord {
  id: string;
  clinicId: string;
  patientId: string;
  currentRevisionId?: string;
  recordedByUserId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientMedicationRevisionRecord {
  id: string;
  recordId: string;
  revisionNumber: number;
  medicationName: string;
  drugId?: string | null;
  strength?: string | null;
  dose?: string | null;
  doseUnit?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  indication?: string | null;
  status: string;
  notes?: string | null;
  sourceEncounterId?: string | null;
  sourceType: string;
  authoredByUserId: string;
  reconciledByUserId?: string | null;
  lastReconciledAt?: string | null;
  createdAt?: string;
}

export interface MedicationReconciliationEventRecord {
  id: string;
  clinicId: string;
  patientId: string;
  outcome: string;
  sourceEncounterId?: string;
  reconciledByUserId: string;
  notes?: string;
  createdAt?: string;
}

export interface PatientPharmacyRecord {
  id: string;
  clinicId: string;
  patientId: string;
  currentRevisionId?: string;
  recordedByUserId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientPharmacyRevisionRecord {
  id: string;
  recordId: string;
  revisionNumber: number;
  name: string;
  phoneE164?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  addressText?: string | null;
  notes?: string | null;
  authoredByUserId: string;
  createdAt?: string;
}

export interface PatientPharmacyPreferenceRecord {
  id: string;
  clinicId: string;
  patientId: string;
  pharmacyRecordId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
  setByUserId: string;
  endedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OutboxRecord {
  id: string;
  clinicId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payloadJson: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface SyncStateRecord {
  clinicId: string;
  cursor: string;
  updatedAt: string;
}

export class NkwapaDb extends Dexie {
  patients!: Table<PatientRecord, string>;
  encounters!: Table<EncounterRecord, string>;
  vitals!: Table<VitalsRecord, string>;
  tobacco_screenings!: Table<TobaccoScreeningRecord, string>;
  diabetes_screenings!: Table<DiabetesScreeningRecord, string>;
  hypertension_assessments!: Table<HypertensionAssessmentRecord, string>;
  care_plans!: Table<CarePlanRecord, string>;
  patient_consents!: Table<PatientConsentRecord, string>;
  prescriptions!: Table<PrescriptionRecord, string>;
  medical_history_records!: Table<MedicalHistoryRecord, string>;
  medical_history_revisions!: Table<MedicalHistoryRevisionRecord, string>;
  patient_medication_records!: Table<PatientMedicationRecord, string>;
  patient_medication_revisions!: Table<PatientMedicationRevisionRecord, string>;
  medication_reconciliation_events!: Table<MedicationReconciliationEventRecord, string>;
  patient_pharmacy_records!: Table<PatientPharmacyRecord, string>;
  patient_pharmacy_revisions!: Table<PatientPharmacyRevisionRecord, string>;
  patient_pharmacy_preferences!: Table<PatientPharmacyPreferenceRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  sync_state!: Table<SyncStateRecord, string>;

  constructor() {
    super('NkwapaDb');
    this.version(1).stores({
      patients: 'id, primaryClinicId, updatedAt, nationalIdHash',
      encounters: 'id, clinicId, patientId, updatedAt',
      vitals: 'id, clinicId, encounterId, updatedAt',
      diabetes_screenings: 'id, clinicId, encounterId, updatedAt',
      hypertension_assessments: 'id, clinicId, encounterId, updatedAt',
      care_plans: 'id, clinicId, encounterId, updatedAt',
      patient_consents: 'id, patientId, clinicId, updatedAt',
      outbox: 'id, clinicId, createdAt, idempotencyKey',
      sync_state: 'clinicId',
    });
    this.version(2).stores({
      prescriptions: 'id, clinicId, encounterId, updatedAt',
    });
    this.version(3).stores({
      medical_history_records: 'id, clinicId, patientId, category, updatedAt',
      medical_history_revisions: 'id, recordId, status, createdAt',
    });
    this.version(4)
      .stores({
        tobacco_screenings: 'id, clinicId, encounterId, reviewedAt, updatedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<VitalsRecord, string>('vitals')
          .toCollection()
          .modify(migrateLegacyPulse);
      });
    this.version(5).stores({
      patient_medication_records: 'id, clinicId, patientId, updatedAt',
      patient_medication_revisions: 'id, recordId, status, createdAt',
      medication_reconciliation_events: 'id, clinicId, patientId, createdAt',
      patient_pharmacy_records: 'id, clinicId, patientId, updatedAt',
      patient_pharmacy_revisions: 'id, recordId, createdAt',
      patient_pharmacy_preferences:
        'id, clinicId, patientId, pharmacyRecordId, effectiveTo, updatedAt',
    });
    this.version(6)
      .stores({
        diabetes_screenings: 'id, clinicId, encounterId, collectedAt, updatedAt',
      })
      .upgrade(async (transaction) => {
        const { migrateLegacyDiabetesScreening } = await import('./db-migrations');
        await transaction
          .table<DiabetesScreeningRecord, string>('diabetes_screenings')
          .toCollection()
          .modify(migrateLegacyDiabetesScreening);
      });
    // v7 indexes the residential region for offline registry filtering. New
    // non-indexed location fields need no migration; existing rows resync.
    this.version(7).stores({
      patients: 'id, primaryClinicId, updatedAt, nationalIdHash, residentialRegion',
    });
    // v8 stops keeping the encrypted national id on the device. Neither the ciphertext nor its
    // hash was ever read by the client, and the server stopped sending them in the same release,
    // so a resync cannot reintroduce them. Dropping nationalIdHash from the index list removes
    // the index; the remaining indexes must be restated for Dexie to keep them.
    this.version(8)
      .stores({
        patients: 'id, primaryClinicId, updatedAt, residentialRegion',
      })
      .upgrade(async (transaction) => {
        const { stripStoredNationalIdSecrets } = await import('./db-migrations');
        await transaction
          .table<PatientRecord, string>('patients')
          .toCollection()
          .modify(stripStoredNationalIdSecrets);
      });

    /*
      v9 widens the hypertension record for the guided interview (#114).

      `collectedAt` joins the index list so the interview's longitudinal history can order rows the
      way the server does. The upgrade fills the new fields rather than leaving them undefined,
      because an unanswered question and an answered "no" have to stay distinguishable -- an old
      row rehydrated without this reads as a patient who denied every symptom.
    */
    this.version(9)
      .stores({
        hypertension_assessments: 'id, clinicId, encounterId, collectedAt, updatedAt',
      })
      .upgrade(async (transaction) => {
        const { migrateLegacyHypertensionAssessment } = await import('./db-migrations');
        await transaction
          .table<HypertensionAssessmentRecord, string>('hypertension_assessments')
          .toCollection()
          .modify(migrateLegacyHypertensionAssessment);
      });

    /*
      v10 widens the diabetes record for the guided interview (#114).

      No index changes, so this is a data-only upgrade: the new fields get their unanswered values
      so a row written before the interview does not rehydrate as a patient who denied every
      symptom. `derivedSuspicion` is recomputed from the reading already on the row rather than
      left blank, so an offline chart is honest about history before the next sync.
    */
    this.version(10).upgrade(async (transaction) => {
      const { migrateLegacyDiabetesInterview } = await import('./db-migrations');
      await transaction
        .table<DiabetesScreeningRecord, string>('diabetes_screenings')
        .toCollection()
        .modify(migrateLegacyDiabetesInterview);
    });
  }
}

export const db = new NkwapaDb();
