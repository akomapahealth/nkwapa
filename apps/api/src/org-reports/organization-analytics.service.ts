import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, EncounterStatus, Prisma } from '@prisma/client';
import { parseZoneFilter, zoneFilterMatches } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { isSystemAdmin } from '../auth/clinic-roles';
import { fillTrend } from './organization-report.aggregate';
import type { ReportActor } from './organization-report.service';
import {
  buildOrganizationAnalytics,
  resolveCohortRange,
  type AnalyticsWorkflow,
  type OrganizationAnalyticsBody,
} from './organization-analytics.aggregate';
import type { OrganizationAnalyticsQueryDto } from './dto/organization-analytics-query.dto';

/** Which filters narrow which part of the response. The UI says so beside the numbers. */
export const ANALYTICS_FILTERS_APPLY_TO = {
  encounters: ['from', 'to', 'clinicId', 'zoneCode', 'workflow', 'encounterStatus'],
  appointments: ['from', 'to', 'clinicId', 'zoneCode', 'appointmentStatus'],
} as const;

export interface OrganizationAnalytics extends OrganizationAnalyticsBody {
  organization: { id: string; name: string; slug: string; timezone: string };
  filters: {
    from: string;
    to: string;
    clinicId: string | null;
    zoneCode: string | null;
    workflow: AnalyticsWorkflow | null;
    encounterStatus: EncounterStatus | null;
    appointmentStatus: AppointmentStatus | null;
  };
  appliesTo: typeof ANALYTICS_FILTERS_APPLY_TO;
  generatedAt: string;
  encounterTrend: Array<{ date: string; count: number }>;
}

/**
 * The child table that puts an encounter in each workflow. A fixed map, never caller input,
 * because the name is spliced into SQL as an identifier.
 */
const WORKFLOW_TABLES: Record<AnalyticsWorkflow, Prisma.Sql> = {
  HYPERTENSION: Prisma.raw('"HypertensionAssessment"'),
  DIABETES: Prisma.raw('"DiabetesScreening"'),
  EYE: Prisma.raw('"EyeScreening"'),
  COUNSELLING: Prisma.raw('"CounsellingRecord"'),
};

const inWorkflow = (workflow: AnalyticsWorkflow) =>
  Prisma.sql`EXISTS (SELECT 1 FROM ${WORKFLOW_TABLES[workflow]} w WHERE w."encounterId" = e."id")`;

type EncounterCountsSqlRow = {
  clinicId: string;
  total: bigint;
  draft: bigint;
  inReview: bigint;
  finalized: bigint;
  hypertension: bigint;
  diabetes: bigint;
  eye: bigint;
  counselling: bigint;
};

/**
 * Cohort analytics across an organization's clinics. Issue #25.
 *
 * The fixed 30-day report (#13) answers "how is the organization doing"; this answers "how is
 * this slice of it doing": a date range, a clinic or zone, a condition workflow, an encounter or
 * appointment status. It reads aggregates only. No patient identifier leaves this service, which
 * keeps it apart from research exports and the de-identification rules they carry.
 *
 * Like the report, a fixed number of reads however many clinics are in scope, and system admins
 * only, checked here as well as by the permission behind the route.
 */
