import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isSystemAdmin } from '../auth/clinic-roles';
import {
  buildOrganizationReport,
  fillTrend,
  windowDays,
  type CountsByClinic,
  type OrganizationReportBody,
} from './organization-report.aggregate';

/** The report's rolling window. Fixed, so two leaders reading the same day see the same numbers. */
export const ORGANIZATION_REPORT_WINDOW_DAYS = 30;

export interface ReportActor {
  userId: string;
  roles: Array<{ clinicId: string | null; role: UserRole | string }>;
}

export interface OrganizationReport extends OrganizationReportBody {
  organization: { id: string; name: string; slug: string; timezone: string };
  windowDays: number;
  windowStart: string;
  generatedAt: string;
  encounterTrend: Array<{ date: string; count: number }>;
}

type GroupRow = { clinicId?: string | null; primaryClinicId?: string | null; _count: number };

/**
 * An organization's dashboard, across all of its clinics at once. Issue #13.
 *
 * A fixed number of grouped queries, however many clinics the organization has: each metric is
 * one `groupBy` over `clinicId IN (...)` rather than one count per clinic. The old system admin
 * comparison issued 3N queries before it was rewritten the same way; this starts there.
 *
 * System admins only, checked here as well as by the permission behind the route. The permission
 * is granted to no role, so the admin wildcard is today the only way to hold it. It is named so an
 * organization-level role can be given exactly this later, without reopening the service.
 */
@Injectable()
export class OrganizationReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(
    actor: ReportActor,
    organizationId: string,
    now: Date = new Date(),
  ): Promise<OrganizationReport> {
    if (!isSystemAdmin(actor.roles as never)) {
      throw new ForbiddenException('Only System Admin can read organization reports');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, timezone: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const clinics = await this.prisma.clinic.findMany({
      where: { organizationId },
      select: { id: true, name: true, locationCode: true, zoneCode: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    const windowStart = new Date(
      now.getTime() - ORGANIZATION_REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const days = windowDays(now, ORGANIZATION_REPORT_WINDOW_DAYS, organization.timezone);
    const header = {
      organization,
      windowDays: ORGANIZATION_REPORT_WINDOW_DAYS,
      windowStart: windowStart.toISOString(),
      generatedAt: now.toISOString(),
    };

    if (clinics.length === 0) {
      return {
        ...header,
        ...buildOrganizationReport(emptyInputs()),
        encounterTrend: fillTrend(days, []),
      };
    }

    const clinicIds = clinics.map((clinic) => clinic.id);
    const inClinics = { clinicId: { in: clinicIds } };
    const inWindow = { gte: windowStart };

    const [
      patients,
      newPatients,
      encountersInWindow,
      finalizedInWindow,
      openDrafts,
      awaitingReview,
      readyToFinalize,
      hypertensionScreenings,
      diabetesScreenings,
      carePlans,
      carePlansWithFollowUp,
      staffSeats,
      trendRows,
    ] = await Promise.all([
      // Merged-away charts are tombstones, not patients.
      this.prisma.patient.groupBy({
        by: ['primaryClinicId'],
        where: { primaryClinicId: { in: clinicIds }, mergedIntoPatientId: null },
        _count: true,
      }),
      this.prisma.patient.groupBy({
        by: ['primaryClinicId'],
        where: {
          primaryClinicId: { in: clinicIds },
          mergedIntoPatientId: null,
          createdAt: inWindow,
        },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, createdAt: inWindow },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, createdAt: inWindow, status: 'FINALIZED' },
        _count: true,
      }),
      // The backlog is current state, not windowed: an old draft is still an open draft.
      this.prisma.encounter.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, status: 'DRAFT' },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, status: 'IN_REVIEW', preceptorReviewedById: null },
        _count: true,
      }),
      this.prisma.encounter.groupBy({
        by: ['clinicId'],
        where: {
          ...inClinics,
          status: 'IN_REVIEW',
          preceptorReviewedById: { not: null },
          doctorFinalizedById: null,
        },
        _count: true,
      }),
      // By collectedAt: when the screening happened, and the column indexed with clinicId.
      this.prisma.hypertensionAssessment.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, collectedAt: inWindow },
        _count: true,
      }),
      this.prisma.diabetesScreening.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, collectedAt: inWindow },
        _count: true,
      }),
      this.prisma.carePlan.groupBy({ by: ['clinicId'], where: inClinics, _count: true }),
      this.prisma.carePlan.groupBy({
        by: ['clinicId'],
        where: { ...inClinics, followUpDate: { not: null } },
        _count: true,
      }),
      this.prisma.userClinicRole.findMany({
        where: {
          ...inClinics,
          role: { not: UserRole.PATIENT },
          user: { isActive: true },
        },
        select: { clinicId: true, userId: true },
      }),
      /*
        One grouped read in SQL rather than a Prisma groupBy on createdAt, which returns a row per
        distinct timestamp: in effect one per encounter. Days are the organization's calendar days.
      */
      this.prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${organization.timezone}, 'YYYY-MM-DD') AS day,
               count(*) AS count
        FROM "Encounter"
        WHERE "clinicId" IN (${Prisma.join(clinicIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND "createdAt" >= ${windowStart}
        GROUP BY 1
      `,
    ]);

    return {
      ...header,
      ...buildOrganizationReport({
        clinics,
        patients: byClinic(patients),
        newPatients: byClinic(newPatients),
        encountersInWindow: byClinic(encountersInWindow),
        finalizedInWindow: byClinic(finalizedInWindow),
        openDrafts: byClinic(openDrafts),
        awaitingReview: byClinic(awaitingReview),
        readyToFinalize: byClinic(readyToFinalize),
        hypertensionScreenings: byClinic(hypertensionScreenings),
        diabetesScreenings: byClinic(diabetesScreenings),
        carePlans: byClinic(carePlans),
        carePlansWithFollowUp: byClinic(carePlansWithFollowUp),
        staffSeats: staffSeats.filter(
          (seat): seat is { clinicId: string; userId: string } => seat.clinicId !== null,
        ),
      }),
      encounterTrend: fillTrend(
        days,
        trendRows.map((row) => ({ day: row.day, count: Number(row.count) })),
      ),
    };
  }
}

function byClinic(rows: GroupRow[]): CountsByClinic {
  const counts: CountsByClinic = new Map();
  for (const row of rows) {
    const clinicId = row.clinicId ?? row.primaryClinicId;
    if (clinicId) counts.set(clinicId, row._count);
  }
  return counts;
}

function emptyInputs() {
  const none: CountsByClinic = new Map();
  return {
    clinics: [],
    patients: none,
    newPatients: none,
    encountersInWindow: none,
    finalizedInWindow: none,
    openDrafts: none,
    awaitingReview: none,
    readyToFinalize: none,
    hypertensionScreenings: none,
    diabetesScreenings: none,
    carePlans: none,
    carePlansWithFollowUp: none,
    staffSeats: [],
  };
}
