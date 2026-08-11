import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DashboardResponse,
  DashboardSummary,
  DoctorMetrics,
  ReviewMetrics,
  DirectorMetrics,
  VolunteerMetrics,
  SystemAdminMetrics,
  EncounterSummary,
  TrendPoint,
  StaffActivityRow,
  ClinicComparisonRow,
  ClinicalMeasurementMetrics,
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
    const isDirector = roles.includes('DIRECTOR') || roles.includes('MANAGER');
    const isVolunteer = roles.includes('VOLUNTEER');
    const clinicalMeasurements =
      isDoctor || isDirector || isVolunteer
        ? await this.getClinicalMeasurementMetrics(clinicId)
        : null;

    if (isAdmin) {
      response.systemAdmin = await this.getSystemAdminMetrics();
    }
    if (isDoctor) {
      response.doctor = {
        ...(await this.getDoctorMetrics(clinicId, userId)),
        clinicalMeasurements: clinicalMeasurements!,
      };
      response.review = {
        ...(await this.getReviewMetrics(clinicId, userId)),
        clinicalMeasurements: clinicalMeasurements!,
      };
    }
    if (isDirector) {
      response.director = {
        ...(await this.getDirectorMetrics(clinicId)),
        clinicalMeasurements: clinicalMeasurements!,
      };
    }
    if (isVolunteer) {
      response.volunteer = {
        ...(await this.getVolunteerMetrics(clinicId, userId)),
        clinicalMeasurements: clinicalMeasurements!,
      };
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

  private async getDoctorMetrics(
    clinicId: string,
    userId: string,
  ): Promise<Omit<DoctorMetrics, 'clinicalMeasurements'>> {
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

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const finalizationsByDay = await this.prisma.encounter.groupBy({
      by: ['updatedAt'],
      where: {
        clinicId,
        doctorFinalizedById: userId,
        status: 'FINALIZED',
        updatedAt: { gte: fourteenDaysAgo },
      },
      _count: true,
    });
    const finalizationsTrend = aggregateByDay(
      finalizationsByDay.map((r) => ({ date: r.updatedAt, count: r._count })),
      fourteenDaysAgo,
      now,
    );

    return {
      awaitingFinalization,
      patientsSeen: { today: seenToday, week: seenWeek, month: seenMonth },
      followUpComplianceRate,
      hypertensionDistribution,
      diabetesStats: { flagged: diabetesScreenings, total: totalScreenings },
      recentEncounters,
      finalizationsTrend,
    };
  }

  private async getReviewMetrics(
    clinicId: string,
    userId: string,
  ): Promise<Omit<ReviewMetrics, 'clinicalMeasurements'>> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [awaitingReview, reviewsToday, reviewsWeek, recentRaw, reviewsByDay, htDistribution] =
      await Promise.all([
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
        this.prisma.encounter.findMany({
          where: {
            clinicId,
            preceptorReviewedById: userId,
            updatedAt: { gte: fourteenDaysAgo },
          },
          select: { updatedAt: true },
        }),
        this.prisma.hypertensionAssessment.groupBy({
          by: ['classification'],
          where: {
            clinicId,
            encounter: { preceptorReviewedById: userId },
          },
          _count: true,
        }),
      ]);

    const recentReviews: EncounterSummary[] = recentRaw.map((e) => ({
      id: e.id,
      patientCode: e.patient.patientCode,
      patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }));

    const reviewsTrend = aggregateByDay(
      reviewsByDay.map((r) => ({ date: r.updatedAt, count: 1 })),
      fourteenDaysAgo,
      now,
    );

    const bpDistribution: Record<string, number> = {};
    for (const row of htDistribution) {
      bpDistribution[row.classification] = row._count;
    }

    return {
      awaitingReview,
      reviewsCompleted: { today: reviewsToday, week: reviewsWeek },
      recentReviews,
      reviewsTrend,
      bpDistribution,
    };
  }

  private async getDirectorMetrics(
    clinicId: string,
  ): Promise<Omit<DirectorMetrics, 'clinicalMeasurements'>> {
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
      hypertension:
        totalEncounters > 0 ? Math.round((htScreeningCount / totalEncounters) * 100) : 0,
      diabetes:
        totalEncounters > 0 ? Math.round((diabetesScreeningCount / totalEncounters) * 100) : 0,
    };

    const followUpComplianceRate =
      carePlansTotal > 0 ? Math.round((carePlansWithFollowUp / carePlansTotal) * 100) : 0;

    const encounterStatusCounts = await this.prisma.encounter.groupBy({
      by: ['status'],
      where: { clinicId },
      _count: true,
    });
    const encounterStatusDistribution: Record<string, number> = {};
    for (const row of encounterStatusCounts) {
      encounterStatusDistribution[row.status] = row._count;
    }

    // Get staff activity
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
      encounterStatusDistribution,
    };
  }

  private async getVolunteerMetrics(
    clinicId: string,
    userId: string,
  ): Promise<Omit<VolunteerMetrics, 'clinicalMeasurements'>> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      patientsRegisteredToday,
      encountersCreatedToday,
      pendingSubmissions,
      patientsByDay,
      encountersByDay,
      statusCounts,
      htDistribution,
      diabetesFlagged,
      diabetesTotal,
    ] = await Promise.all([
      this.prisma.patient.count({
        where: {
          primaryClinicId: clinicId,
          createdByUserId: userId,
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.encounter.count({
        where: { clinicId, createdByUserId: userId, createdAt: { gte: todayStart } },
      }),
      this.prisma.encounter.count({
        where: { clinicId, createdByUserId: userId, status: 'DRAFT' },
      }),
      this.prisma.patient.groupBy({
        by: ['createdAt'],
        where: {
          primaryClinicId: clinicId,
          createdByUserId: userId,
          createdAt: { gte: fourteenDaysAgo },
        },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['createdAt'],
        where: {
          clinicId,
          createdByUserId: userId,
          createdAt: { gte: fourteenDaysAgo },
        },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['status'],
        where: { clinicId, createdByUserId: userId },
        _count: true,
      }),
      this.prisma.hypertensionAssessment.groupBy({
        by: ['classification'],
        where: { clinicId, encounter: { createdByUserId: userId } },
        _count: true,
      }),
      this.prisma.diabetesScreening.count({
        where: {
          clinicId,
          encounter: { createdByUserId: userId },
          OR: [
            { glucoseType: 'FASTING', glucoseMgDl: { gte: 126 } },
            { glucoseType: 'RANDOM', glucoseMgDl: { gte: 200 } },
          ],
        },
      }),
      this.prisma.diabetesScreening.count({
        where: { clinicId, encounter: { createdByUserId: userId } },
      }),
    ]);

    const patientsRegisteredTrend = aggregateByDay(
      patientsByDay.map((r) => ({ date: r.createdAt, count: r._count })),
      fourteenDaysAgo,
      now,
    );
    const encountersCreatedTrend = aggregateByDay(
      encountersByDay.map((r) => ({ date: r.createdAt, count: r._count })),
      fourteenDaysAgo,
      now,
    );
    const statusBreakdown: Record<string, number> = {};
    for (const row of statusCounts) {
      statusBreakdown[row.status] = row._count;
    }
    const bpDistribution: Record<string, number> = {};
    for (const row of htDistribution) {
      bpDistribution[row.classification] = row._count;
    }

    return {
      patientsRegisteredToday,
      encountersCreatedToday,
      pendingSubmissions,
      patientsRegisteredTrend,
      encountersCreatedTrend,
      statusBreakdown,
      bpDistribution,
      diabetesStats: { flagged: diabetesFlagged, total: diabetesTotal },
    };
  }

  private async getSystemAdminMetrics(): Promise<SystemAdminMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalClinics,
      totalUsers,
      systemWidePatients,
      systemWideEncounters,
      clinics,
      encountersByDay,
    ] = await Promise.all([
      this.prisma.clinic.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.patient.count(),
      this.prisma.encounter.count(),
      this.prisma.clinic.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.encounter.groupBy({
        by: ['createdAt'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: true,
      }),
    ]);

    const systemEncountersTrend = aggregateByDay(
      encountersByDay.map((r) => ({ date: r.createdAt, count: r._count })),
      thirtyDaysAgo,
      now,
    );

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

    return {
      totalClinics,
      totalUsers,
      systemWidePatients,
      systemWideEncounters,
      clinicComparison,
      systemEncountersTrend,
    };
  }

  private async getClinicalMeasurementMetrics(
    clinicId: string,
  ): Promise<ClinicalMeasurementMetrics> {
    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalEncounters, vitals, tobaccoScreens, tobaccoGroups] = await Promise.all([
      this.prisma.encounter.count({ where: { clinicId, createdAt: { gte: windowStart } } }),
      this.prisma.vitals.findMany({
        where: { clinicId, encounter: { createdAt: { gte: windowStart } } },
        select: {
          temperatureCelsius: true,
          respiratoryRate: true,
          spo2Percent: true,
          bmi: true,
        },
      }),
      this.prisma.tobaccoScreening.findMany({
        where: { clinicId, encounter: { createdAt: { gte: windowStart } } },
        select: {
          smokingStatus: true,
          smokelessTobaccoStatus: true,
          passiveExposure: true,
          counselingGiven: true,
          reviewedAt: true,
        },
      }),
      this.prisma.tobaccoScreening.groupBy({
        by: ['smokingStatus'],
        where: { clinicId, encounter: { createdAt: { gte: windowStart } } },
        _count: true,
      }),
    ]);

    const assessed = tobaccoScreens.filter(
      (screen) =>
        screen.smokingStatus !== 'NOT_ASSESSED' ||
        screen.smokelessTobaccoStatus !== 'NOT_ASSESSED' ||
        screen.passiveExposure !== 'NOT_ASSESSED',
    ).length;
    const currentUsers = tobaccoScreens.filter(
      (screen) => screen.smokingStatus === 'CURRENT' || screen.smokelessTobaccoStatus === 'CURRENT',
    );
    const counselingDocumented = currentUsers.filter(
      (screen) => screen.counselingGiven !== 'NOT_ASSESSED',
    ).length;
    const rate = (numerator: number, denominator: number) =>
      denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
    const aggregate = (values: Array<number | null>) => {
      const recorded = values.filter((value): value is number => value != null);
      return {
        count: recorded.length,
        average:
          recorded.length > 0
            ? Math.round((recorded.reduce((sum, value) => sum + value, 0) / recorded.length) * 10) /
              10
            : null,
      };
    };
    const tobaccoStatusDistribution: Record<string, number> = {};
    for (const group of tobaccoGroups)
      tobaccoStatusDistribution[group.smokingStatus] = group._count;

    return {
      windowDays: 30,
      sampleSize: totalEncounters,
      vitalsCaptureRate: rate(vitals.length, totalEncounters),
      tobaccoAssessmentRate: rate(assessed, totalEncounters),
      counselingDocumentationRate: rate(counselingDocumented, currentUsers.length),
      pendingTobaccoReviews: tobaccoScreens.filter((screen) => screen.reviewedAt == null).length,
      measurements: {
        temperatureCelsius: aggregate(vitals.map((record) => record.temperatureCelsius)),
        respiratoryRate: aggregate(vitals.map((record) => record.respiratoryRate)),
        spo2Percent: aggregate(vitals.map((record) => record.spo2Percent)),
        bmi: aggregate(vitals.map((record) => record.bmi)),
      },
      tobaccoStatusDistribution,
    };
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

function aggregateByDay(rows: { date: Date; count: number }[], from: Date, to: Date): TrendPoint[] {
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