@Injectable()
export class OrganizationAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    actor: ReportActor,
    organizationId: string,
    query: OrganizationAnalyticsQueryDto,
    now: Date = new Date(),
  ): Promise<OrganizationAnalytics> {
    if (!isSystemAdmin(actor.roles as never)) {
      throw new ForbiddenException('Only System Admin can read organization analytics');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, timezone: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const range = resolveCohortRange(query, organization.timezone, now);
    if (!range.ok) {
      throw new BadRequestException(range.message);
    }

    // Every clinic in the organization, narrowed here rather than in SQL, so a clinic id from
    // another organization is told apart from one the zone filter happens to exclude.
    const allClinics = await this.prisma.clinic.findMany({
      where: { organizationId },
      select: { id: true, name: true, locationCode: true, zoneCode: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    if (query.clinicId && !allClinics.some((clinic) => clinic.id === query.clinicId)) {
      throw new BadRequestException('That clinic is not part of this organization');
    }
    const zoneFilter = parseZoneFilter(query.zoneCode);
    const clinics = allClinics.filter(
      (clinic) =>
        (!query.clinicId || clinic.id === query.clinicId) &&
        zoneFilterMatches(clinic.zoneCode, zoneFilter),
    );

    const header = {
      organization,
      filters: {
        from: range.from,
        to: range.to,
        clinicId: query.clinicId ?? null,
        zoneCode: zoneFilter,
        workflow: query.workflow ?? null,
        encounterStatus: query.encounterStatus ?? null,
        appointmentStatus: query.appointmentStatus ?? null,
      },
      appliesTo: ANALYTICS_FILTERS_APPLY_TO,
      generatedAt: now.toISOString(),
    };

    if (clinics.length === 0) {
      return {
        ...header,
        ...buildOrganizationAnalytics({
          clinics: [],
          encounters: [],
          patientsByClinic: new Map(),
          patientsOverall: 0,
          appointments: [],
        }),
        encounterTrend: fillTrend(range.days, []),
      };
    }

    const clinicIds = clinics.map((clinic) => clinic.id);
    const cohort = Prisma.join(
      [
        Prisma.sql`e."clinicId" IN (${Prisma.join(clinicIds.map((id) => Prisma.sql`${id}::uuid`))})`,
        Prisma.sql`e."createdAt" >= ${range.start}`,
        Prisma.sql`e."createdAt" < ${range.endExclusive}`,
        ...(query.encounterStatus
          ? [Prisma.sql`e."status" = ${query.encounterStatus}::"EncounterStatus"`]
          : []),
        ...(query.workflow ? [inWorkflow(query.workflow)] : []),
      ],
      ' AND ',
    );

    const [encounterRows, patientRows, trendRows, appointmentRows] = await Promise.all([
      this.prisma.$queryRaw<EncounterCountsSqlRow[]>`
        SELECT e."clinicId"::text AS "clinicId",
               count(*) AS "total",
               count(*) FILTER (WHERE e."status" = 'DRAFT') AS "draft",
               count(*) FILTER (WHERE e."status" = 'IN_REVIEW') AS "inReview",
               count(*) FILTER (WHERE e."status" = 'FINALIZED') AS "finalized",
               count(*) FILTER (WHERE ${inWorkflow('HYPERTENSION')}) AS "hypertension",
               count(*) FILTER (WHERE ${inWorkflow('DIABETES')}) AS "diabetes",
               count(*) FILTER (WHERE ${inWorkflow('EYE')}) AS "eye",
               count(*) FILTER (WHERE ${inWorkflow('COUNSELLING')}) AS "counselling"
        FROM "Encounter" e
        WHERE ${cohort}
        GROUP BY e."clinicId"
      `,
      /*
        Per clinic and overall in one read. The empty grouping set is the organization-wide
        distinct count, which is smaller than the sum whenever a patient was seen at two clinics.
      */
      this.prisma.$queryRaw<Array<{ clinicId: string | null; patients: bigint }>>`
        SELECT e."clinicId"::text AS "clinicId", count(DISTINCT e."patientId") AS "patients"
        FROM "Encounter" e
        WHERE ${cohort}
        GROUP BY GROUPING SETS ((e."clinicId"), ())
      `,
      this.prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT to_char((e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${organization.timezone}, 'YYYY-MM-DD') AS day,
               count(*) AS count
        FROM "Encounter" e
        WHERE ${cohort}
        GROUP BY 1
      `,
      // Appointments are dated by when they happen, not when they were booked.
      this.prisma.appointment.groupBy({
        by: ['clinicId', 'status'],
        where: {
          clinicId: { in: clinicIds },
          startsAt: { gte: range.start, lt: range.endExclusive },
          ...(query.appointmentStatus ? { status: query.appointmentStatus } : {}),
        },
        _count: true,
      }),
    ]);

    const patientsByClinic = new Map<string, number>();
    let patientsOverall = 0;
    for (const row of patientRows) {
      if (row.clinicId === null) patientsOverall = Number(row.patients);
      else patientsByClinic.set(row.clinicId, Number(row.patients));
    }

    return {
      ...header,
      ...buildOrganizationAnalytics({
        clinics,
        encounters: encounterRows.map((row) => ({
          clinicId: row.clinicId,
          total: Number(row.total),
          draft: Number(row.draft),
          inReview: Number(row.inReview),
          finalized: Number(row.finalized),
          hypertension: Number(row.hypertension),
          diabetes: Number(row.diabetes),
          eye: Number(row.eye),
          counselling: Number(row.counselling),
        })),
        patientsByClinic,
        patientsOverall,
        appointments: appointmentRows.map((row) => ({
          clinicId: row.clinicId,
          status: row.status,
          count: row._count,
        })),
      }),
      encounterTrend: fillTrend(
        range.days,
        trendRows.map((row) => ({ day: row.day, count: Number(row.count) })),
      ),
    };
  }
}
