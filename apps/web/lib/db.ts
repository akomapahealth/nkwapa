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
}

export interface HypertensionAssessmentRecord {
  id: string;
  clinicId: string;
  encounterId: string;
  classification?: string;
  suspected?: boolean;
  confirmed?: boolean;
  notes?: string;
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
  }
}

export const db = new NkwapaDb();
