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
  /** Recorded on the hypertension interview when the initial reading warranted a repeat. */
  repeatSystolicBp: number | null;
  repeatDiastolicBp: number | null;
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
  hypertension: {
    latest:
      | (ChartRecordSource & {
          id: string;
          collectedAt: Date;
          classification: string | null;
          suspected: boolean;
          confirmed: boolean;
          hypertensionStatus: string;
          urgentReviewRequired: boolean;
          clinicianReviewRequested: boolean;
          /** The encounter's own reading, so the summary can show the numbers it classified. */
          systolicBp: number | null;
          diastolicBp: number | null;
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
  /** The Overview's "At a glance" block (#341). */
  glance: ChartGlance;
}

export type ChartTrendDirection = 'RISING' | 'FALLING' | 'STEADY' | 'NOT_ENOUGH_DATA';
export type ChartGlanceScreeningKind =
  | 'VITALS'
  | 'HYPERTENSION'
  | 'DIABETES'
  | 'EYE'
  | 'COUNSELLING'
  | 'TOBACCO';

/**
 * A summary built from recorded values by fixed rules (see patient-chart-glance.ts). Each part is
 * null when the caller cannot read its source; inside a part, a null value means not recorded.
 * Codes, not sentences: the chart and the referral report (#344) label them.
 */
export interface ChartGlance {
  generatedAt: Date;
  conditions: {
    /** Active history conditions, minus those the assessments state. Null without history. */
    history: string[] | null;
    /** Latest stated statuses. Null without SCREENING.READ. */
    screening: {
      hypertension: string | null;
      diabetes: string | null;
      diabetesType: string | null;
    } | null;
  } | null;
  bloodPressure: {
    latest: ChartGlanceBpReading | null;
    previous: ChartGlanceBpReading[];
    direction: ChartTrendDirection;
  } | null;
  glucose: {
    latest: { mgDl: number; type: string; recordedAt: Date } | null;
    /** Same type as the latest. */
    previous: Array<{ mgDl: number; recordedAt: Date }>;
    direction: ChartTrendDirection;
    hba1c: { percent: number; recordedAt: Date } | null;
  } | null;
  medications: {
    currentCount: number;
    noKnownCurrentMedications: boolean;
    lastReconciledAt: Date | null;
    adherence: { level: string; recordedAt: Date } | null;
  } | null;
  risks: {
    allergies: unknown | null;
    familyHistory: Array<{ relationship: string; condition: string }> | null;
    /** Null without SCREENING.READ. */
    screening: {
      tobacco: { smoking: string; smokeless: string; recordedAt: Date } | null;
      /** When "pregnant now" was last answered yes, if within a term. */
      pregnantRecordedAt: Date | null;
    } | null;
  } | null;
  /** Only the kinds the caller may read. */
  screenings: Array<{ kind: ChartGlanceScreeningKind; lastAt: Date | null }>;
  care: {
    visits: number;
    lastVisitAt: Date | null;
    followUp: { dueOn: string; state: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'MET' } | null;
  } | null;
}

export interface ChartGlanceBpReading {
  systolic: number;
  diastolic: number;
  recordedAt: Date;
  /** The interview's repeat reading stood in for the first one. */
  repeat: boolean;
}
