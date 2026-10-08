import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StationKind, StationVisitStatus } from '@prisma/client';
import {
  CLINIC_DEFAULT_TIMEZONE,
  clinicDayWindow,
  nextStationId,
  type ClinicDayWindow,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type LogWriteParams } from '../audit/audit.service';
import { isUniqueViolation } from '../common/prisma-errors';
import { lockForTransaction } from '../prisma/transaction-lock';
import { hasPermissionAtClinic } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';
import { createDraftEncounter } from './draft-encounter';
import { computeStationMetrics } from './station-metrics';
import type {
  CompleteStationVisitDto,
  CreateStationDto,
  MoveCheckInDto,
  UpdateStationDto,
} from './dto/station.dto';

type TxClient = Prisma.TransactionClient;

/** A visit a patient is still waiting at or being seen in. At most one per check-in (SQL). */
const OPEN_VISIT_STATUSES: StationVisitStatus[] = ['QUEUED', 'IN_PROGRESS'];

const USER_SUMMARY = { select: { id: true, displayName: true } } as const;

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
      patient: {
        select: { id: true, patientCode: true, firstName: true, lastName: true, dob: true },
      },
    },
  },
} satisfies Prisma.PatientStationVisitInclude;

type VisitWithContext = Prisma.PatientStationVisitGetPayload<{ include: typeof VISIT_INCLUDE }>;

export interface StationActor {
  userId: string;
  /** Holds OPS.STATION.MANAGE at this clinic. Decided by the controller from the guard's roles. */
  canManage: boolean;
}

