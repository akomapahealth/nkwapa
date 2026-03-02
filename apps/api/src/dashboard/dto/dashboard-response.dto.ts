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

export interface DoctorMetrics {
  awaitingFinalization: number;
  patientsSeen: { today: number; week: number; month: number };
  followUpComplianceRate: number;
  hypertensionDistribution: Record<string, number>;
  diabetesStats: { flagged: number; total: number };
  recentEncounters: EncounterSummary[];
}

export interface PreceptorMetrics {
  awaitingReview: number;
  reviewsCompleted: { today: number; week: number };
  recentReviews: EncounterSummary[];
}

export interface DirectorMetrics {
  patientRegistrationTrend: TrendPoint[];
  encounterVolumeTrend: TrendPoint[];
  screeningRates: { hypertension: number; diabetes: number };
  bpDistribution: Record<string, number>;
  followUpComplianceRate: number;
  staffActivity: StaffActivityRow[];
}

export interface VolunteerMetrics {
  patientsRegisteredToday: number;
  encountersCreatedToday: number;
  pendingSubmissions: number;
}

export interface SystemAdminMetrics {
  totalClinics: number;
  totalUsers: number;
  systemWidePatients: number;
  systemWideEncounters: number;
  clinicComparison: ClinicComparisonRow[];
}

export interface DashboardResponse {
  summary: DashboardSummary;
  doctor?: DoctorMetrics;
  preceptor?: PreceptorMetrics;
  director?: DirectorMetrics;
  volunteer?: VolunteerMetrics;
  systemAdmin?: SystemAdminMetrics;
}
