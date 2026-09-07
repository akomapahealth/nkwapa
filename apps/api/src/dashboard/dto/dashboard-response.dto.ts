import type { ZoneSummary } from '@nkwapa/db';

export interface EncounterSummary {
  id: string;
  patientCode: string;
  patientName: string;
  status: string;
  createdAt: string;
}

export interface StaffActivityRow {
  userId: string;
  displayName: string;
  role: string;
  encountersCreated: number;
  encountersFinalized: number;
}

export interface ClinicComparisonRow {
  clinicId: string;
  clinicName: string;
  /** `null` is a clinic with no zone, which the UI shows rather than hides. */
  zoneCode: string | null;
  totalPatients: number;
  totalEncounters: number;
  totalFinalized: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface DashboardSummary {
  totalPatients: number;
  encountersToday: number;
  pendingDrafts: number;
  pendingReview: number;
  readyToFinalize: number;
}

export interface MeasurementAggregate {
  count: number;
  average: number | null;
}

export interface ClinicalMeasurementMetrics {
  windowDays: 30;
  sampleSize: number;
  vitalsCaptureRate: number;
  tobaccoAssessmentRate: number;
  counselingDocumentationRate: number;
  pendingTobaccoReviews: number;
  measurements: {
    temperatureCelsius: MeasurementAggregate;
    respiratoryRate: MeasurementAggregate;
    spo2Percent: MeasurementAggregate;
    bmi: MeasurementAggregate;
  };
  tobaccoStatusDistribution: Record<string, number>;
}

export interface DoctorMetrics {
  clinicalMeasurements: ClinicalMeasurementMetrics;
  awaitingFinalization: number;
  patientsSeen: { today: number; week: number; month: number };
  followUpComplianceRate: number;
  hypertensionDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  recentEncounters: EncounterSummary[];
  finalizationsTrend: TrendPoint[];
  pendingClinicalNoteCosigns?: number;
}

export interface ReviewMetrics {
  clinicalMeasurements: ClinicalMeasurementMetrics;
  awaitingReview: number;
  reviewsCompleted: { today: number; week: number };
  recentReviews: EncounterSummary[];
  reviewsTrend: TrendPoint[];
  bpDistribution: Record<string, number>;
}

export interface DirectorMetrics {
  clinicalMeasurements: ClinicalMeasurementMetrics;
  patientRegistrationTrend: TrendPoint[];
  encounterVolumeTrend: TrendPoint[];
  screeningRates: { hypertension: number; diabetes: number };
  bpDistribution: Record<string, number>;
  followUpComplianceRate: number;
  staffActivity: StaffActivityRow[];
  encounterStatusDistribution: Record<string, number>;
  pendingClinicalNoteCosigns?: number;
}

export interface VolunteerMetrics {
  clinicalMeasurements: ClinicalMeasurementMetrics;
  patientsRegisteredToday: number;
  encountersCreatedToday: number;
  pendingSubmissions: number;
  patientsRegisteredTrend: TrendPoint[];
  encountersCreatedTrend: TrendPoint[];
  statusBreakdown: Record<string, number>;
  bpDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  clinicalNotes?: { drafts: number; pendingCosign: number };
}

export interface SystemAdminMetrics {
  totalClinics: number;
  totalUsers: number;
  systemWidePatients: number;
  systemWideEncounters: number;
  clinicComparison: ClinicComparisonRow[];
  systemEncountersTrend: TrendPoint[];
  /**
   * Every zone in the network, whether or not the comparison is filtered to one.
   *
   * Built from the unfiltered clinic set on purpose: a filter that removed its own options
   * would leave the reader with no way back to the other zones.
   */
  zones: ZoneSummary[];
  /** The filter in effect, echoed so the client can render it without re-deriving it. */
  appliedZoneCode: string | null;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  doctor?: DoctorMetrics;
  review?: ReviewMetrics;
  director?: DirectorMetrics;
  volunteer?: VolunteerMetrics;
  systemAdmin?: SystemAdminMetrics;
}
