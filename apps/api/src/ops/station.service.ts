import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PushService } from '../push/push.service';
import {
  DOCTOR_REQUEST_VIEW_SELECT,
  DoctorRequestService,
  toDoctorRequestView,
} from './doctor-request.service';
import { Prisma, StationKind, StationVisitStatus } from '@prisma/client';
import {
  CLINIC_DEFAULT_TIMEZONE,
  clinicDayWindow,
  lineFlagsFor,
  mergeLineFlags,
  nextStationId,
  parseLineFlags,
  worstLineFlag,
  type ClinicDayWindow,
  type HypertensionSymptomValue,
  type LineFlag,
  type LineFlagSource,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type LogWriteParams } from '../audit/audit.service';
import { isUniqueViolation } from '../common/prisma-errors';
import { lockForTransaction } from '../prisma/transaction-lock';
import { hasPermissionAtClinic } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';
import { createDraftEncounter } from './draft-encounter';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';
import { REAL_PATIENT } from '../common/demo-patients';
import { computeStationMetrics } from './station-metrics';
import { resolveReplayTime } from './ops-replay';
import type {
  CompleteStationVisitDto,
  CreateStationDto,
  CorrectPerformerDto,
  MoveCheckInDto,
  ScreenerDto,
  UpdateStationDto,
} from './dto/station.dto';

type TxClient = Prisma.TransactionClient;

/** A shift's screener columns (#227), with the directory link (#226). */
export type ShiftScreener = {
  screenerIsAccountHolder: boolean;
  screenerName: string | null;
  screenerVolunteerContactId: string | null;
};

/** The visit end reason for a patient still in the line when the clinic day was closed. */
export const CLINIC_CLOSED_REASON = 'CLINIC_CLOSED';

const EMPTY_READINGS: KeyReadings = { bp: null, glucose: null, bmi: null };

/** A check-in whose patient has not yet finished or left. */
const OPEN_CHECK_IN_STATUSES = ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] as const;

/** A visit a patient is still waiting at or being seen in. At most one per check-in (SQL). */
const OPEN_VISIT_STATUSES: StationVisitStatus[] = ['QUEUED', 'IN_PROGRESS'];

const USER_SUMMARY = { select: { id: true, displayName: true } } as const;

/** How many directory names the screener field suggests (#227, #226). */
const SCREENER_NAME_LIMIT = 200;

const VISIT_INCLUDE = {
  station: { select: { id: true, kind: true, name: true, sortOrder: true } },
  claimedBy: USER_SUMMARY,
  assignedBy: USER_SUMMARY,
  completedBy: USER_SUMMARY,
  patientCheckIn: {
    select: {
      id: true,
      status: true,
      checkedInAt: true,
      encounterId: true,
      dayNumber: true,
      lineFlags: true,
      // The open "Ask a doctor" (#418), at most one by a partial unique index.
      doctorRequests: { where: { resolvedAt: null }, take: 1, select: DOCTOR_REQUEST_VIEW_SELECT },
      patient: {
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          dob: true,
          isDemo: true,
        },
      },
    },
  },
} satisfies Prisma.PatientStationVisitInclude;

type VisitWithContext = Prisma.PatientStationVisitGetPayload<{ include: typeof VISIT_INCLUDE }>;

/** The three readings a doctor scans before taking a patient at review (#419). */
export type KeyReadings = {
  bp: { systolic: number; diastolic: number } | null;
  glucose: { mgDl: number; type: string } | null;
  bmi: number | null;
};

function openDoctorRequest(visit: VisitWithContext) {
  // Optional: visits built without the relation (older fixtures, hand-made rows) have none.
  const row = visit.patientCheckIn.doctorRequests?.[0];
  return row ? toDoctorRequestView(row) : null;
}

/** Who did a stop before its latest correction, and who corrected it when (#307). */
export type PerformerCorrection = {
  previousPerformer: string | null;
  correctedAt: string;
  correctedBy: { id: string; displayName: string };
  reason: string | null;
};

/** An audit row's JSON column, or an empty object if it is missing or not an object. */
function parseAuditJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface StationActor {
  userId: string;
  /** Holds OPS.STATION.MANAGE at this clinic. Decided by the controller from the guard's roles. */
  canManage: boolean;
}

export interface StationWriteContext {
  requestId?: string;
  /** A hand-off queued offline (#423): when it happened on the device. */
  occurredAt?: Date;
}

/** Who did a stop, as stored on the visit (#227). */
type Performer = {
  performedByIsAccountHolder: boolean;
  performedByName: string | null;
  /** The directory entry the name was picked from (#226); the name stays the snapshot. */
  performedByVolunteerContactId: string | null;
};

/**
 * The station line (#167).
 *
 * A checked-in patient joins the first station's queue. Whoever is free at a station claims the
 * next patient, records that station's data and hands them on; the review station's volunteer
 * completes the session, and a doctor reviews the encounter afterwards.
 *
 * Every transition is a conditional update on the visit's status, so two people acting on the
 * same patient at once resolve to exactly one winner, and each writes its audit event inside the
 * transaction that made the change.
 */
@Injectable()
export class StationService {
  private readonly logger = new Logger(StationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly push?: PushService,
    @Optional() private readonly doctorRequests?: DoctorRequestService,
  ) {}

  // ── Stations ────────────────────────────────────────────────────────────────────────────

  async listStations(clinicId: string) {
    const stations = await this.prisma.clinicStation.findMany({
      where: { clinicId },
      orderBy: { sortOrder: 'asc' },
    });
    return { items: stations.map((station) => this.toStation(station)) };
  }

