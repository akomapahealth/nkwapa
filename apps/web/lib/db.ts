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
  nationalIdCiphertext?: string;
  nationalIdHash?: string;
  nationalIdLast4?: string;
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
  symptomsJson?: string;
  notes?: string;
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
  }
}

export const db = new NkwapaDb();
