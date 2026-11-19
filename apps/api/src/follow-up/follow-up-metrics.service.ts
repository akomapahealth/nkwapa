import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type FollowUpTier } from '@prisma/client';
import {
  addMonths,
  DEFAULT_FOLLOW_UP_CONFIG,
  formatPersonName,
  type CardiometabolicConditionValue,
  type FollowUpConfig,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { readingsFrom } from './follow-up-input';
import {
  computeFollowUpMetrics,
  contactPatientSets,
  contactRowsIn,
  monthKey,
  monthRange,
  parseMonth,
  patientSetsAt,
  shiftMonth,
  TREND_MONTHS,
  type FollowUpMetricFigure,
  type FollowUpMetricsReport,
  type MetricsAssessment,
  type MetricsPatient,
} from './follow-up-metrics';

/** The most names one figure lists; `total` says how many there are. */
const DRILL_DOWN_LIMIT = 500;

interface AssessmentRow {
  patientId: string;
  computedAt: Date;
  tier: FollowUpTier;
  hypertensionDiagnosed: boolean | null;
  onTreatment: boolean | null;
  conditions: CardiometabolicConditionValue[] | null;
  timeZone: string | null;
}

/** Which clinics a report covers, and the zone its months are counted in. */
export interface MetricsScope {
  clinicIds: string[];
  timeZone: string | null;
}

/** The monthly follow-up indicators (#339). Loads rows; `follow-up-metrics.ts` counts them. */
@Injectable()
export class FollowUpMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** One clinic, in its own zone. */
  async clinicScope(clinicId: string): Promise<MetricsScope> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return { clinicIds: [clinicId], timeZone: clinic?.timezone ?? null };
  }

  /** Every clinic in an organization, in the organization's zone. */
  async organizationScope(organizationId: string): Promise<MetricsScope> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, clinics: { select: { id: true } } },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return {
      clinicIds: organization.clinics.map((clinic) => clinic.id),
      timeZone: organization.timezone,
    };
  }

  /** `month` defaults to the current one; a month that has not started is refused. */
  resolveMonth(month: string | undefined, now: Date, timeZone: string | null): string {
    const resolved = month ?? monthKey(now, timeZone);
    if (!parseMonth(resolved) || monthRange(resolved, now, timeZone).start > now) {
      throw new BadRequestException('month must be YYYY-MM and not in the future');
    }
    return resolved;
  }

  async report(
    scope: MetricsScope,
    month: string,
    now: Date = new Date(),
    config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
  ): Promise<FollowUpMetricsReport> {
    const [patients, activity] = await Promise.all([
      this.loadPatients(scope, month, now, config),
      this.loadActivity(scope, month, now),
    ]);
    return computeFollowUpMetrics({
      month,
      now,
      timeZone: scope.timeZone,
      config,
      patients,
      ...activity,
    });
  }

  /** The patients behind one figure, for roles with PATIENT.READ. Same rules as the count. */
  async patients(
    scope: MetricsScope,
    month: string,
    figure: FollowUpMetricFigure,
    now = new Date(),
  ) {
    const range = monthRange(month, now, scope.timeZone);
    let ids: string[];
    if (figure.startsWith('contacts:')) {
      const { contacts, attempts } = await this.loadActivity(scope, month, now);
      const sets = contactPatientSets(contactRowsIn(contacts, attempts, month, range));
      ids = sets[figure as keyof typeof sets];
    } else {
      const patients = await this.loadPatients(scope, month, now, DEFAULT_FOLLOW_UP_CONFIG);
      const previous = monthRange(shiftMonth(month, -1), now, scope.timeZone);
      ids = patientSetsAt(patients, range.cut, previous.cut)[figure];
    }
    const rows = await this.prisma.patient.findMany({
      where: { id: { in: ids.slice(0, DRILL_DOWN_LIMIT) } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        primaryClinicId: true,
        patientCode: true,
        firstName: true,
        lastName: true,
      },
    });
    return {
      total: ids.length,
      patients: rows.map((row) => ({
        id: row.id,
        clinicId: row.primaryClinicId,
        patientCode: row.patientCode,
        name: formatPersonName(row, 'short'),
      })),
    };
  }

  private async loadPatients(
    { clinicIds, timeZone }: MetricsScope,
    month: string,
    now: Date,
    config: FollowUpConfig,
  ): Promise<MetricsPatient[]> {
    const last = monthRange(month, now, timeZone).cut;
    const first = monthRange(shiftMonth(month, -TREND_MONTHS), now, timeZone).cut;
    const readFrom = addMonths(
      first,
      -Math.max(config.underCareWindowMonths, config.controlWindowMonths),
    );
    const patientWhere = {
      primaryClinicId: { in: clinicIds },
      mergedIntoPatientId: null,
    } satisfies Prisma.PatientWhereInput;
    const clinics = Prisma.join(clinicIds.map((id) => Prisma.sql`${id}::uuid`));
    const columns = Prisma.sql`
      a."patientId", a."computedAt", a."tier",
      (a."inputSnapshot"->>'hypertensionDiagnosed')::boolean AS "hypertensionDiagnosed",
      (a."inputSnapshot"->'onTreatment'->>'hypertension')::boolean AS "onTreatment",
      a."inputSnapshot"->'conditions' AS "conditions",
      a."inputSnapshot"->>'timeZone' AS "timeZone"`;
    const from = Prisma.sql`
      FROM "PatientRiskAssessment" a
      JOIN "Patient" p ON p."id" = a."patientId"
      WHERE p."primaryClinicId" IN (${clinics}) AND p."mergedIntoPatientId" IS NULL`;

    // Each month-end needs the row in force then: the latest before the first month-end, then
    // every row after it. Bounded by the trend window rather than the whole history.
    const [before, during, encounters, selfReports, measurements, deaths, people] =
      await Promise.all([
        this.prisma.$queryRaw<AssessmentRow[]>`
          SELECT DISTINCT ON (a."patientId") ${columns} ${from} AND a."computedAt" <= ${first}
          ORDER BY a."patientId", a."computedAt" DESC`,
        this.prisma.$queryRaw<AssessmentRow[]>`
          SELECT ${columns} ${from} AND a."computedAt" > ${first} AND a."computedAt" <= ${last}
          ORDER BY a."computedAt" ASC`,
        this.prisma.encounter.findMany({
          where: { patient: patientWhere, createdAt: { gte: readFrom, lte: last } },
          select: {
            patientId: true,
            createdAt: true,
            vitals: { select: { systolicBp: true, diastolicBp: true } },
            hypertensionAssessment: {
              select: {
                collectedAt: true,
                repeatSystolicBp: true,
                repeatDiastolicBp: true,
                repeatMeasuredAt: true,
                homeSystolicAvg: true,
                homeDiastolicAvg: true,
              },
            },
          },
        }),
        config.selfReportedCountsTowardControl
          ? this.prisma.patientSelfReport.findMany({
              where: {
                patient: patientWhere,
                type: 'HOME_BP',
                recordedAt: { gte: readFrom, lte: last },
              },
              select: {
                patientId: true,
                type: true,
                systolicBp: true,
                diastolicBp: true,
                recordedAt: true,
              },
            })
          : [],
        this.prisma.patientMeasurement.findMany({
          where: { patient: patientWhere, type: 'BP', recordedAt: { gte: readFrom, lte: last } },
          select: {
            patientId: true,
            type: true,
            source: true,
            recordedAt: true,
            payloadJson: true,
          },
        }),
        this.prisma.followUpContact.findMany({
          where: {
            patient: patientWhere,
            status: 'CANCELLED',
            cancelReason: 'DECEASED',
            cancelledAt: { lte: last },
          },
          select: { patientId: true, cancelledAt: true },
        }),
        this.prisma.patient.findMany({ where: patientWhere, select: { id: true, dob: true } }),
      ]);

    const byPatient = new Map<string, MetricsPatient>();
    for (const person of people) {
      byPatient.set(person.id, {
        id: person.id,
        dob: person.dob,
        assessments: [],
        readings: [],
        deceasedReportedAt: [],
        visitAt: [],
      });
    }
    for (const row of [...before, ...during]) {
      byPatient.get(row.patientId)?.assessments.push(toAssessment(row));
    }
    const group = <T extends { patientId: string }>(rows: T[]) => {
      const out = new Map<string, T[]>();
      for (const row of rows) out.set(row.patientId, [...(out.get(row.patientId) ?? []), row]);
      return out;
    };
    const encountersOf = group(encounters);
    const selfReportsOf = group(selfReports);
    const measurementsOf = group(measurements);
    for (const death of deaths) {
      if (death.cancelledAt)
        byPatient.get(death.patientId)?.deceasedReportedAt.push(death.cancelledAt);
    }
    for (const patient of byPatient.values()) {
      const visits = encountersOf.get(patient.id) ?? [];
      patient.visitAt = visits.map((visit) => visit.createdAt);
      patient.readings = readingsFrom({
        encounters: visits.map((visit) => ({
          createdAt: visit.createdAt,
          vitals: visit.vitals,
          hypertension: visit.hypertensionAssessment,
        })),
        selfReports: selfReportsOf.get(patient.id) ?? [],
        measurements: measurementsOf.get(patient.id) ?? [],
      });
    }
    return [...byPatient.values()].filter((patient) => patient.assessments.length > 0);
  }

  private async loadActivity({ clinicIds, timeZone }: MetricsScope, month: string, now: Date) {
    const range = monthRange(month, now, timeZone);
    const trendStart = monthRange(shiftMonth(month, -(TREND_MONTHS - 1)), now, timeZone).start;
    const inClinics = { clinicId: { in: clinicIds } };
    // `dueOn` is a calendar date, so its month is a range of dates, not of instants.
    const dueFrom = new Date(`${month}-01T00:00:00Z`);
    const dueTo = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`);
    const [contacts, attempts, flags] = await Promise.all([
      this.prisma.followUpContact.findMany({
        where: {
          ...inClinics,
          OR: [
            { dueOn: { gte: dueFrom, lt: dueTo } },
            { completedAt: { gte: range.start, lt: range.end } },
            { missedAt: { gte: trendStart, lt: range.end } },
          ],
        },
        select: {
          patientId: true,
          mode: true,
          status: true,
          dueOn: true,
          completedAt: true,
          missedAt: true,
        },
      }),
      this.prisma.followUpAttempt.findMany({
        where: { ...inClinics, at: { gte: range.start, lt: range.end } },
        select: { patientId: true, mode: true, outcome: true, at: true },
      }),
      this.prisma.patientRiskFlag.findMany({
        where: { ...inClinics, kind: 'URGENT', raisedAt: { gte: range.start, lt: range.end } },
        select: {
          patientId: true,
          raisedAt: true,
          acknowledgement: { select: { createdAt: true } },
        },
      }),
    ]);
    const calls =
      flags.length === 0
        ? []
        : await this.prisma.followUpAttempt.findMany({
            where: {
              patientId: { in: [...new Set(flags.map((flag) => flag.patientId))] },
              outcome: { not: 'ATTEMPTED' },
              at: { gte: range.start },
              contact: { purpose: 'URGENT_CONFIRMATION' },
            },
            orderBy: { at: 'asc' },
            select: { patientId: true, at: true },
          });
    return {
      contacts,
      attempts,
      urgentFlags: flags.map((flag) => ({
        raisedAt: flag.raisedAt,
        acknowledgedAt: flag.acknowledgement?.createdAt ?? null,
        confirmationCallAt:
          calls.find((call) => call.patientId === flag.patientId && call.at >= flag.raisedAt)?.at ??
          null,
      })),
    };
  }
}

function toAssessment(row: AssessmentRow): MetricsAssessment {
  return {
    computedAt: row.computedAt,
    tier: row.tier,
    hypertensionDiagnosed: row.hypertensionDiagnosed === true,
    onHypertensionTreatment: row.onTreatment === true,
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    timeZone: row.timeZone,
  };
}
