'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { hasAnyPermission, hasPermission } from '@/lib/ops';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { MAIN_ROLE_PRECEDENCE, type MainRole } from '@/lib/main-role';
import type { ZoneFilter, ZoneSummary } from '@/lib/clinic-zones';
import type { DashboardWorkItem } from '@/lib/dashboard-work-items';
import type { RecentVisit } from './recent-visit-columns';
import {
  ClinicalMeasurementsDashboard,
  type ClinicalMeasurementMetrics,
} from './ClinicalMeasurementsDashboard';
import { VolunteerWelcome } from './VolunteerWelcome';
import { FigureStrip, type Figure } from './FigureStrip';
import { AlsoOnYourPlate, NeedsYouNow, workRows } from './NeedsYouNow';
import { DoctorDashboard } from './DoctorDashboard';
import { ReviewDashboard } from './ReviewDashboard';
import { DirectorDashboard } from './DirectorDashboard';
import { SystemAdminDashboard } from './SystemAdminDashboard';
import { StationFlowDashboard, stationFlowFigures, useStationFlow } from './StationFlowDashboard';

export interface DashboardData {
  summary: {
    totalPatients: number;
    encountersToday: number;
    pendingDrafts: number;
    pendingReview: number;
    readyToFinalize: number;
  };
  doctor?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
    awaitingFinalization: number;
    awaitingFinalizationItems?: DashboardWorkItem[];
    patientsSeen: { today: number; week: number; month: number };
    followUpComplianceRate: number;
    hypertensionDistribution: Record<string, number>;
    diabetesStats: { flagged: number; total: number };
    recentEncounters: RecentVisit[];
    finalizationsTrend: { date: string; count: number }[];
    pendingClinicalNoteCosigns?: number;
  };
  review?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
    awaitingReview: number;
    reviewsCompleted: { today: number; week: number };
    reviewsTrend: { date: string; count: number }[];
    bpDistribution: Record<string, number>;
    recentReviews: RecentVisit[];
  };
  director?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
    patientRegistrationTrend: { date: string; count: number }[];
    encounterVolumeTrend: { date: string; count: number }[];
    screeningRates: { hypertension: number; diabetes: number };
    bpDistribution: Record<string, number>;
    followUpComplianceRate: number;
    staffActivity: {
      userId: string;
      displayName: string;
      role: string;
      encountersCreated: number;
      encountersFinalized: number;
    }[];
    encounterStatusDistribution: Record<string, number>;
    pendingClinicalNoteCosigns?: number;
  };
  volunteer?: {
    clinicalMeasurements: ClinicalMeasurementMetrics;
    patientsRegisteredToday: number;
    encountersCreatedToday: number;
    pendingSubmissions: number;
    pendingSubmissionItems?: DashboardWorkItem[];
    patientsRegisteredTrend: { date: string; count: number }[];
    encountersCreatedTrend: { date: string; count: number }[];
    statusBreakdown: Record<string, number>;
    bpDistribution: Record<string, number>;
    diabetesStats: { flagged: number; total: number };
    clinicalNotes?: { drafts: number; pendingCosign: number };
  };
  systemAdmin?: {
    totalClinics: number;
    totalUsers: number;
    systemWidePatients: number;
    systemWideEncounters: number;
    systemEncountersTrend: { date: string; count: number }[];
    clinicComparison: {
      clinicId: string;
      clinicName: string;
      zoneCode: string | null;
      totalPatients: number;
      totalEncounters: number;
      totalFinalized: number;
    }[];
    zones: ZoneSummary[];
    appliedZoneCode: string | null;
  };
}

export type StaffHomeRole = Exclude<MainRole, 'VOLUNTEER'>;

const count = new Intl.NumberFormat('en-GB');
const plural = (n: number, one: string, many: string) =>
  `${count.format(n)} ${n === 1 ? one : many}`;

interface HomeAction {
  href: string;
  label: string;
  allowed: (perms: string[]) => boolean;
}

