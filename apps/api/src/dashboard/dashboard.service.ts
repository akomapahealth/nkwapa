import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DashboardResponse,
  DashboardSummary,
  DoctorMetrics,
  PreceptorMetrics,
  DirectorMetrics,
  VolunteerMetrics,
  SystemAdminMetrics,
  EncounterSummary,
  TrendPoint,
  StaffActivityRow,
  ClinicComparisonRow,
} from './dto/dashboard-response.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(
    clinicId: string,
    roles: string[],
    userId: string,
  ): Promise<DashboardResponse> {
    const summary = await this.getSummary(clinicId);

    const response: DashboardResponse = { summary };

    const isAdmin = roles.includes('SYSTEM_ADMIN');
    const isDoctor = roles.includes('DOCTOR');
    const isPreceptor = roles.includes('PRECEPTOR');
    const isDirector = roles.includes('DIRECTOR') || roles.includes('MANAGER');
    const isVolunteer = roles.includes('VOLUNTEER');

    if (isAdmin) {
      response.systemAdmin = await this.getSystemAdminMetrics();
    }
    if (isDoctor) {
      response.doctor = await this.getDoctorMetrics(clinicId, userId);
    }
    if (isPreceptor) {
      response.preceptor = await this.getPreceptorMetrics(clinicId, userId);
    }
    if (isDirector) {
      response.director = await this.getDirectorMetrics(clinicId);
    }
    if (isVolunteer) {
      response.volunteer = await this.getVolunteerMetrics(clinicId, userId);
    }

    return response;
  }

  private async getSummary(clinicId: string): Promise<DashboardSummary> {
    const todayStart = startOfDay(new Date());

    const [totalPatients, encountersToday, pendingDrafts, pendingReview, readyToFinalize] =
      await Promise.all([
        this.prisma.patient.count({ where: { primaryClinicId: clinicId } }),
        this.prisma.encounter.count({
          where: { clinicId, createdAt: { gte: todayStart } },
        }),
        this.prisma.encounter.count({
          where: { clinicId, status: 'DRAFT' },
        }),
        this.prisma.encounter.count({
          where: {
            clinicId,
            status: 'IN_REVIEW',
            preceptorReviewedById: null,
          },
        }),
        this.prisma.encounter.count({
          where: {
            clinicId,
            status: 'IN_REVIEW',
            preceptorReviewedById: { not: null },
            doctorFinalizedById: null,
          },
        }),
      ]);

    return { totalPatients, encountersToday, pendingDrafts, pendingReview, readyToFinalize };
  }

  private async getDoctorMetrics(clinicId: string, userId: string): Promise<DoctorMetrics> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const [
      awaitingFinalization,
      seenToday,
      seenWeek,
      seenMonth,
      htDistribution,
      diabetesScreenings,
      totalScreenings,
      carePlansWithFollowUp,
      carePlansTotal,
      recentRaw,
    ] = await Promise.all([
      this.prisma.encounter.count({
        where: {
          clinicId,
          status: 'IN_REVIEW',
          preceptorReviewedById: { not: null },
          doctorFinalizedById: null,
        },
      }),
      this.prisma.encounter.count({
        where: { clinicId, doctorFinalizedById: userId, updatedAt: { gte: todayStart } },
      }),
      this.prisma.encounter.count({
        where: { clinicId, doctorFinalizedById: userId, updatedAt: { gte: weekStart } },
      }),
      this.prisma.encounter.count({
        where: { clinicId, doctorFinalizedById: userId, updatedAt: { gte: monthStart } },
      }),
      this.prisma.hypertensionAssessment.groupBy({
        by: ['classification'],
        where: { clinicId },
        _count: true,
      }),
      this.prisma.diabetesScreening.count({
        where: {
          clinicId,
          OR: [
            { glucoseType: 'FASTING', glucoseMgDl: { gte: 126 } },
            { glucoseType: 'RANDOM', glucoseMgDl: { gte: 200 } },
          ],
        },
      }),
      this.prisma.diabetesScreening.count({ where: { clinicId } }),
      this.prisma.carePlan.count({
        where: { clinicId, followUpDate: { not: null } },
      }),
      this.prisma.carePlan.count({ where: { clinicId } }),
      this.prisma.encounter.findMany({
        where: { clinicId, doctorFinalizedById: userId, status: 'FINALIZED' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { patient: { select: { patientCode: true, firstName: true, lastName: true } } },
      }),
    ]);

    const hypertensionDistribution: Record<string, number> = {};
    for (const row of htDistribution) {
      hypertensionDistribution[row.classification] = row._count;
    }

    const followUpComplianceRate =
      carePlansTotal > 0 ? Math.round((carePlansWithFollowUp / carePlansTotal) * 100) : 0;

    const recentEncounters: EncounterSummary[] = recentRaw.map((e) => ({
      id: e.id,
      patientCode: e.patient.patientCode,
      patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      awaitingFinalization,
      patientsSeen: { today: seenToday, week: seenWeek, month: seenMonth },
      followUpComplianceRate,
      hypertensionDistribution,
      diabetesStats: { flagged: diabetesScreenings, total: totalScreenings },
      recentEncounters,
    };
  }

  private async getPreceptorMetrics(clinicId: string, userId: string): Promise<PreceptorMetrics> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    const [awaitingReview, reviewsToday, reviewsWeek, recentRaw] = await Promise.all([
      this.prisma.encounter.count({
        where: { clinicId, status: 'IN_REVIEW', preceptorReviewedById: null },
      }),
      this.prisma.encounter.count({
        where: { clinicId, preceptorReviewedById: userId, updatedAt: { gte: todayStart } },
      }),
      this.prisma.encounter.count({
        where: { clinicId, preceptorReviewedById: userId, updatedAt: { gte: weekStart } },
      }),
      this.prisma.encounter.findMany({
        where: { clinicId, preceptorReviewedById: userId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { patient: { select: { patientCode: true, firstName: true, lastName: true } } },
      }),
    ]);

    const recentReviews: EncounterSummary[] = recentRaw.map((e) => ({
      id: e.id,
      patientCode: e.patient.patientCode,
      patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      awaitingReview,
      reviewsCompleted: { today: reviewsToday, week: reviewsWeek },
      recentReviews,
    };
  }

  private async getDirectorMetrics(clinicId: string): Promise<DirectorMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      patientsByDay,
      encountersByDay,
      htDistribution,
      htScreeningCount,
      diabetesScreeningCount,
      totalEncounters,
      carePlansWithFollowUp,
      carePlansTotal,
      staffRaw,
    ] = await Promise.all([
      this.prisma.patient.groupBy({
        by: ['createdAt'],
        where: { primaryClinicId: clinicId, createdAt: { gte: thirtyDaysAgo } },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['createdAt'],
        where: { clinicId, createdAt: { gte: thirtyDaysAgo } },
        _count: true,
      }),
      this.prisma.hypertensionAssessment.groupBy({
        by: ['classification'],
        where: { clinicId },
        _count: true,
      }),
      this.prisma.hypertensionAssessment.count({ where: { clinicId } }),
      this.prisma.diabetesScreening.count({ where: { clinicId } }),
      this.prisma.encounter.count({ where: { clinicId } }),
      this.prisma.carePlan.count({ where: { clinicId, followUpDate: { not: null } } }),
      this.prisma.carePlan.count({ where: { clinicId } }),
      this.prisma.userClinicRole.findMany({
        where: { clinicId },
        include: { user: { select: { id: true, displayName: true } } },
      }),
    ]);

    // Aggregate patient registrations by date
    const patientRegistrationTrend = aggregateByDay(
      patientsByDay.map((r) => ({ date: r.createdAt, count: r._count })),
      thirtyDaysAgo,
      now,
    );

    // Aggregate encounter volume by date
    const encounterVolumeTrend = aggregateByDay(
      encountersByDay.map((r) => ({ date: r.createdAt, count: r._count })),
      thirtyDaysAgo,
      now,
    );

    const bpDistribution: Record<string, number> = {};
    for (const row of htDistribution) {
      bpDistribution[row.classification] = row._count;
    }

    const screeningRates = {
      hypertension: totalEncounters > 0 ? Math.round((htScreeningCount / totalEncounters) * 100) : 0,
      diabetes: totalEncounters > 0 ? Math.round((diabetesScreeningCount / totalEncounters) * 100) : 0,
    };

    const followUpComplianceRate =
      carePlansTotal > 0 ? Math.round((carePlansWithFollowUp / carePlansTotal) * 100) : 0;

    // Get staff activity
    const userIds = [...new Set(staffRaw.map((r) => r.userId))];
    const staffActivity: StaffActivityRow[] = [];

    for (const ur of staffRaw) {
      if (staffActivity.some((s) => s.userId === ur.userId)) continue;
      const [created, finalized] = await Promise.all([
        this.prisma.encounter.count({ where: { clinicId, createdByUserId: ur.userId } }),
        this.prisma.encounter.count({ where: { clinicId, doctorFinalizedById: ur.userId } }),
      ]);
      staffActivity.push({
        userId: ur.userId,
        displayName: ur.user.displayName,
        role: ur.role,
        encountersCreated: created,
        encountersFinalized: finalized,
      });
    }

    return {
      patientRegistrationTrend,
      encounterVolumeTrend,
      screeningRates,
      bpDistribution,
      followUpComplianceRate,
      staffActivity,
    };
  }

  private async getVolunteerMetrics(clinicId: string, userId: string): Promise<VolunteerMetrics> {
    const todayStart = startOfDay(new Date());

    const [patientsRegisteredToday, encountersCreatedToday, pendingSubmissions] =
      await Promise.all([
        this.prisma.patient.count({
          where: { primaryClinicId: clinicId, createdByUserId: userId, createdAt: { gte: todayStart } },
        }),
        this.prisma.encounter.count({
          where: { clinicId, createdByUserId: userId, createdAt: { gte: todayStart } },
        }),
        this.prisma.encounter.count({
          where: { clinicId, createdByUserId: userId, status: 'DRAFT' },
        }),
      ]);

    return { patientsRegisteredToday, encountersCreatedToday, pendingSubmissions };
  }

  private async getSystemAdminMetrics(): Promise<SystemAdminMetrics> {
    const [totalClinics, totalUsers, systemWidePatients, systemWideEncounters, clinics] =
      await Promise.all([
        this.prisma.clinic.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.patient.count(),
        this.prisma.encounter.count(),
        this.prisma.clinic.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
      ]);

    const clinicComparison: ClinicComparisonRow[] = [];
    for (const clinic of clinics) {
      const [patients, encounters, finalized] = await Promise.all([
        this.prisma.patient.count({ where: { primaryClinicId: clinic.id } }),
        this.prisma.encounter.count({ where: { clinicId: clinic.id } }),
        this.prisma.encounter.count({ where: { clinicId: clinic.id, status: 'FINALIZED' } }),
      ]);
      clinicComparison.push({
        clinicId: clinic.id,
        clinicName: clinic.name,
        totalPatients: patients,
        totalEncounters: encounters,
        totalFinalized: finalized,
      });
    }

    return { totalClinics, totalUsers, systemWidePatients, systemWideEncounters, clinicComparison };
  }
}

// ── helpers ──

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function aggregateByDay(
  rows: { date: Date; count: number }[],
  from: Date,
  to: Date,
): TrendPoint[] {
  const map = new Map<string, number>();
  // Initialize all days with 0
  const cursor = new Date(from);
  while (cursor <= to) {
    map.set(formatDate(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  // Fill in actual counts
  for (const row of rows) {
    const key = formatDate(row.date);
    map.set(key, (map.get(key) ?? 0) + row.count);
  }
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}