export interface StationWriteContext {
  requestId?: string;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
          },
        });
        await this.audit(tx, clinicId, actor.userId, context, {
          action: 'STATION.UPDATE',
          entityType: 'ClinicStation',
          entityId: stationId,
          beforeJson: JSON.stringify(existing),
          afterJson: JSON.stringify(updated),
        });
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
        select: { stationId: true, roleAtShift: true, user: USER_SUMMARY },
        orderBy: { checkedInAt: 'asc' },
      }),
    ]);
    const previous = await this.previousVisits(visits.map((visit) => visit.patientCheckInId));
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
        staff: myShifts
          .filter((shift) => shift.stationId === station.id)
          .map((shift) => shift.user),
        visits: visits
          .filter((visit) => visit.stationId === station.id)
          .map((visit) => this.toVisit(visit, previous.get(visit.patientCheckInId))),
      })),
      // Everyone a manager could hand a patient to, and how many patients each is holding now.
      onShift: myShifts.map((shift) => ({
        user: shift.user,
        roleAtShift: shift.roleAtShift,
        stationId: shift.stationId,
        activeVisitCount: holding.get(shift.user.id) ?? 0,
      })),
    };
  }

  /**
   * Wait-time and throughput for one clinic day (#24): every check-in that day, its station
   * visits, and the shifts that overlapped it. Aggregated in `computeStationMetrics`; nothing
   * that names a patient is read.
   */
  async getMetrics(clinicId: string, date?: string, now: Date = new Date()) {
    const day = await this.dayWindow(clinicId, date);
    const inDay = { gte: day.start, lte: day.end };
    const [stations, checkIns, visits, shifts] = await Promise.all([
      this.prisma.clinicStation.findMany({
        where: { clinicId },
        select: { id: true, name: true, kind: true, sortOrder: true, active: true },
      }),
      this.prisma.patientCheckIn.findMany({
        where: { clinicId, checkedInAt: inDay },
        select: { id: true, checkedInAt: true, status: true },
      }),
      this.prisma.patientStationVisit.findMany({
        where: { clinicId, patientCheckIn: { checkedInAt: inDay } },
        select: {
          stationId: true,
          patientCheckInId: true,
          status: true,
          queuedAt: true,
          claimedAt: true,
          completedAt: true,
          releaseCount: true,
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

  async getVisit(clinicId: string, visitId: string) {
    const visit = await this.prisma.patientStationVisit.findUnique({
      where: { id: visitId },
      include: VISIT_INCLUDE,
    });
    if (!visit || visit.clinicId !== clinicId) throw this.visitNotFound();
    const timeline = await this.getTimeline(clinicId, visit.patientCheckInId);
    return { ...this.toVisit(visit), timeline: timeline.items };
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
    return { items: visits.map((visit) => this.toVisit(visit)) };
  }

  /** The station visit (if any) an encounter's patient is open at, with the encounter's line. */
  async getEncounterTimeline(clinicId: string, encounterId: string) {
    const visits = await this.prisma.patientStationVisit.findMany({
      where: { clinicId, encounterId },
      include: VISIT_INCLUDE,
      orderBy: [{ queuedAt: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: visits.map((visit) => this.toVisit(visit)) };
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
    return visit;
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
      const now = new Date();
      const stations = await tx.clinicStation.findMany({ where: { clinicId } });
      const isReview = visit.station.kind === StationKind.REVIEW;

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
        if (skips.length || dto.nextStationId) {
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
      }

      const completed = await tx.patientStationVisit.updateMany({
        where: { id: visitId, status: 'IN_PROGRESS', claimedByUserId: actor.userId },
        data: {
          status: 'COMPLETED',
          completedByUserId: actor.userId,
          completedAt: now,
          handoffNote: dto.handoffNote?.trim() || null,
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
      await this.audit(tx, clinicId, actor.userId, context, {
        action: 'STATION.COMPLETE',
        entityType: 'PatientStationVisit',
        entityId: visitId,
        beforeJson: JSON.stringify(this.auditShape(visit)),
        afterJson: JSON.stringify({ ...this.auditShape(updated), nextVisitId: next?.id ?? null }),
      });
      return { updated, next };
    });
    return {
      visit: this.toVisit(result.updated),
      nextVisitId: result.next?.id ?? null,
      nextStationId: result.next?.stationId ?? null,
      sessionCompleted: result.next === null,
    };
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
   * A volunteer ending their shift hands back anyone they were holding, so a patient is never
   * left claimed by someone who has gone home. Called inside the check-out transaction.
   */
  async releaseForShiftEnd(
    tx: TxClient,
    params: { clinicId: string; userId: string; actorUserId: string },
    context: StationWriteContext = {},
  ) {
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
      where: { patientCheckInId: { in: checkInIds }, status: 'COMPLETED' },
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
    };
  }

  private toStation(station: {
    id: string;
    kind: StationKind;
    name: string;
    sortOrder: number;
    active: boolean;
  }) {
    return {
      id: station.id,
      kind: station.kind,
      name: station.name,
      sortOrder: station.sortOrder,
      active: station.active,
    };
  }

  private toVisit(visit: VisitWithContext, previous?: VisitWithContext) {
    const patient = visit.patientCheckIn.patient;
    return {
      id: visit.id,
      status: visit.status,
      checkInId: visit.patientCheckInId,
      checkInStatus: visit.patientCheckIn.status,
      checkedInAt: visit.patientCheckIn.checkedInAt.toISOString(),
      encounterId: visit.encounterId,
      station: visit.station,
      patient: {
        id: patient.id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
      },
      queuedAt: visit.queuedAt.toISOString(),
      claimedBy: visit.claimedBy,
      claimedAt: visit.claimedAt?.toISOString() ?? null,
      assignedBy: visit.assignedBy,
      completedBy: visit.completedBy,
      completedAt: visit.completedAt?.toISOString() ?? null,
      handoffNote: visit.handoffNote,
      endReason: visit.endReason,
      releaseCount: visit.releaseCount,
      previous: previous
        ? {
            station: previous.station,
            completedBy: previous.completedBy,
            completedAt: previous.completedAt?.toISOString() ?? null,
            handoffNote: previous.handoffNote,
          }
        : null,
    };
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