const QUEUE_PERMS = ['ENCOUNTER.READ', 'ENCOUNTER.CREATE', 'ENCOUNTER.REVIEW', 'DOCTOR.FINALIZE'];

/** Each home's primary then secondary action, as in the pilot; the first two allowed are shown. */
const ACTIONS: Record<StaffHomeRole, HomeAction[]> = {
  DOCTOR: [
    {
      href: '/queues?tab=finalize',
      label: 'Sign off visits',
      allowed: (p) => hasPermission(p, 'DOCTOR.FINALIZE'),
    },
    { href: '/queues', label: 'Open queues', allowed: (p) => hasAnyPermission(p, QUEUE_PERMS) },
  ],
  MANAGER: [
    {
      href: '/today',
      label: 'Open Today board',
      allowed: (p) => hasPermission(p, 'OPS.CHECKIN.READ'),
    },
    {
      href: '/stations',
      label: 'Stations',
      allowed: (p) =>
        isWebFeatureEnabled('stationWorkflow') && hasPermission(p, 'OPS.STATION.WORK'),
    },
    { href: '/queues', label: 'Open queues', allowed: (p) => hasAnyPermission(p, QUEUE_PERMS) },
  ],
  DIRECTOR: [
    {
      href: '/reports/organization',
      label: 'Organization report',
      allowed: (p) => hasPermission(p, 'ORGANIZATION.REPORT.READ'),
    },
    { href: '/metrics', label: 'Metrics', allowed: (p) => hasPermission(p, 'METRICS.READ') },
    {
      href: '/staff-activity',
      label: 'Staff activity',
      allowed: (p) => hasPermission(p, 'AUDIT.READ'),
    },
  ],
  SYSTEM_ADMIN: [
    { href: '/admin/clinics', label: 'Clinics', allowed: (p) => hasPermission(p, 'CLINIC.MANAGE') },
    {
      href: '/admin/users',
      label: 'Staff accounts',
      allowed: (p) => hasPermission(p, 'CLINIC.MANAGE'),
    },
  ],
};

const STRIP_LABELS: Record<StaffHomeRole, string> = {
  // Replaced by "Today in this clinic" when the station line is off (the figures change too).
  DOCTOR: 'Your work',
  MANAGER: 'Station flow today',
  DIRECTOR: 'Clinic trends',
  SYSTEM_ADMIN: 'Network overview',
};

/**
 * One home for a person's main role in the active clinic (Phase W2, owner decision): a greeting
 * band with what is waiting and the role's two actions, four figures that matter to that role,
 * then its own work. Work their other roles hold is a short "Also on your plate" list. Volunteers
 * keep their own home in the page (W4).
 */