  async createStation(
    clinicId: string,
    actor: StationActor,
    dto: CreateStationDto,
    context: StationWriteContext = {},
  ) {
    this.requireManage(actor);
    try {
      const station = await this.prisma.$transaction(async (tx) => {
        await lockForTransaction(tx, `clinic-stations:${clinicId}`);
        const last = await tx.clinicStation.findFirst({
          where: { clinicId },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        const created = await tx.clinicStation.create({
          data: {
            clinicId,
            kind: dto.kind,
            name: dto.name,
            capacity: dto.capacity ?? 1,
            sortOrder: (last?.sortOrder ?? 0) + 1,
          },
        });
        await this.audit(tx, clinicId, actor.userId, context, {
          action: 'STATION.CREATE',
          entityType: 'ClinicStation',
          entityId: created.id,
          afterJson: JSON.stringify(created),
        });
        return created;
      });
      return this.toStation(station);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.reviewStationExists();
      throw error;
    }
  }

  async updateStation(
    clinicId: string,
    stationId: string,
    actor: StationActor,
    dto: UpdateStationDto,
    context: StationWriteContext = {},
  ) {
    this.requireManage(actor);
    try {
      const station = await this.prisma.$transaction(async (tx) => {
        // The lock setShiftStation takes, so nobody picks this station while it closes (#228).
        if (dto.active === false) await lockForTransaction(tx, `clinic-stations:${clinicId}`);
        const existing = await this.findStation(tx, clinicId, stationId);
        if (dto.active === false && existing.active) {
          if (existing.kind === StationKind.REVIEW) {
            throw new ConflictException({
              code: 'REVIEW_STATION_REQUIRED',
              message:
                'The review station completes every session. Add another review station first.',
            });
          }
          const open = await tx.patientStationVisit.count({
            where: { stationId, status: { in: OPEN_VISIT_STATUSES } },
          });
          if (open > 0) {
            throw new ConflictException({
              code: 'STATION_HAS_PATIENTS',
              message: 'Move the patients waiting at this station before closing it.',
              openVisits: open,
            });
          }
        }
        const updated = await tx.clinicStation.update({
          where: { id: stationId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
            ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          },
        });
        await this.audit(tx, clinicId, actor.userId, context, {
          action: 'STATION.UPDATE',
          entityType: 'ClinicStation',
          entityId: stationId,
          beforeJson: JSON.stringify(existing),
          afterJson: JSON.stringify(updated),
        });
        if (dto.active === false && existing.active) {
          await this.releaseShiftsAt(tx, clinicId, stationId, actor, context);
        }
        return updated;
      });
      return this.toStation(station);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.reviewStationExists();
      throw error;
    }
  }

  /** Set the default route. Every station of the clinic must be named exactly once. */
  async reorderStations(
    clinicId: string,
    actor: StationActor,
    stationIds: string[],
    context: StationWriteContext = {},
  ) {
    this.requireManage(actor);
    await this.prisma.$transaction(async (tx) => {
      await lockForTransaction(tx, `clinic-stations:${clinicId}`);
      const existing = await tx.clinicStation.findMany({ where: { clinicId } });
      const known = new Set(existing.map((station) => station.id));
      if (stationIds.length !== existing.length || stationIds.some((id) => !known.has(id))) {
        throw new BadRequestException({
          code: 'STATION_ORDER_INCOMPLETE',
          message: 'List every station of this clinic exactly once.',
        });
      }
      // (clinicId, sortOrder) is unique, so move every row out of the way before placing it.
      for (const [index, id] of stationIds.entries()) {
        await tx.clinicStation.update({ where: { id }, data: { sortOrder: -(index + 1) } });
      }
      for (const [index, id] of stationIds.entries()) {
        await tx.clinicStation.update({ where: { id }, data: { sortOrder: index + 1 } });
      }
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'STATION.REORDER',
        entityType: 'Clinic',
        entityId: clinicId,
        beforeJson: JSON.stringify(
          [...existing].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id),
        ),
        afterJson: JSON.stringify(stationIds),
      });
    });
    return this.listStations(clinicId);
  }

  /** A closed station keeps nobody: whoever was working there chooses again (#228). */
  private async releaseShiftsAt(
    tx: TxClient,
    clinicId: string,
    stationId: string,
    actor: StationActor,
    context: StationWriteContext,
  ) {
    const where = { clinicId, stationId, status: 'ACTIVE' as const };
    const shifts = await tx.staffShift.findMany({ where, select: { id: true } });
    if (!shifts.length) return;
    await tx.staffShift.updateMany({ where, data: { stationId: null } });
    for (const shift of shifts) {
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'SHIFT.STATION.UPDATE',
        entityType: 'StaffShift',
        entityId: shift.id,
        beforeJson: JSON.stringify({ stationId }),
        afterJson: JSON.stringify({ stationId: null, reason: 'STATION_DEACTIVATED' }),
      });
    }
  }

  /** The station the caller is working right now, on their own active shift. */
  async setShiftStation(
    clinicId: string,
    shiftId: string,
    actor: StationActor,
    stationId: string | null,
    context: StationWriteContext = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.staffShift.findUnique({ where: { id: shiftId } });
      if (!shift || shift.clinicId !== clinicId) {
        throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: 'Shift not found' });
      }
      if (shift.userId !== actor.userId) {
        throw new ForbiddenException('You can only choose a station on your own shift');
      }
      if (shift.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'SHIFT_ALREADY_CLOSED',
          message: 'Start a shift before choosing a station',
        });
      }
      if (stationId) {
        // Held until commit, so a station closing at the same moment waits and then clears this.
        await lockForTransaction(tx, `clinic-stations:${clinicId}`);
        const station = await this.findStation(tx, clinicId, stationId);
        if (!station.active) throw this.stationInactive();
      }
      const updated = await tx.staffShift.update({
        where: { id: shiftId },
        data: { stationId },
      });
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'SHIFT.STATION.UPDATE',
        entityType: 'StaffShift',
        entityId: shiftId,
        beforeJson: JSON.stringify({ stationId: shift.stationId }),
        afterJson: JSON.stringify({ stationId }),
      });
      return { shiftId: updated.id, stationId: updated.stationId };
    });
  }

  /** Who is really working on the caller's account (#227), until changed or check-out. */
  async setShiftScreener(
    clinicId: string,
    shiftId: string,
    actor: StationActor,
    dto: ScreenerDto,
    context: StationWriteContext = {},
  ) {
    const performer = await this.toPerformer(this.prisma, clinicId, dto);
    const data = {
      screenerIsAccountHolder: performer.performedByIsAccountHolder,
      screenerName: performer.performedByName,
      screenerVolunteerContactId: performer.performedByVolunteerContactId,
    };
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.staffShift.findUnique({ where: { id: shiftId } });
      if (!shift || shift.clinicId !== clinicId) {
        throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: 'Shift not found' });
      }
      if (shift.userId !== actor.userId) {
        throw new ForbiddenException('You can only say who is screening on your own shift');
      }
      if (shift.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'SHIFT_ALREADY_CLOSED',
          message: 'Start a shift before saying who is screening',
        });
      }
      const updated = await tx.staffShift.update({ where: { id: shiftId }, data });
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'SHIFT.SCREENER.UPDATE',
        entityType: 'StaffShift',
        entityId: shiftId,
        beforeJson: JSON.stringify({
          screenerIsAccountHolder: shift.screenerIsAccountHolder,
          screenerName: shift.screenerName,
        }),
        afterJson: JSON.stringify(data),
      });
      return {
        shiftId: updated.id,
        screenerIsAccountHolder: updated.screenerIsAccountHolder,
        screenerName: updated.screenerName,
      };
    });
  }

  /**
   * Fix who did a finished stop (#227). The account that completed it may, until the session's
   * counselling is locked; a manager may at any time.
   */
  async correctPerformer(
    clinicId: string,
    visitId: string,
    actor: StationActor,
    dto: CorrectPerformerDto,
    context: StationWriteContext = {},
  ) {
    const performer = await this.toPerformer(this.prisma, clinicId, dto);
    const visit = await this.prisma.$transaction(async (tx) => {
      const before = await this.loadVisitInClinic(tx, clinicId, visitId);
      if (before.status !== 'COMPLETED' && before.status !== 'SKIPPED') {
        throw new ConflictException({
          code: 'STATION_VISIT_NOT_FINISHED',
          message: 'Only a finished stop can be corrected.',
        });
      }
      if (!actor.canManage) {
        const locked = before.encounterId
          ? await tx.counsellingRecord.findUnique({
              where: { encounterId: before.encounterId },
              select: { lockedAt: true },
            })
          : null;
        if (before.completedByUserId !== actor.userId || locked?.lockedAt) {
          throw new ForbiddenException({
            code: 'STATION_PERFORMER_CORRECTION_FORBIDDEN',
            message:
              'Only the account that finished this stop can correct it, until the session is locked. Ask a manager.',
          });
        }
      }
      await tx.patientStationVisit.update({ where: { id: visitId }, data: performer });
      const updated = await this.loadVisit(tx, visitId);
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'STATION.PERFORMER.CORRECT',
        entityType: 'PatientStationVisit',
        entityId: visitId,
        beforeJson: JSON.stringify(this.auditShape(before)),
        afterJson: JSON.stringify({ ...this.auditShape(updated), reason: dto.reason }),
      });
      return updated;
    });
    return this.toVisit(visit);
  }

  // ── Reads ───────────────────────────────────────────────────────────────────────────────

  /**
   * Every station with the patients waiting at or being seen in it, for one clinic day.
   *
   * One read serves both the volunteer's station queue and the manager's board, so the two can
   * never disagree about where a patient is.
   */
  async getBoard(clinicId: string, date?: string) {
    const day = await this.dayWindow(clinicId, date);
    const [stations, visits, myShifts] = await Promise.all([
      this.prisma.clinicStation.findMany({
        where: { clinicId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.patientStationVisit.findMany({
        where: {
          clinicId,
          status: { in: OPEN_VISIT_STATUSES },
          patientCheckIn: { checkedInAt: { gte: day.start, lte: day.end } },
        },
        include: VISIT_INCLUDE,
        orderBy: { queuedAt: 'asc' },
      }),
      this.prisma.staffShift.findMany({
        where: { clinicId, status: 'ACTIVE' },
        select: {
          id: true,
          stationId: true,
          roleAtShift: true,
          screenerIsAccountHolder: true,
          screenerName: true,
          user: USER_SUMMARY,
        },
        orderBy: { checkedInAt: 'asc' },
      }),
    ]);
    const [previous, readings] = await Promise.all([
      this.previousVisits(visits.map((visit) => visit.patientCheckInId)),
      this.keyReadingsFor(visits.filter((visit) => visit.station.kind === StationKind.REVIEW)),
    ]);
    const holding = new Map<string, number>();
    for (const visit of visits) {
      if (visit.status === 'IN_PROGRESS' && visit.claimedByUserId) {
        holding.set(visit.claimedByUserId, (holding.get(visit.claimedByUserId) ?? 0) + 1);
      }
    }

    return {
      date: day.date,
      timezone: day.timezone,
      stations: stations.map((station) => ({
        ...this.toStation(station),
        // Patients being seen now, against how many the station can see at once (#32).
        inUse: visits.filter(
          (visit) => visit.stationId === station.id && visit.status === 'IN_PROGRESS',
        ).length,
        staff: myShifts
          .filter((shift) => shift.stationId === station.id)
          .map((shift) => ({ ...shift.user, screenerName: this.screenerNameOf(shift) })),
        visits: visits
          .filter((visit) => visit.stationId === station.id)
          .map((visit) => ({
            ...this.toVisit(visit, previous.get(visit.patientCheckInId)),
            ...(visit.station.kind === StationKind.REVIEW && {
              keyReadings: (visit.encounterId && readings.get(visit.encounterId)) || EMPTY_READINGS,
            }),
          })),
      })),
      // Everyone a manager could hand a patient to, and how many patients each is holding now.
      onShift: myShifts.map((shift) => ({
        shiftId: shift.id,
        user: shift.user,
        screenerName: this.screenerNameOf(shift),
        roleAtShift: shift.roleAtShift,
        stationId: shift.stationId,
        activeVisitCount: holding.get(shift.user.id) ?? 0,
      })),
    };
  }

  /**
   * Patients waiting at review today, for the nav badge (#419). Null unless the caller's active
   * shift is at the review station, so the badge only shows to whoever is working it.
   */
  async getReviewWaitingCount(clinicId: string, userId: string) {
    const shift = await this.prisma.staffShift.findFirst({
      where: { clinicId, userId, status: 'ACTIVE' },
      select: { station: { select: { id: true, kind: true } } },
    });
    if (shift?.station?.kind !== StationKind.REVIEW) return { count: null };
    const day = await this.dayWindow(clinicId);
    const count = await this.prisma.patientStationVisit.count({
      where: {
        clinicId,
        stationId: shift.station.id,
        status: 'QUEUED',
        patientCheckIn: { checkedInAt: { gte: day.start, lte: day.end } },
      },
    });
    return { count };
  }

  /** BP, glucose and BMI per encounter, from the same rows `raiseLineFlags` reads. */
  private async keyReadingsFor(visits: VisitWithContext[]) {
    const encounterIds = [
      ...new Set(visits.flatMap((visit) => (visit.encounterId ? [visit.encounterId] : []))),
    ];
    const readings = new Map<string, KeyReadings>();
    if (encounterIds.length === 0) return readings;
    const where = { encounterId: { in: encounterIds } };
    const [vitals, diabetes] = await Promise.all([
      this.prisma.vitals.findMany({
        where,
        select: { encounterId: true, systolicBp: true, diastolicBp: true, bmi: true },
      }),
      this.prisma.diabetesScreening.findMany({
        where,
        select: { encounterId: true, glucoseMgDl: true, glucoseType: true },
      }),
    ]);
    const glucose = new Map(diabetes.map((row) => [row.encounterId, row]));
    const vitalsBy = new Map(vitals.map((row) => [row.encounterId, row]));
    for (const id of encounterIds) {
      const v = vitalsBy.get(id);
      const g = glucose.get(id);
      readings.set(id, {
        bp:
          v?.systolicBp != null && v.diastolicBp != null
            ? { systolic: v.systolicBp, diastolic: v.diastolicBp }
            : null,
        glucose: g?.glucoseMgDl != null ? { mgDl: g.glucoseMgDl, type: g.glucoseType } : null,
        bmi: v?.bmi ?? null,
      });
    }
    return readings;
  }

  /**
   * Wait-time and throughput for one clinic day (#24): every check-in that day, its station
   * visits, and the shifts that overlapped it. Aggregated in `computeStationMetrics`; nothing
   * that names a patient is read.
   */
  /**
   * The clinic's active volunteer directory (#226), for the screener field (#227). Each item
   * carries its contact id, which the field sends back so the stop links to the directory entry.
   */
  async getScreenerNames(clinicId: string) {
    const contacts = await this.prisma.volunteerContact.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: SCREENER_NAME_LIMIT,
    });
    return {
      items: contacts.map((contact) => ({
        name: contact.displayName,
        volunteerContactId: contact.id,
      })),
    };
  }

  async getMetrics(
    clinicId: string,
    date?: string,
    now: Date = new Date(),
    { realOnly = false }: { realOnly?: boolean } = {},
  ) {
    const day = await this.dayWindow(clinicId, date);
    const inDay = { gte: day.start, lte: day.end };
    const patient = realOnly ? REAL_PATIENT : undefined;
    const [stations, checkIns, visits, shifts] = await Promise.all([
      this.prisma.clinicStation.findMany({
        where: { clinicId },
        select: {
          id: true,
          name: true,
          kind: true,
          sortOrder: true,
          active: true,
          capacity: true,
        },
      }),
      this.prisma.patientCheckIn.findMany({
        where: { clinicId, checkedInAt: inDay, patient },
        select: { id: true, checkedInAt: true, status: true },
      }),
      this.prisma.patientStationVisit.findMany({
        where: { clinicId, patientCheckIn: { checkedInAt: inDay, patient } },
        select: {
          stationId: true,
          patientCheckInId: true,
          status: true,
          queuedAt: true,
          claimedAt: true,
          completedAt: true,
          releaseCount: true,
          claimedByUserId: true,
        },
      }),
      this.prisma.staffShift.findMany({
        where: {
          clinicId,
          checkedInAt: { lte: day.end },
          OR: [{ checkedOutAt: null }, { checkedOutAt: { gte: day.start } }],
        },
        select: { userId: true, stationId: true, status: true },
      }),
    ]);
    return computeStationMetrics({ day, now, stations, checkIns, visits, shifts });
  }

  /**
   * How one clinic day went (#421): the station metrics for real patients, plus the clinical
   * flags, the clinical work still open and who was on shift. Counts only; nothing names a patient
   * or ranks a member of staff. Demo patients are left out and counted on their own line.
   */
  async getDaySummary(clinicId: string, date?: string, now: Date = new Date()) {
    const metrics = await this.getMetrics(clinicId, date, now, { realOnly: true });
    const day = await this.dayWindow(clinicId, metrics.date);
    const inDay = { gte: day.start, lte: day.end };
    const realDay = { clinicId, checkedInAt: inDay, patient: REAL_PATIENT };
    const encounterOfDay = { patientCheckIn: realDay };

    const [checkIns, demoCheckIns, referrals, encounters, pendingNotes, shifts] = await Promise.all(
      [
        this.prisma.patientCheckIn.findMany({
          where: realDay,
          select: { patientId: true, lineFlags: true },
        }),
        this.prisma.patientCheckIn.count({
          where: { clinicId, checkedInAt: inDay, patient: { isDemo: true } },
        }),
        this.prisma.counsellingRecord.groupBy({
          by: ['referralUrgency'],
          where: { referralRecommended: true, encounter: encounterOfDay },
          _count: { _all: true },
        }),
        this.prisma.encounter.groupBy({
          by: ['status'],
          where: { ...encounterOfDay, status: { in: ['DRAFT', 'IN_REVIEW'] } },
          _count: { _all: true },
        }),
        // Notes are readable only by clinicians under RLS; this definer function gives a manager
        // the count without the notes. It is clinic-wide, not this day's, so the page says so.
        this.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT app.clinical_note_pending_count(${clinicId}::uuid) AS count
        `,
        this.prisma.staffShift.findMany({
          where: {
            clinicId,
            checkedInAt: { lte: day.end },
            OR: [{ checkedOutAt: null }, { checkedOutAt: { gte: day.start } }],
          },
          select: { userId: true, roleAtShift: true },
        }),
      ],
    );

    // Returning: seen at this clinic on an earlier day.
    const patientIds = [...new Set(checkIns.map((checkIn) => checkIn.patientId))];
    const returning = patientIds.length
      ? (
          await this.prisma.patientCheckIn.findMany({
            where: { clinicId, patientId: { in: patientIds }, checkedInAt: { lt: day.start } },
            distinct: ['patientId'],
            select: { patientId: true },
          })
        ).length
      : 0;

    const flagCount = (source: 'BP' | 'GLUCOSE', kind: 'REFER_TODAY' | 'REPEAT_AT_REVIEW') =>
      checkIns.filter((checkIn) =>
        ((checkIn.lineFlags ?? []) as unknown as LineFlag[]).some(
          (flag) => flag.source === source && flag.kind === kind,
        ),
      ).length;
    const referralsBy = (urgency: string | null) =>
      referrals.find((row) => row.referralUrgency === urgency)?._count._all ?? 0;
    const encountersBy = (status: string) =>
      encounters.find((row) => row.status === status)?._count._all ?? 0;
    // One person on several shifts in a day (a station change) is one person.
    const onShift = (role: 'VOLUNTEER' | 'DOCTOR' | 'MANAGER') =>
      new Set(shifts.filter((shift) => shift.roleAtShift === role).map((shift) => shift.userId))
        .size;

    return {
      metrics,
      demoCheckIns,
      patients: { new: patientIds.length - returning, returning },
      clinical: {
        referrals: {
          urgent: referralsBy('URGENT'),
          soon: referralsBy('SOON'),
          routine: referralsBy('ROUTINE'),
          unspecified: referralsBy(null),
        },
        bpReferToday: flagCount('BP', 'REFER_TODAY'),
        bpRecheck: flagCount('BP', 'REPEAT_AT_REVIEW'),
        glucoseReferToday: flagCount('GLUCOSE', 'REFER_TODAY'),
        glucoseRaised: flagCount('GLUCOSE', 'REPEAT_AT_REVIEW'),
      },
      openWork: {
        drafts: encountersBy('DRAFT'),
        inReview: encountersBy('IN_REVIEW'),
        notesToCosignAnyDay: Number(pendingNotes[0]?.count ?? 0),
      },
      staff: {
        volunteers: onShift('VOLUNTEER'),
        doctors: onShift('DOCTOR'),
        managers: onShift('MANAGER'),
      },
    };
  }

  async getVisit(clinicId: string, visitId: string) {
    const visit = await this.prisma.patientStationVisit.findUnique({
      where: { id: visitId },
      include: VISIT_INCLUDE,
    });
    if (!visit || visit.clinicId !== clinicId) throw this.visitNotFound();
    const timeline = await this.getTimeline(clinicId, visit.patientCheckInId);
    const corrections = await this.performerCorrections(clinicId, [visit]);
    return {
      ...this.toVisit(visit, undefined, corrections.get(visit.id)),
      timeline: timeline.items,
    };
  }

  async getTimeline(clinicId: string, checkInId: string) {
    const checkIn = await this.prisma.patientCheckIn.findUnique({
      where: { id: checkInId },
      select: { clinicId: true },
    });
    if (!checkIn || checkIn.clinicId !== clinicId) {
      throw new NotFoundException('Check-in not found');
    }
    const visits = await this.prisma.patientStationVisit.findMany({
      where: { patientCheckInId: checkInId },
      include: VISIT_INCLUDE,
      orderBy: [{ queuedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const corrections = await this.performerCorrections(clinicId, visits);
    return {
      items: visits.map((visit) => this.toVisit(visit, undefined, corrections.get(visit.id))),
    };
  }

  /** The station visit (if any) an encounter's patient is open at, with the encounter's line. */
  async getEncounterTimeline(clinicId: string, encounterId: string) {
    const visits = await this.prisma.patientStationVisit.findMany({
      where: { clinicId, encounterId },
      include: VISIT_INCLUDE,
      orderBy: [{ queuedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const corrections = await this.performerCorrections(clinicId, visits);
    return {
      items: visits.map((visit) => this.toVisit(visit, undefined, corrections.get(visit.id))),
    };
  }

  // ── The line ────────────────────────────────────────────────────────────────────────────

  /**
   * Put a new check-in in the first station's queue. Called inside the check-in's transaction, so
   * an arrival is never recorded without a place in the line. A clinic with no active station has
   * no line to join; the check-in stays WAITING for a manager to move.
   */
  async queueAtFirstStation(
    tx: TxClient,
    params: { clinicId: string; checkInId: string; actorUserId: string; at: Date },
    context: StationWriteContext = {},
  ) {
    const first = await tx.clinicStation.findFirst({
      where: { clinicId: params.clinicId, active: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!first) return null;
    const visit = await tx.patientStationVisit.create({
      data: {
        clinicId: params.clinicId,
        patientCheckInId: params.checkInId,
        stationId: first.id,
        status: 'QUEUED',
        queuedAt: params.at,
        queuedByUserId: params.actorUserId,
      },
    });
    await this.audit(tx, params.clinicId, params.actorUserId, context, {
      action: 'STATION.QUEUE',
      entityType: 'PatientStationVisit',
      entityId: visit.id,
      afterJson: JSON.stringify(visit),
    });
    return { ...visit, stationName: first.name };
  }

  /**
   * "Register and start": the person who just checked a patient in takes them at once, when their
   * shift is at the station the patient was queued at. Otherwise the patient waits in the line.
   */
  async claimIfAtStation(
    tx: TxClient,
    clinicId: string,
    visit: { id: string; stationId: string },
    userId: string,
    context: StationWriteContext = {},
  ) {
    const shift = await tx.staffShift.findFirst({
      where: { clinicId, userId, status: 'ACTIVE' },
      select: { stationId: true },
    });
    if (!shift || shift.stationId !== visit.stationId) return null;
    return this.claimInTx(tx, clinicId, visit.id, userId, userId, context);
  }

  /**
   * Take the patient at this station.
   *
   * The update only applies while the visit is still QUEUED, which is the whole race: the second
   * of two simultaneous claims changes no row and is told who got there first. The first claim of
   * a check-in also opens its encounter, so every station after it records into the same one.
   */
  async claim(
    clinicId: string,
    visitId: string,
    actor: StationActor,
    context: StationWriteContext = {},
  ) {
    await this.requireActiveShift(clinicId, actor.userId);
    const visit = await this.prisma.$transaction((tx) =>
      this.claimInTx(tx, clinicId, visitId, actor.userId, actor.userId, context),
    );
    return this.toVisit(visit);
  }

  /**
   * Manager override: hand a waiting patient to a named person on shift, so the patient does not
   * wait for someone to notice them.
   *
   * This is the same claim a volunteer makes for themselves, only made on their behalf, so it
   * races a self-claim exactly as two self-claims race each other: whichever update reaches the
   * QUEUED row first wins and the other is told who has the patient. An assignee who is already
   * with someone is allowed; the board shows how many patients each person holds, and a doctor
   * reviewing several at once is normal.
   */
  async assign(
    clinicId: string,
    visitId: string,
    assigneeUserId: string,
    actor: StationActor,
    context: StationWriteContext = {},
  ) {
    this.requireManage(actor);
    await this.requireAssignableStaff(clinicId, assigneeUserId);
    const visit = await this.prisma.$transaction((tx) =>
      this.claimInTx(tx, clinicId, visitId, assigneeUserId, actor.userId, context, {
        assignedByUserId: actor.userId,
      }),
    );
    // Who assigned, never which patient (#250).
    if (assigneeUserId !== actor.userId) {
      this.push?.notify([assigneeUserId], {
        title: 'A patient was assigned to you',
        body: visit.assignedBy ? `Assigned by ${visit.assignedBy.displayName}.` : undefined,
        url: '/stations',
        tag: 'assigned',
        kind: 'ASSIGNMENT',
        clinicId,
      });
    }
    return this.toVisit(visit);
  }

  /** Put the patient back in this station's queue for someone else. */
  async release(
    clinicId: string,
    visitId: string,
    actor: StationActor,
    reason: string,
    context: StationWriteContext & { force?: boolean } = {},
  ) {
    if (context.force) this.requireManage(actor);
    const visit = await this.prisma.$transaction(async (tx) => {
      const before = await this.loadVisitInClinic(tx, clinicId, visitId);
      // A manager forcing a release didn't do the stop, and can't say who did.
      const performer = context.force
        ? {
            performedByIsAccountHolder: null,
            performedByName: null,
            performedByVolunteerContactId: null,
          }
        : await this.performerFor(tx, clinicId, actor.userId);
      const released = await tx.patientStationVisit.updateMany({
        where: {
          id: visitId,
          status: 'IN_PROGRESS',
          ...(context.force ? {} : { claimedByUserId: actor.userId }),
        },
        data: {
          status: 'QUEUED',
          claimedByUserId: null,
          claimedAt: null,
          assignedByUserId: null,
          endReason: reason,
          releaseCount: { increment: 1 },
          ...performer,
        },
      });
      if (released.count === 0) throw this.notYourVisit(before);
      const updated = await this.loadVisit(tx, visitId);
      await this.audit(tx, clinicId, actor.userId, context, {
        action: context.force ? 'STATION.FORCE_RELEASE' : 'STATION.RELEASE',
        entityType: 'PatientStationVisit',
        entityId: visitId,
        beforeJson: JSON.stringify(this.auditShape(before)),
        afterJson: JSON.stringify(this.auditShape(updated)),
      });
      return updated;
    });
    return this.toVisit(visit);
  }

  /**
   * Hand the patient on.
   *
   * The next stop is the caller's choice, or the next active station by order with any skipped
   * stations passed over (each recorded with its reason). The review station has no next stop:
   * completing it completes the session, moves the encounter to IN_REVIEW for a doctor, and locks
   * the counselling record.
   */
  async complete(
    clinicId: string,
    visitId: string,
    actor: StationActor,
    dto: CompleteStationVisitDto,
    context: StationWriteContext = {},
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const visit = await this.loadVisitInClinic(tx, clinicId, visitId);
      if (visit.status !== 'IN_PROGRESS' || visit.claimedByUserId !== actor.userId) {
        throw this.notYourVisit(visit);
      }
      const now = context.occurredAt
        ? await this.replayTime(tx, clinicId, context.occurredAt, visit.claimedAt)
        : new Date();
      const stations = await tx.clinicStation.findMany({ where: { clinicId } });
      const isReview = visit.station.kind === StationKind.REVIEW;
      const lineFlags = await this.raiseLineFlags(tx, visit, now);

      let nextId: string | null = null;
      const skips = dto.skips ?? [];
      if (!isReview) {
        for (const skip of skips) {
          const station = stations.find((s) => s.id === skip.stationId);
          if (!station) throw new NotFoundException('Station not found');
          if (station.kind === StationKind.REVIEW) {
            throw new BadRequestException({
              code: 'REVIEW_STATION_REQUIRED',
              message: 'The review station cannot be skipped; it completes the session.',
            });
          }
        }
        if (dto.nextStationId) {
          const target = stations.find((s) => s.id === dto.nextStationId);
          if (!target) throw new NotFoundException('Station not found');
          if (!target.active) throw this.stationInactive();
          if (target.id === visit.stationId) {
            throw new BadRequestException({
              code: 'STATION_SAME_AS_CURRENT',
              message: 'Choose a different station, or release the patient back to this queue.',
            });
          }
          nextId = target.id;
        } else {
          nextId = nextStationId(
            stations,
            visit.stationId,
            new Set(skips.map((skip) => skip.stationId)),
          );
        }
        if (!nextId) {
          throw new ConflictException({
            code: 'NO_NEXT_STATION',
            message: 'This clinic has no active review station to send the patient to.',
          });
        }
      } else {
        if (skips.length || dto.nextStationId || dto.skipReason) {
          throw new BadRequestException({
            code: 'REVIEW_COMPLETES_SESSION',
            message: 'Completing the review station ends the session; there is no next station.',
          });
        }
        const counselling = visit.encounterId
          ? await tx.counsellingRecord.findUnique({ where: { encounterId: visit.encounterId } })
          : null;
        if (!counselling) {
          throw new ConflictException({
            code: 'COUNSELLING_REQUIRED',
            message: 'Record the counselling given before completing the session.',
          });
        }
        // Warns, never blocks: the client asks, then sends acknowledgeNoReferral (#415).
        if (
          worstLineFlag(lineFlags) === 'REFER_TODAY' &&
          !counselling.referralRecommended &&
          !dto.acknowledgeNoReferral
        ) {
          throw new ConflictException({
            code: 'REFERRAL_NOT_RECORDED',
            message:
              'No referral recorded for a refer-today reading. Record it in counselling, or complete anyway.',
          });
        }
      }

      const before = parseLineFlags(visit.patientCheckIn.lineFlags);
      if (JSON.stringify(lineFlags) !== JSON.stringify(before)) {
        await tx.patientCheckIn.update({
          where: { id: visit.patientCheckInId },
          data: { lineFlags: lineFlags as unknown as Prisma.InputJsonValue },
        });
      }

      const performer = await this.performerFor(tx, clinicId, actor.userId, dto.screener);
      const completed = await tx.patientStationVisit.updateMany({
        where: { id: visitId, status: 'IN_PROGRESS', claimedByUserId: actor.userId },
        data: {
          ...performer,
          status: dto.skipReason ? 'SKIPPED' : 'COMPLETED',
          completedByUserId: actor.userId,
          completedAt: now,
          handoffNote: dto.handoffNote?.trim() || null,
          ...(dto.skipReason ? { endReason: dto.skipReason.trim() } : {}),
        },
      });
      if (completed.count === 0) throw this.notYourVisit(visit);

      for (const skip of skips) {
        const skipped = await tx.patientStationVisit.create({
          data: {
            clinicId,
            patientCheckInId: visit.patientCheckInId,
            encounterId: visit.encounterId,
            stationId: skip.stationId,
            status: 'SKIPPED',
            queuedAt: now,
            queuedByUserId: actor.userId,
            completedByUserId: actor.userId,
            completedAt: now,
            endReason: skip.reason,
            ...performer,
          },
        });
        await this.audit(tx, clinicId, actor.userId, context, {
          action: 'STATION.SKIP',
          entityType: 'PatientStationVisit',
          entityId: skipped.id,
          afterJson: JSON.stringify(skipped),
        });
      }

      let next = null;
      if (nextId) {
        next = await tx.patientStationVisit.create({
          data: {
            clinicId,
            patientCheckInId: visit.patientCheckInId,
            encounterId: visit.encounterId,
            stationId: nextId,
            status: 'QUEUED',
            queuedAt: now,
            queuedByUserId: actor.userId,
          },
        });
      } else {
        await this.completeSession(tx, clinicId, visit, actor.userId, now, context);
      }

      const updated = await this.loadVisit(tx, visitId);
      const referNow =
        worstLineFlag(lineFlags) === 'REFER_TODAY' && worstLineFlag(before) !== 'REFER_TODAY';
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'STATION.COMPLETE',
        entityType: 'PatientStationVisit',
        entityId: visitId,
        beforeJson: JSON.stringify(this.auditShape(visit)),
        afterJson: JSON.stringify({ ...this.auditShape(updated), nextVisitId: next?.id ?? null }),
      });
      const refer = referNow ? lineFlags.find((flag) => flag.kind === 'REFER_TODAY') : undefined;
      return { updated, next, refer };
    });
    // A refer-today reading asks for a doctor with no tap (#418), once the hand-off has landed.
    const doctorRequested = Boolean(
      result.refer &&
      result.next &&
      (await this.autoRequestDoctor(clinicId, result.next.id, actor.userId, result.refer.source)),
    );
    return {
      visit: this.toVisit(result.updated),
      nextVisitId: result.next?.id ?? null,
      nextStationId: result.next?.stationId ?? null,
      sessionCompleted: result.next === null,
      doctorRequested,
    };
  }

  /** Never fails the hand-off: the flag still travels, and a doctor can still be asked by hand. */
  private async autoRequestDoctor(
    clinicId: string,
    nextVisitId: string,
    actorUserId: string,
    source: LineFlagSource,
  ): Promise<boolean> {
    if (!this.doctorRequests) return false;
    try {
      await this.doctorRequests.request(clinicId, nextVisitId, actorUserId, {
        urgency: 'NOW',
        reason: source === 'BP' ? 'HIGH_BP' : 'HIGH_GLUCOSE',
        auto: true,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Automatic doctor request failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * The check-in's flags once this station's readings are counted (#415): the encounter's
   * readings so far, through the shared rules, merged so a flag is never taken back.
   */
  private async raiseLineFlags(
    tx: Prisma.TransactionClient,
    visit: VisitWithContext,
    now: Date,
  ): Promise<LineFlag[]> {
    const before = parseLineFlags(visit.patientCheckIn.lineFlags);
    if (!visit.encounterId) return before;
    const where = { encounterId: visit.encounterId };
    const [vitals, diabetes, hypertension] = await Promise.all([
      tx.vitals.findUnique({ where, select: { systolicBp: true, diastolicBp: true } }),
      tx.diabetesScreening.findUnique({
        where,
        select: { glucoseMgDl: true, glucoseType: true, urgentSymptoms: true },
      }),
      tx.hypertensionAssessment.findUnique({ where, select: { currentSymptoms: true } }),
    ]);
    const raised = lineFlagsFor(
      {
        systolic: vitals?.systolicBp,
        diastolic: vitals?.diastolicBp,
        glucoseMgDl: diabetes?.glucoseMgDl,
        glucoseType: diabetes?.glucoseType,
        hypertensionSymptoms: hypertension?.currentSymptoms as
          | HypertensionSymptomValue[]
          | undefined,
        diabetesUrgentSymptoms: diabetes?.urgentSymptoms,
      },
      now,
    );
    return mergeLineFlags(
      before,
      raised.map((flag) => ({ ...flag, stationName: visit.station.name, at: now.toISOString() })),
    );
  }

  /**
   * A hand-off queued while the device was offline (#423), replayed by sync after the readings
   * queued before it. One that already landed (sent online before the signal dropped) is applied;
   * one overtaken by a release, a move or the patient leaving is refused for good, naming the
   * station. The readings are separate changes and are kept either way.
   */
  async replayComplete(
    clinicId: string,
    visitId: string,
    actor: StationActor,
    dto: CompleteStationVisitDto,
    context: StationWriteContext & { occurredAt: Date },
  ): Promise<void> {
    const visit = await this.loadVisitInClinic(this.prisma, clinicId, visitId);
    if (
      (visit.status === 'COMPLETED' || visit.status === 'SKIPPED') &&
      visit.completedByUserId === actor.userId
    ) {
      return;
    }
    if (visit.status !== 'IN_PROGRESS' || visit.claimedByUserId !== actor.userId) {
      throw new ConflictException({
        code: 'STATION_HANDOFF_REFUSED',
        message: `The hand-off from ${visit.station.name} was not sent: the patient was released, moved or finished by someone else first. The readings recorded there were kept.`,
        stationName: visit.station.name,
      });
    }
    await this.complete(clinicId, visitId, actor, dto, context);
  }

  /** When a replayed hand-off happened: the device's time, never before the patient was taken. */
  private async replayTime(
    tx: TxClient,
    clinicId: string,
    occurredAt: Date,
    claimedAt: Date | null,
  ) {
    const clinic = await tx.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    const at = resolveReplayTime(
      occurredAt,
      new Date(),
      clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE,
    );
    return claimedAt && at < claimedAt ? claimedAt : at;
  }

  /** Manager override: send a patient to any station, with a reason. */
  async moveCheckIn(
    clinicId: string,
    checkInId: string,
    actor: StationActor,
    dto: MoveCheckInDto,
    context: StationWriteContext = {},
  ) {
    this.requireManage(actor);
    const next = await this.prisma.$transaction(async (tx) => {
      const checkIn = await this.loadOpenCheckIn(tx, clinicId, checkInId);
      const target = await this.findStation(tx, clinicId, dto.stationId);
      if (!target.active) throw this.stationInactive();
      const now = new Date();
      const open = await this.cancelOpenVisit(
        tx,
        clinicId,
        checkInId,
        actor.userId,
        dto.reason,
        context,
      );
      const created = await tx.patientStationVisit.create({
        data: {
          clinicId,
          patientCheckInId: checkInId,
          encounterId: checkIn.encounterId,
          stationId: target.id,
          status: 'QUEUED',
          queuedAt: now,
          queuedByUserId: actor.userId,
          endReason: null,
        },
      });
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'STATION.MOVE',
        entityType: 'PatientStationVisit',
        entityId: created.id,
        beforeJson: open ? JSON.stringify(this.auditShape(open)) : undefined,
        afterJson: JSON.stringify({ ...created, reason: dto.reason }),
      });
      return created;
    });
    return { visitId: next.id, stationId: next.stationId };
  }

  /**
   * The patient left before finishing. A manager can record it, and so can the volunteer holding
   * them, who is usually the one who sees them go.
   */
  async cancelCheckIn(
    clinicId: string,
    checkInId: string,
    actor: StationActor,
    reason: string,
    context: StationWriteContext = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      const checkIn = await this.loadOpenCheckIn(tx, clinicId, checkInId);
      if (!actor.canManage) {
        const held = await tx.patientStationVisit.findFirst({
          where: {
            patientCheckInId: checkInId,
            status: 'IN_PROGRESS',
            claimedByUserId: actor.userId,
          },
          select: { id: true },
        });
        if (!held) {
          throw new ForbiddenException(
            'Only a manager or the volunteer seeing this patient can record that they left',
          );
        }
      }
      await this.cancelOpenVisit(tx, clinicId, checkInId, actor.userId, reason, context);
      await tx.patientCheckIn.update({
        where: { id: checkInId },
        data: { status: 'CANCELLED' },
      });
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'CHECKIN.CANCEL',
        entityType: 'PatientCheckIn',
        entityId: checkInId,
        beforeJson: JSON.stringify({ status: checkIn.status }),
        afterJson: JSON.stringify({ status: 'CANCELLED', reason }),
      });
    });
    return { checkInId, status: 'CANCELLED' as const };
  }

  /**
   * The clinic day is over: everyone still in the line is closed out, so nobody sits in the
   * review queue overnight. The check-in ends COMPLETED (they were not "Left"), the open visit
   * ends CANCELLED with `CLINIC_CLOSED`, and the encounter is untouched so a doctor can still
   * review it.
   */
  async closeClinicDay(
    clinicId: string,
    actor: StationActor,
    date?: string,
    context: StationWriteContext = {},
  ) {
    if (!actor.canManage) {
      throw new ForbiddenException('Only a manager can close the clinic day');
    }
    const day = await this.dayWindow(clinicId, date);
    const closed = await this.prisma.$transaction((tx) =>
      this.closeOpenCheckIns(tx, clinicId, { gte: day.start, lte: day.end }, actor.userId, context),
    );
    return { date: day.date, closed };
  }

  /**
   * The overnight sweep's half of `closeClinicDay`: every clinic's check-ins and shifts from
   * before its own today, in its own time zone, for a day nobody closed by hand.
   */
  async closeStaleClinicDays(tx: TxClient) {
    const clinics = await tx.clinic.findMany({ select: { id: true, timezone: true } });
    let checkIns = 0;
    let shifts = 0;
    for (const clinic of clinics) {
      const today = clinicDayWindow(null, clinic.timezone ?? CLINIC_DEFAULT_TIMEZONE);
      checkIns += await this.closeOpenCheckIns(
        tx,
        clinic.id,
        { lt: today.start },
        SYSTEM_ACTOR_USER_ID,
        {},
      );
      const stale = await tx.staffShift.findMany({
        where: { clinicId: clinic.id, status: 'ACTIVE', checkedInAt: { lt: today.start } },
        select: { id: true },
      });
      for (const shift of stale) {
        // Nobody is held any more: the check-ins above closed every open visit of those days.
        await tx.staffShift.update({
          where: { id: shift.id },
          data: {
            status: 'CLOSED',
            checkedOutAt: new Date(),
            stationId: null,
            screenerIsAccountHolder: true,
            screenerName: null,
            screenerVolunteerContactId: null,
          },
        });
        await this.audit(
          tx,
          clinic.id,
          SYSTEM_ACTOR_USER_ID,
          {},
          {
            action: 'SHIFT.CHECKOUT',
            entityType: 'StaffShift',
            entityId: shift.id,
            afterJson: JSON.stringify({ status: 'CLOSED', reason: CLINIC_CLOSED_REASON }),
          },
        );
      }
      shifts += stale.length;
    }
    return { checkIns, shifts };
  }

  /**
   * A volunteer ending their shift hands back anyone they were holding, so a patient is never
   * left claimed by someone who has gone home. Called inside the check-out transaction.
   */
  async releaseForShiftEnd(
    tx: TxClient,
    params: {
      clinicId: string;
      userId: string;
      actorUserId: string;
      /** The shift's screener, read before check-out cleared it. */
      screener: ShiftScreener;
    },
    context: StationWriteContext = {},
  ) {
    // Already checked when it was set; a contact deactivated since must not block check-out.
    const performer = this.storedPerformer(params.screener);
    const held = await tx.patientStationVisit.findMany({
      where: { clinicId: params.clinicId, status: 'IN_PROGRESS', claimedByUserId: params.userId },
      select: { id: true },
    });
    for (const visit of held) {
      await tx.patientStationVisit.update({
        where: { id: visit.id },
        data: {
          status: 'QUEUED',
          claimedByUserId: null,
          claimedAt: null,
          assignedByUserId: null,
          endReason: 'SHIFT_ENDED',
          releaseCount: { increment: 1 },
          ...performer,
        },
      });
      await this.audit(tx, params.clinicId, params.actorUserId, context, {
        action: 'STATION.RELEASE',
        entityType: 'PatientStationVisit',
        entityId: visit.id,
        afterJson: JSON.stringify({ status: 'QUEUED', reason: 'SHIFT_ENDED' }),
      });
    }
    return held.length;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────

  /**
   * Take a QUEUED visit for `claimantUserId`.
   *
   * The update only applies while the visit is still QUEUED, which is the whole race: the second
   * of two simultaneous claims changes no row and is told who got there first. The first claim of
   * a check-in also opens its encounter, so every station after it records into the same one.
   */
  private async claimInTx(
    tx: TxClient,
    clinicId: string,
    visitId: string,
    claimantUserId: string,
    actorUserId: string,
    context: StationWriteContext,
    options: { assignedByUserId?: string } = {},
  ) {
    const now = new Date();
    const assignedByUserId = options.assignedByUserId ?? null;
    const claimed = await tx.patientStationVisit.updateMany({
      where: { id: visitId, clinicId, status: 'QUEUED' },
      data: {
        status: 'IN_PROGRESS',
        claimedByUserId: claimantUserId,
        claimedAt: now,
        assignedByUserId,
      },
    });
    if (claimed.count === 0) {
      const current = await tx.patientStationVisit.findUnique({
        where: { id: visitId },
        include: { claimedBy: USER_SUMMARY },
      });
      if (!current || current.clinicId !== clinicId) throw this.visitNotFound();
      if (current.status === 'IN_PROGRESS' && current.claimedByUserId === claimantUserId) {
        // A repeated tap. The claimant already holds this patient.
        return this.loadVisit(tx, visitId);
      }
      if (current.status === 'IN_PROGRESS') {
        throw new ConflictException({
          code: 'STATION_VISIT_ALREADY_CLAIMED',
          message: `${current.claimedBy?.displayName ?? 'Someone'} has already taken this patient.`,
          claimedBy: current.claimedBy,
        });
      }
      throw this.visitClosed(current.status);
    }

    const claimedVisit = await tx.patientStationVisit.findUniqueOrThrow({
      where: { id: visitId },
      select: { patientCheckInId: true },
    });
    const checkIn = await tx.patientCheckIn.findUniqueOrThrow({
      where: { id: claimedVisit.patientCheckInId },
    });
    let encounterId = checkIn.encounterId;
    if (!encounterId) {
      const encounter = await createDraftEncounter(tx, {
        clinicId,
        patientId: checkIn.patientId,
        createdByUserId: claimantUserId,
      });
      encounterId = encounter.id;
      await tx.patientCheckIn.update({
        where: { id: checkIn.id },
        data: { encounterId, status: 'IN_PROGRESS' },
      });
      await this.audit(tx, clinicId, actorUserId, context, {
        action: 'ENCOUNTER.CREATE',
        entityType: 'Encounter',
        entityId: encounter.id,
        afterJson: JSON.stringify(encounter),
      });
      await this.audit(tx, clinicId, actorUserId, context, {
        action: 'CHECKIN.STATUS.UPDATE',
        entityType: 'PatientCheckIn',
        entityId: checkIn.id,
        beforeJson: JSON.stringify({ status: checkIn.status, encounterId: null }),
        afterJson: JSON.stringify({ status: 'IN_PROGRESS', encounterId }),
      });
    } else if (checkIn.status === 'WAITING') {
      await tx.patientCheckIn.update({
        where: { id: checkIn.id },
        data: { status: 'IN_PROGRESS' },
      });
    }
    await tx.patientStationVisit.update({ where: { id: visitId }, data: { encounterId } });

    const updated = await this.loadVisit(tx, visitId);
    await this.audit(tx, clinicId, actorUserId, context, {
      action: assignedByUserId ? 'STATION.ASSIGN' : 'STATION.CLAIM',
      entityType: 'PatientStationVisit',
      entityId: visitId,
      afterJson: JSON.stringify(this.auditShape(updated)),
    });
    return updated;
  }

  private async completeSession(
    tx: TxClient,
    clinicId: string,
    visit: VisitWithContext,
    actorUserId: string,
    now: Date,
    context: StationWriteContext,
  ) {
    if (visit.encounterId) {
      await tx.counsellingRecord.update({
        where: { encounterId: visit.encounterId },
        data: { lockedAt: now },
      });
      const encounter = await tx.encounter.findUniqueOrThrow({ where: { id: visit.encounterId } });
      if (encounter.status === 'DRAFT') {
        const submitted = await tx.encounter.update({
          where: { id: encounter.id },
          data: { status: 'IN_REVIEW' },
        });
        await this.audit(tx, clinicId, actorUserId, context, {
          action: 'ENCOUNTER.SUBMIT_FOR_REVIEW',
          entityType: 'Encounter',
          entityId: encounter.id,
          beforeJson: JSON.stringify(encounter),
          afterJson: JSON.stringify(submitted),
        });
      }
    }
    await tx.patientCheckIn.update({
      where: { id: visit.patientCheckInId },
      data: { status: 'COMPLETED' },
    });
    await this.audit(tx, clinicId, actorUserId, context, {
      action: 'CHECKIN.STATUS.UPDATE',
      entityType: 'PatientCheckIn',
      entityId: visit.patientCheckInId,
      beforeJson: JSON.stringify({ status: visit.patientCheckIn.status }),
      afterJson: JSON.stringify({ status: 'COMPLETED' }),
    });
  }

  private async closeOpenCheckIns(
    tx: TxClient,
    clinicId: string,
    checkedInAt: Prisma.DateTimeFilter,
    actorUserId: string,
    context: StationWriteContext,
  ) {
    const open = await tx.patientCheckIn.findMany({
      where: { clinicId, checkedInAt, status: { in: [...OPEN_CHECK_IN_STATUSES] } },
      select: { id: true, status: true },
    });
    for (const checkIn of open) {
      await this.cancelOpenVisit(
        tx,
        clinicId,
        checkIn.id,
        actorUserId,
        CLINIC_CLOSED_REASON,
        context,
      );
      await tx.patientCheckIn.update({ where: { id: checkIn.id }, data: { status: 'COMPLETED' } });
      await this.audit(tx, clinicId, actorUserId, context, {
        action: 'CHECKIN.CLINIC_CLOSE',
        entityType: 'PatientCheckIn',
        entityId: checkIn.id,
        beforeJson: JSON.stringify({ status: checkIn.status }),
        afterJson: JSON.stringify({ status: 'COMPLETED', reason: CLINIC_CLOSED_REASON }),
      });
    }
    return open.length;
  }

  private async cancelOpenVisit(
    tx: TxClient,
    clinicId: string,
    checkInId: string,
    actorUserId: string,
    reason: string,
    context: StationWriteContext,
  ) {
    const open = await tx.patientStationVisit.findFirst({
      where: { patientCheckInId: checkInId, status: { in: OPEN_VISIT_STATUSES } },
      include: VISIT_INCLUDE,
    });
    if (!open) return null;
    await tx.patientStationVisit.update({
      where: { id: open.id },
      data: {
        status: 'CANCELLED',
        endReason: reason,
        completedByUserId: actorUserId,
        completedAt: new Date(),
      },
    });
    await this.audit(tx, clinicId, actorUserId, context, {
      action: 'STATION.CANCEL',
      entityType: 'PatientStationVisit',
      entityId: open.id,
      beforeJson: JSON.stringify(this.auditShape(open)),
      afterJson: JSON.stringify({ status: 'CANCELLED', reason }),
    });
    return open;
  }

  private async loadOpenCheckIn(tx: TxClient, clinicId: string, checkInId: string) {
    const checkIn = await tx.patientCheckIn.findUnique({ where: { id: checkInId } });
    if (!checkIn || checkIn.clinicId !== clinicId) {
      throw new NotFoundException('Check-in not found');
    }
    if (checkIn.status === 'COMPLETED' || checkIn.status === 'CANCELLED') {
      throw new ConflictException({
        code: 'CHECKIN_CLOSED',
        message: `This patient's session is already ${checkIn.status.toLowerCase()}.`,
        existingStatus: checkIn.status,
      });
    }
    return checkIn;
  }

  private loadVisit(tx: TxClient, visitId: string) {
    return tx.patientStationVisit.findUniqueOrThrow({
      where: { id: visitId },
      include: VISIT_INCLUDE,
    });
  }

  private async loadVisitInClinic(tx: TxClient, clinicId: string, visitId: string) {
    const visit = await tx.patientStationVisit.findUnique({
      where: { id: visitId },
      include: VISIT_INCLUDE,
    });
    if (!visit || visit.clinicId !== clinicId) throw this.visitNotFound();
    return visit;
  }

  private async findStation(tx: TxClient, clinicId: string, stationId: string) {
    const station = await tx.clinicStation.findUnique({ where: { id: stationId } });
    if (!station || station.clinicId !== clinicId) {
      throw new NotFoundException({ code: 'STATION_NOT_FOUND', message: 'Station not found' });
    }
    return station;
  }

  /** The most recent finished stop of each check-in, which is what the next station reads. */
  private async previousVisits(checkInIds: string[]) {
    if (!checkInIds.length) return new Map<string, VisitWithContext>();
    const finished = await this.prisma.patientStationVisit.findMany({
      where: {
        patientCheckInId: { in: checkInIds },
        // A stop someone held and then skipped (#424) carries a note too; one passed over was never held.
        OR: [{ status: 'COMPLETED' }, { status: 'SKIPPED', claimedByUserId: { not: null } }],
      },
      include: VISIT_INCLUDE,
      orderBy: { completedAt: 'desc' },
    });
    const latest = new Map<string, VisitWithContext>();
    for (const visit of finished) {
      if (!latest.has(visit.patientCheckInId)) latest.set(visit.patientCheckInId, visit);
    }
    return latest;
  }

  private async requireActiveShift(clinicId: string, userId: string) {
    const shift = await this.prisma.staffShift.findFirst({
      where: { clinicId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!shift) {
      throw new ConflictException({
        code: 'SHIFT_REQUIRED',
        message: 'Start your shift before taking a patient.',
      });
    }
  }

  /**
   * Someone a manager can hand a patient to: an active account that works stations at this clinic
   * and is on shift here now. Checked against the assignee's own roles, never the manager's.
   */
  private async requireAssignableStaff(clinicId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        clinicRoles: {
          where: { OR: [{ clinicId }, { clinicId: null }] },
          select: { clinicId: true, role: true },
        },
      },
    });
    if (
      !user?.isActive ||
      !hasPermissionAtClinic(user.clinicRoles, clinicId, PERMISSIONS.OPS_STATION_WORK)
    ) {
      throw new BadRequestException({
        code: 'ASSIGNEE_NOT_STATION_STAFF',
        message: 'That person does not work the station line at this clinic.',
      });
    }
    const shift = await this.prisma.staffShift.findFirst({
      where: { clinicId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!shift) {
      throw new ConflictException({
        code: 'ASSIGNEE_NOT_ON_SHIFT',
        message: 'That person has not started a shift, so they cannot take a patient yet.',
      });
    }
  }

  private requireManage(actor: StationActor) {
    if (!actor.canManage) {
      throw new ForbiddenException('OPS.STATION.MANAGE permission is required');
    }
  }

  private async dayWindow(clinicId: string, date?: string): Promise<ClinicDayWindow> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return clinicDayWindow(date, clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE);
  }

  /**
   * Trimmed and checked; the account holder carries no name. A pick from the directory (#226) is
   * looked up in this clinic and must be active, and its name comes from the server's copy.
   */
  private async toPerformer(
    db: Pick<TxClient, 'volunteerContact'>,
    clinicId: string,
    screener: ScreenerDto,
  ): Promise<Performer> {
    if (screener.isAccountHolder) {
      return {
        performedByIsAccountHolder: true,
        performedByName: null,
        performedByVolunteerContactId: null,
      };
    }
    if (screener.volunteerContactId) {
      const contact = await db.volunteerContact.findFirst({
        where: { id: screener.volunteerContactId, clinicId, isActive: true },
        select: { id: true, displayName: true },
      });
      if (!contact) {
        throw new BadRequestException({
          code: 'SCREENER_CONTACT_NOT_FOUND',
          message:
            "That volunteer is not in this clinic's active directory. Type their name instead.",
        });
      }
      return {
        performedByIsAccountHolder: false,
        performedByName: contact.displayName,
        performedByVolunteerContactId: contact.id,
      };
    }
    const name = screener.name?.trim();
    if (!name) {
      throw new BadRequestException({
        code: 'SCREENER_NAME_REQUIRED',
        message: 'Enter the name of the person screening.',
      });
    }
    return {
      performedByIsAccountHolder: false,
      performedByName: name,
      performedByVolunteerContactId: null,
    };
  }

  /** A screener already stored on a shift, carried onto a visit as it is. */
  private storedPerformer(shift: ShiftScreener): Performer {
    if (shift.screenerIsAccountHolder || !shift.screenerName) {
      return {
        performedByIsAccountHolder: true,
        performedByName: null,
        performedByVolunteerContactId: null,
      };
    }
    return {
      performedByIsAccountHolder: false,
      performedByName: shift.screenerName,
      performedByVolunteerContactId: shift.screenerVolunteerContactId,
    };
  }

  /** The screener sent with the request, else the user's shift's, else the account holder. */
  private async performerFor(
    tx: TxClient,
    clinicId: string,
    userId: string,
    override?: ScreenerDto,
  ): Promise<Performer> {
    if (override) return this.toPerformer(tx, clinicId, override);
    const shift = await tx.staffShift.findFirst({
      where: { clinicId, userId, status: 'ACTIVE' },
      select: {
        screenerIsAccountHolder: true,
        screenerName: true,
        screenerVolunteerContactId: true,
      },
    });
    return shift
      ? this.storedPerformer(shift)
      : this.storedPerformer({
          screenerIsAccountHolder: true,
          screenerName: null,
          screenerVolunteerContactId: null,
        });
  }

  private screenerNameOf(shift: { screenerIsAccountHolder: boolean; screenerName: string | null }) {
    return shift.screenerIsAccountHolder ? null : shift.screenerName;
  }

  private audit(
    tx: TxClient,
    clinicId: string,
    actorUserId: string,
    context: StationWriteContext,
    event: Pick<LogWriteParams, 'action' | 'entityType' | 'entityId' | 'beforeJson' | 'afterJson'>,
  ) {
    return this.auditService.logWrite(
      { ...event, clinicId, actorUserId, requestId: context.requestId },
      tx,
    );
  }

  /** Visit state without the patient's name and date of birth, which the audit trail does not need. */
  private auditShape(visit: VisitWithContext) {
    return {
      id: visit.id,
      stationId: visit.stationId,
      status: visit.status,
      claimedByUserId: visit.claimedByUserId,
      assignedByUserId: visit.assignedByUserId,
      completedByUserId: visit.completedByUserId,
      encounterId: visit.encounterId,
      endReason: visit.endReason,
      performedByIsAccountHolder: visit.performedByIsAccountHolder,
      performedByName: visit.performedByName,
    };
  }

  private toStation(station: {
    id: string;
    kind: StationKind;
    name: string;
    sortOrder: number;
    active: boolean;
    capacity: number;
  }) {
    return {
      id: station.id,
      kind: station.kind,
      name: station.name,
      sortOrder: station.sortOrder,
      active: station.active,
      capacity: station.capacity,
    };
  }

  /**
   * The latest performer correction of each visit, from the audit trail (#307, B2).
   *
   * Read rather than stored: STATION.PERFORMER.CORRECT already holds the state before, who
   * corrected it and when, so every past correction is covered and there is no second copy to
   * drift. Audit rows are scoped to the clinic by row level security, like the visits.
   */
  private async performerCorrections(clinicId: string, visits: VisitWithContext[]) {
    const corrections = new Map<string, PerformerCorrection>();
    if (visits.length === 0) return corrections;
    const byId = new Map(visits.map((visit) => [visit.id, visit]));
    const events = await this.prisma.auditEvent.findMany({
      where: {
        clinicId,
        action: 'STATION.PERFORMER.CORRECT',
        entityType: 'PatientStationVisit',
        entityId: { in: [...byId.keys()] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        entityId: true,
        createdAt: true,
        beforeJson: true,
        afterJson: true,
        actor: { select: { id: true, displayName: true } },
      },
    });
    for (const event of events) {
      if (corrections.has(event.entityId)) continue;
      const visit = byId.get(event.entityId);
      const before = parseAuditJson(event.beforeJson);
      const after = parseAuditJson(event.afterJson);
      const previousPerformer =
        before.performedByIsAccountHolder === false && typeof before.performedByName === 'string'
          ? before.performedByName
          : (visit?.completedBy?.displayName ?? null);
      corrections.set(event.entityId, {
        previousPerformer,
        correctedAt: event.createdAt.toISOString(),
        correctedBy: event.actor,
        reason: typeof after.reason === 'string' ? after.reason : null,
      });
    }
    return corrections;
  }

  private toVisit(
    visit: VisitWithContext,
    previous?: VisitWithContext,
    performerCorrection?: PerformerCorrection,
  ) {
    const patient = visit.patientCheckIn.patient;
    return {
      id: visit.id,
      status: visit.status,
      checkInId: visit.patientCheckInId,
      checkInStatus: visit.patientCheckIn.status,
      checkedInAt: visit.patientCheckIn.checkedInAt.toISOString(),
      dayNumber: visit.patientCheckIn.dayNumber,
      lineFlags: parseLineFlags(visit.patientCheckIn.lineFlags),
      doctorRequest: openDoctorRequest(visit),
      encounterId: visit.encounterId,
      station: visit.station,
      patient: {
        id: patient.id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
        isDemo: patient.isDemo,
      },
      queuedAt: visit.queuedAt.toISOString(),
      claimedBy: visit.claimedBy,
      claimedAt: visit.claimedAt?.toISOString() ?? null,
      assignedBy: visit.assignedBy,
      completedBy: visit.completedBy,
      completedAt: visit.completedAt?.toISOString() ?? null,
      performedByName: this.performedByNameOf(visit),
      // Struck through beside the current performer, with who and when (MASTER.md section 12).
      performerCorrection: performerCorrection ?? null,
      handoffNote: visit.handoffNote,
      endReason: visit.endReason,
      releaseCount: visit.releaseCount,
      previous: previous
        ? {
            station: previous.station,
            status: previous.status,
            completedBy: previous.completedBy,
            completedAt: previous.completedAt?.toISOString() ?? null,
            performedByName: this.performedByNameOf(previous),
            handoffNote: previous.handoffNote,
          }
        : null,
    };
  }

  /** Null when the account holder did the stop, or it predates #227: show the account only. */
  private performedByNameOf(visit: VisitWithContext) {
    return visit.performedByIsAccountHolder === false ? visit.performedByName : null;
  }

  private visitNotFound() {
    return new NotFoundException({
      code: 'STATION_VISIT_NOT_FOUND',
      message: 'That station visit was not found.',
    });
  }

  private visitClosed(status: StationVisitStatus) {
    return new ConflictException({
      code: 'STATION_VISIT_CLOSED',
      message: 'This patient has already moved on from this station.',
      existingStatus: status,
    });
  }

  private notYourVisit(visit: VisitWithContext) {
    if (visit.status !== 'IN_PROGRESS') return this.visitClosed(visit.status);
    return new ForbiddenException({
      code: 'STATION_VISIT_NOT_HELD',
      message: `${visit.claimedBy?.displayName ?? 'Someone else'} is seeing this patient.`,
    });
  }

  private stationInactive() {
    return new ConflictException({
      code: 'STATION_INACTIVE',
      message: 'That station is closed.',
    });
  }

  private reviewStationExists() {
    return new ConflictException({
      code: 'REVIEW_STATION_EXISTS',
      message: 'This clinic already has an active review station.',
    });
  }
}
