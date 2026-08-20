import type { PatientChartSectionId } from '@nkwapa/db';
import type { EncounterStatus } from '@prisma/client';

export interface ChartActorRef {
  id: string;
  displayName: string;
}

export interface ChartClinicRef {
  id: string;
  name: string;
}

/**
 * Provenance carried by every longitudinal record so the chart can always answer
 * "when, by whom, at which clinic, and from which visit".
 */
export interface ChartRecordSource {
  encounterId: string;
  encounterStatus: EncounterStatus;
  encounterCreatedAt: Date;
  recordedBy: ChartActorRef | null;
  clinic: ChartClinicRef;
  /** Finalized encounters are immutable, so the record renders as locked. */
  locked: boolean;
}

export interface ChartVitalsRecord extends ChartRecordSource {
  id: string;
  recordedAt: Date;
  updatedAt: Date;
  systolicBp: number | null;
  diastolicBp: number | null;
  pulseBpm: number | null;
  temperatureCelsius: number | null;
  respiratoryRate: number | null;
  spo2Percent: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  notes: string | null;
}

export interface ChartVisitRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: EncounterStatus;
  locked: boolean;
  createdBy: ChartActorRef | null;
  reviewedBy: ChartActorRef | null;
  finalizedBy: ChartActorRef | null;
  clinic: ChartClinicRef;
  /** What was captured at this visit, so a reader can scan the history at a glance. */
  recorded: {
    vitals: boolean;
    diabetesScreening: boolean;
    tobaccoScreening: boolean;
    hypertensionAssessment: boolean;
    carePlan: boolean;
    prescriptions: number;
    /** Omitted entirely for roles without clinical-note status access. */
    noteStatus?: string | null;
  };
}

export interface ChartPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type ChartPendingActionKind =
  | 'OPEN_VISIT'
  | 'AWAITING_REVIEW'
  | 'NOTE_PENDING_COSIGN'
  | 'ALLERGIES_NOT_RECORDED'
  | 'MEDICATIONS_NOT_RECORDED'
  | 'RESEARCH_CONSENT_NOT_RECORDED';

export interface ChartPendingAction {
  kind: ChartPendingActionKind;
  label: string;
  description: string;
  /** Section the reader should open to resolve the action. */
  section: PatientChartSectionId;
  encounterId: string | null;
  count: number;
}

export interface ChartSectionDescriptor {
  id: PatientChartSectionId;
  label: string;
  description: string;
}

/**
 * Every block is nullable: a block the caller may not read is omitted from the payload
 * entirely rather than blanked, so unauthorised data never reaches the client.
 */
export interface PatientChartSummary {
  patientId: string;
  clinicId: string;
  sections: ChartSectionDescriptor[];
  vitals: { latest: ChartVitalsRecord | null } | null;
  diabetes: {
    latest:
      | (ChartRecordSource & {
          id: string;
          collectedAt: Date;
          glucoseMgDl: number | null;
          glucoseType: string;
          hba1cPercent: number | null;
          symptoms: string[];
          notes: string | null;
        })
      | null;
  } | null;
  allergies: unknown | null;
  medications: {
    currentCount: number;
    noKnownCurrentMedications: boolean;
    lastReconciledAt: Date | null;
  } | null;
  noteActivity: { pendingCosign: number; total: number } | null;
  visits: { total: number; open: number; lastVisitAt: Date | null } | null;
  consent: { status: string | null; grantedAt: Date | null; revokedAt: Date | null } | null;
  pendingActions: ChartPendingAction[];
}