export function RoleHome({
  role,
  roles,
  data,
  perms,
  clinicId,
  clinicName,
  refresh,
  status,
  zoneFilter,
  onZoneFilterChange,
  isRefreshing,
}: {
  role: StaffHomeRole;
  /** Every role held in this clinic, for "Also on your plate". */
  roles: readonly string[];
  data: DashboardData | null;
  perms: string[];
  clinicId: string;
  clinicName?: string;
  refresh: ReactNode;
  /** Loading and error states, set under the band so the greeting never blanks. */
  status: ReactNode;
  zoneFilter: ZoneFilter;
  onZoneFilterChange: (filter: ZoneFilter) => void;
  isRefreshing: boolean;
}) {
  // The people who run the station line: managers, directors and system administrators (#24).
  const showStationFlow =
    role !== 'DOCTOR' &&
    isWebFeatureEnabled('stationWorkflow') &&
    hasPermission(perms, 'OPS.STATION.MANAGE');
  const flow = useStationFlow(showStationFlow ? clinicId : null);
  const live = flow.metrics?.live ? flow.metrics : null;
  // A manager's strip is the station line's when it is on and answering, else the clinic's counts.
  const flowStrip = showStationFlow && Boolean(flow.metrics || flow.loading);

  const actions = ACTIONS[role].filter((action) => action.allowed(perms)).slice(0, 2);
  const clinic = data
    ? { ...data.summary, pendingClinicalNoteCosigns: data.director?.pendingClinicalNoteCosigns }
    : undefined;

  let summary: ReactNode = 'Here is what is waiting in this clinic.';
  let figures: Figure[] | null = null;
  let work: ReactNode = null;

  if (role === 'DOCTOR') {
    const doctor = data?.doctor;
    const waiting = doctor
      ? [
          doctor.awaitingFinalization &&
            plural(doctor.awaitingFinalization, 'visit to sign off', 'visits to sign off'),
          doctor.pendingClinicalNoteCosigns &&
            plural(doctor.pendingClinicalNoteCosigns, 'HAP note to cosign', 'HAP notes to cosign'),
          data?.review?.awaitingReview &&
            plural(data.review.awaitingReview, 'visit to review', 'visits to review'),
        ].filter(Boolean)
      : [];
    summary = !doctor
      ? 'Your sign-offs, cosigns and reviews for this clinic.'
      : waiting.length
        ? `Waiting for you: ${waiting.join(', ')}.`
        : 'Nothing is waiting for your sign-off right now.';
    if (doctor) {
      figures = [
        {
          value: count.format(doctor.awaitingFinalization),
          tone: 'attention',
          label: 'in your queue',
        },
        { value: count.format(doctor.patientsSeen.today), label: 'finalized today' },
        { value: count.format(doctor.patientsSeen.week), label: 'finalized this week' },
        doctor.pendingClinicalNoteCosigns === undefined
          ? {
              value: doctor.followUpComplianceRate,
              unit: '%',
              label: 'care plans with a follow-up',
            }
          : {
              value: count.format(doctor.pendingClinicalNoteCosigns),
              tone: 'attention',
              label: 'HAP notes to cosign',
            },
      ];
      work = (
        <DoctorDashboard
          {...doctor}
          needs={<NeedsYouNow doctor={doctor} review={data?.review} worklistHref={null} />}
        >
          {data?.review ? <ReviewDashboard recentReviews={data.review.recentReviews} /> : null}
        </DoctorDashboard>
      );
    }
  }

  if (role === 'MANAGER') {
    summary = live
      ? `${plural(live.checkIns.total, 'patient', 'patients')} checked in so far, ${count.format(
          live.checkIns.inClinicNow,
        )} still in clinic.${
          live.bottleneckStationId
            ? ` ${live.stations.find((s) => s.stationId === live.bottleneckStationId)?.name ?? 'One station'} has the longest wait right now.`
            : ''
        }`
      : "Today's check-ins, the station line and the clinic's queues.";
    if (flowStrip) {
      figures = flow.metrics
        ? stationFlowFigures(flow.metrics).map((figure) => ({
            ...figure,
            value: typeof figure.value === 'number' ? count.format(figure.value) : figure.value,
          }))
        : [
            'checked in',
            'sessions completed',
            'left before finishing',
            'median time in clinic',
          ].map((label) => ({ value: '–', label }));
    } else if (data) {
      // Station line off or unreachable: the clinic's own counts, so the strip never invents.
      figures = [
        { value: count.format(data.summary.encountersToday), label: 'visits today' },
        {
          value: count.format(data.summary.pendingReview),
          tone: 'attention',
          label: 'waiting for review',
        },
        {
          value: count.format(data.summary.readyToFinalize),
          tone: 'attention',
          label: 'waiting for sign-off',
        },
        { value: count.format(data.summary.totalPatients), label: 'registered patients' },
      ];
    }
    work = data ? (
      <div className="space-y-10">
        <NeedsYouNow clinic={clinic} worklistHref={null} title="Needs attention" />
        {showStationFlow ? <StationFlowDashboard flow={flow} showFigures={false} /> : null}
      </div>
    ) : null;
  }

  if (role === 'DIRECTOR') {
    summary = `Clinic trends for ${clinicName ?? 'this clinic'} over the last 30 days.`;
    const director = data?.director;
    if (director && data) {
      figures = [
        { value: count.format(data.summary.totalPatients), label: 'registered patients' },
        {
          value: count.format(
            director.encounterVolumeTrend.reduce((sum, day) => sum + day.count, 0),
          ),
          label: 'visits in 30 days',
        },
        {
          value: director.screeningRates.hypertension,
          unit: '%',
          label: 'visits with a BP screen',
        },
        { value: director.followUpComplianceRate, unit: '%', label: 'care plans with a follow-up' },
      ];
      work = (
        <DirectorDashboard
          {...director}
          needs={<NeedsYouNow clinic={clinic} worklistHref={null} title="Needs attention" />}
        >
          {showStationFlow ? <StationFlowDashboard flow={flow} /> : null}
        </DirectorDashboard>
      );
    }
  }

  if (role === 'SYSTEM_ADMIN') {
    const admin = data?.systemAdmin;
    summary = admin
      ? `Network overview: ${plural(admin.systemWideEncounters, 'visit', 'visits')} recorded across ${plural(admin.totalClinics, 'clinic', 'clinics')}.`
      : 'Network overview across every clinic.';
    if (admin) {
      figures = [
        { value: count.format(admin.totalClinics), label: 'clinics' },
        {
          value: count.format(admin.zones.filter((zone) => zone.zoneCode !== null).length),
          label: 'zones',
        },
        { value: count.format(admin.totalUsers), label: 'staff accounts' },
        { value: count.format(admin.systemWidePatients), label: 'patients across clinics' },
      ];
      work = (
        <div className="space-y-10">
          <SystemAdminDashboard
            {...admin}
            zoneFilter={zoneFilter}
            onZoneFilterChange={onZoneFilterChange}
            isRefreshing={isRefreshing}
          />
          {/* The active clinic's line, after the network: admins run it too (#24). */}
          {showStationFlow ? <StationFlowDashboard flow={flow} /> : null}
        </div>
      );
    }
  }

  // Work the person's other roles hold here: counts and one link each, never their sections.
  const others = MAIN_ROLE_PRECEDENCE.filter((held) => held !== role && roles.includes(held));
  const alsoRows = data
    ? workRows({
        worklistHref: null,
        volunteer: others.includes('VOLUNTEER') ? data.volunteer : undefined,
        doctor: others.includes('DOCTOR') ? data.doctor : undefined,
        review: others.includes('DOCTOR') ? data.review : undefined,
        // Managers' and directors' homes already lead with the clinic's queue counts, and a
        // doctor's own sign-off rows say the same thing as the clinic's.
        clinic:
          role === 'SYSTEM_ADMIN' &&
          others.some((held) => held === 'DIRECTOR' || held === 'MANAGER')
            ? clinic
            : undefined,
      })
    : [];

  const measurements =
    role === 'DIRECTOR' || role === 'DOCTOR'
      ? (data?.director?.clinicalMeasurements ?? data?.doctor?.clinicalMeasurements)
      : undefined;

  return (
    <div className="space-y-8" data-main-role={role}>
      <VolunteerWelcome
        solo
        summary={summary}
        actions={
          <>
            {actions.map((action, index) => (
              <Button key={action.href} asChild variant={index === 0 ? 'default' : 'outline'}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
            {refresh}
          </>
        }
      />
      {status}
      {figures ? (
        <FigureStrip
          label={role === 'MANAGER' && !flowStrip ? 'Today in this clinic' : STRIP_LABELS[role]}
          figures={figures}
        />
      ) : null}
      {/* Waiting work comes before trends (PRODUCT principle 1), so it is one line each here. */}
      <AlsoOnYourPlate rows={alsoRows} />
      {work}
      {measurements ? <ClinicalMeasurementsDashboard metrics={measurements} /> : null}
    </div>
  );
}
