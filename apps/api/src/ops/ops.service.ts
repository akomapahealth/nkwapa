import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, CheckInStatus, Prisma, ShiftRole, UserRole } from '@prisma/client';
import {
  CLINIC_DEFAULT_TIMEZONE,
  clinicDayWindow,
  todayInTimeZone,
  type ClinicDayWindow,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type LogWriteParams } from '../audit/audit.service';
import { isUniqueViolation } from '../common/prisma-errors';
import {
  recordAppliedSyncMutation,
  type AppliedSyncMutationRef,
} from '../sync/applied-sync-mutation';
import { resolveReplayTime } from './ops-replay';
import {
  CreateAssignmentDto,
  CreatePatientCheckInDto,
  ListAssignmentsQueryDto,
  ListCheckInsQueryDto,
  ReassignAssignmentDto,
  ShiftCheckInDto,
} from './dto/ops.dto';

type TxClient = Prisma.TransactionClient;

/** A check-in still in the queue or being seen. A patient has at most one of these per day. */
const OPEN_CHECK_IN_STATUSES: CheckInStatus[] = ['WAITING', 'ASSIGNED', 'IN_PROGRESS'];

const PATIENT_SUMMARY_SELECT = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.PatientSelect;

/** An offline action being replayed through sync, rather than a live request. */
export interface OpsReplay {
  /** When the action happened on the device. */
  occurredAt: Date;
  syncMutation: AppliedSyncMutationRef;
  ipAddress?: string;
  userAgent?: string;
}

export interface OpsWriteContext {
  requestId?: string;
  replay?: OpsReplay;
}

type PatientAssignmentSummaryPayload = Prisma.PatientAssignmentGetPayload<{
  include: {
    patientCheckIn: {
      include: {
        patient: {
          select: {
            id: true;
            patientCode: true;
            firstName: true;
            lastName: true;
          };
        };
      };
    };
    assignedVolunteer: { select: { id: true; displayName: true } };
    assignedDoctor: { select: { id: true; displayName: true } };
    assignedBy: { select: { id: true; displayName: true } };
  };
}>;

interface ShiftWithUser {
  id: string;
  clinicId: string;
  userId: string;
  roleAtShift: ShiftRole;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  status: 'ACTIVE' | 'CLOSED';
  notes: string | null;
  user: { id: string; displayName: string };
}

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Start the actor's shift.
   *
   * A caller may supply the shift's id. The web generates it once per tap, so a request cut off
   * mid-flight can be queued offline under the same id and its replay finds the shift instead of
   * starting a second one. Repeating a check-in that already applied returns that shift.
   */
  async checkIn(
    clinicId: string,
    actorUserId: string,
    dto: ShiftCheckInDto,
    context: OpsWriteContext = {},
  ) {
    await this.assertActiveClinic(clinicId);
    await this.assertShiftRoleMembership(clinicId, actorUserId, dto.roleAtShift);

    const applied = await this.findOwnShift(dto.id, clinicId, actorUserId);
    if (applied) return this.alreadyApplied(clinicId, context, this.toShiftDetail(applied));
    const checkedInAt = await this.writeTime(clinicId, context);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const active = await tx.staffShift.findFirst({
          where: { clinicId, userId: actorUserId, status: 'ACTIVE' },
          include: { user: { select: { id: true, displayName: true } } },
        });
        if (active) throw this.shiftAlreadyActive(active);

        const shift = await tx.staffShift.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            clinicId,
            userId: actorUserId,
            roleAtShift: dto.roleAtShift,
            checkedInAt,
            status: 'ACTIVE',
            notes: dto.notes ?? null,
          },
          include: { user: { select: { id: true, displayName: true } } },
        });
        await this.recordWrite(tx, clinicId, actorUserId, context, {
          action: 'SHIFT.CHECKIN',
          entityType: 'StaffShift',
          entityId: shift.id,
          afterJson: JSON.stringify(shift),
        });
        return shift;
      });
      return this.toShiftDetail(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Two check-ins raced past the read above; the partial unique index on active shifts let
      // exactly one through. If it was this same id, the check-in applied; otherwise it lost.
      const raced = await this.findOwnShift(dto.id, clinicId, actorUserId);
      if (raced) return this.alreadyApplied(clinicId, context, this.toShiftDetail(raced));
      const active = await this.prisma.staffShift.findFirst({
        where: { clinicId, userId: actorUserId, status: 'ACTIVE' },
        include: { user: { select: { id: true, displayName: true } } },
      });
      throw this.shiftAlreadyActive(active);
    }
  }

  /**
   * End a shift.
   *
   * Online, ending a shift that is already closed is refused with `SHIFT_ALREADY_CLOSED`: the
   * person tapping it is looking at a stale board and should know. A replay is different. The
   * device queued "end this shift", and a closed shift is exactly that outcome, whoever closed
   * it, so a replay reports it as applied rather than leaving an unresolvable conflict queued.
   */
  async checkOut(
    clinicId: string,
    shiftId: string,
    actorUserId: string,
    context: OpsWriteContext = {},
  ) {
    const existing = await this.prisma.staffShift.findUnique({
      where: { id: shiftId },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (!existing || existing.clinicId !== clinicId) {
      throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: 'Shift not found' });
    }

    const canManage = await this.canManageClinicShift(clinicId, actorUserId);
    if (existing.userId !== actorUserId && !canManage) {
      throw new ForbiddenException(
        'Only the shift owner or clinic managers can check out this shift',
      );
    }

    if (existing.status !== 'ACTIVE') {
      if (context.replay) {
        return this.alreadyApplied(clinicId, context, this.toShiftDetail(existing));
      }
      throw new ConflictException({
        code: 'SHIFT_ALREADY_CLOSED',
        message: 'Shift is already checked out',
      });
    }

    const checkedOutAt = await this.writeTime(clinicId, context);
    if (checkedOutAt.getTime() < existing.checkedInAt.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_OPS_TIME_ORDER',
        message: 'A shift cannot end before it started.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.staffShift.update({
        where: { id: shiftId },
        data: { status: 'CLOSED', checkedOutAt },
        include: { user: { select: { id: true, displayName: true } } },
      });
      await this.recordWrite(tx, clinicId, actorUserId, context, {
        action: 'SHIFT.CHECKOUT',
        entityType: 'StaffShift',
        entityId: shift.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(shift),
      });
      return shift;
    });

    return this.toShiftDetail(updated);
  }

  async getActiveShifts(clinicId: string, date?: string) {
    const dayRange = await this.getDayRange(clinicId, date);
    const shifts = await this.prisma.staffShift.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
        checkedInAt: { lte: dayRange.end },
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
      orderBy: [{ roleAtShift: 'asc' }, { checkedInAt: 'asc' }],
    });

    return {
      date: dayRange.date,
      timezone: dayRange.timezone,
      items: shifts.map((shift) => this.toActiveShift(shift)),
    };
  }

  /**
   * Record a patient's arrival.
   *
   * A patient has at most one open check-in (waiting, assigned or in progress) per clinic day. A
   * second tap, a second device, or an offline replay of a check-in someone already made online
   * would otherwise put the same person in the queue twice and invite two volunteers to start two
   * visits. The check and the insert are serialized per patient, so two concurrent requests
   * cannot both pass the check.
   */
  async createCheckIn(
    clinicId: string,
    actorUserId: string,
    dto: CreatePatientCheckInDto,
    context: OpsWriteContext = {},
  ) {
    await this.assertActiveClinic(clinicId);
    const applied = await this.findOwnCheckIn(dto.id, clinicId, dto.patientId);
    if (applied) return this.alreadyApplied(clinicId, context, this.toCheckInSummary(applied));

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, primaryClinicId: clinicId },
      select: { id: true, mergedIntoPatientId: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found for this clinic');
    }
    if (patient.mergedIntoPatientId) {
      throw new ConflictException({
        code: 'PATIENT_MERGED',
        message: 'This chart was merged into another chart. Check in the current chart instead.',
        canonicalPatientId: patient.mergedIntoPatientId,
      });
    }

    const checkedInAt = await this.writeTime(clinicId, context);
    const day = await this.getDayRangeAt(clinicId, checkedInAt);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`patient-check-in:${clinicId}:${dto.patientId}`}, 0))`;
        const open = await tx.patientCheckIn.findFirst({
          where: {
            clinicId,
            patientId: dto.patientId,
            status: { in: OPEN_CHECK_IN_STATUSES },
            checkedInAt: { gte: day.start, lte: day.end },
          },
          select: { id: true, status: true },
        });
        if (open) {
          throw new ConflictException({
            code: 'PATIENT_ALREADY_CHECKED_IN',
            message: 'This patient is already checked in today.',
            existingCheckInId: open.id,
            existingStatus: open.status,
          });
        }

        const checkIn = await tx.patientCheckIn.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            clinicId,
            patientId: dto.patientId,
            checkedInAt,
            source: dto.source ?? 'STAFF',
            status: 'WAITING',
            notes: dto.notes ?? null,
          },
          include: { patient: { select: PATIENT_SUMMARY_SELECT } },
        });
        await this.recordWrite(tx, clinicId, actorUserId, context, {
          action: 'CHECKIN.CREATE',
          entityType: 'PatientCheckIn',
          entityId: checkIn.id,
          afterJson: JSON.stringify(checkIn),
        });
        return checkIn;
      });
      return this.toCheckInSummary(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The same id arrived twice at once and the primary key let one through.
      const raced = await this.findOwnCheckIn(dto.id, clinicId, dto.patientId);
      if (raced) return this.alreadyApplied(clinicId, context, this.toCheckInSummary(raced));
      throw error;
    }
  }

  async listCheckIns(clinicId: string, query: ListCheckInsQueryDto) {
    const dayRange = await this.getDayRange(clinicId, query.date);
    const items = await this.prisma.patientCheckIn.findMany({
      where: {
        clinicId,
        checkedInAt: {
          gte: dayRange.start,
          lte: dayRange.end,
        },
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
          },
        },
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          include: {
            assignedVolunteer: { select: { id: true, displayName: true } },
            assignedDoctor: { select: { id: true, displayName: true } },
            assignedBy: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { checkedInAt: 'asc' },
    });

    return {
      date: dayRange.date,
      timezone: dayRange.timezone,
      items: items.map((item) => this.toCheckInSummary(item)),
    };
  }

  async createAssignment(
    clinicId: string,
    actorUserId: string,
    dto: CreateAssignmentDto,
    requestId?: string,
  ) {
    const { checkIn } = await this.getCheckInForAssignment(clinicId, dto.patientCheckInId);
    if (!['WAITING', 'ASSIGNED'].includes(checkIn.status)) {
      throw new BadRequestException('Check-in must be WAITING or ASSIGNED before assignment');
    }

    const activeAssignment = await this.prisma.patientAssignment.findFirst({
      where: { patientCheckInId: dto.patientCheckInId, status: 'ACTIVE' },
    });
    if (activeAssignment) {
      throw new ConflictException('An active assignment already exists for this check-in');
    }

    await Promise.all([
      this.assertAssignableStaff(clinicId, dto.assignedVolunteerId, 'VOLUNTEER'),
      this.assertAssignableStaff(clinicId, dto.assignedDoctorId, 'DOCTOR'),
    ]);

    const created = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.patientAssignment.create({
        data: {
          clinicId,
          patientCheckInId: dto.patientCheckInId,
          assignedVolunteerId: dto.assignedVolunteerId,
          assignedDoctorId: dto.assignedDoctorId,
          assignedByUserId: actorUserId,
          assignedAt: new Date(),
          status: 'ACTIVE',
        },
        include: this.assignmentInclude,
      });

      await tx.patientCheckIn.update({
        where: { id: dto.patientCheckInId },
        data: { status: 'ASSIGNED' },
      });

      return assignment;
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'ASSIGNMENT.CREATE',
      entityType: 'PatientAssignment',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId,
    });

    return this.toAssignmentSummary(created);
  }

  async reassignAssignment(
    clinicId: string,
    assignmentId: string,
    actorUserId: string,
    dto: ReassignAssignmentDto,
    requestId?: string,
  ) {
    const existing = await this.prisma.patientAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        patientCheckIn: {
          select: {
            id: true,
            clinicId: true,
            status: true,
          },
        },
      },
    });
    if (!existing || existing.clinicId !== clinicId) {
      throw new NotFoundException('Assignment not found');
    }
    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Only active assignments can be reassigned');
    }
    if (['COMPLETED', 'CANCELLED'].includes(existing.patientCheckIn.status)) {
      throw new BadRequestException('Cannot reassign a completed or cancelled check-in');
    }

    await Promise.all([
      this.assertAssignableStaff(clinicId, dto.assignedVolunteerId, 'VOLUNTEER'),
      this.assertAssignableStaff(clinicId, dto.assignedDoctorId, 'DOCTOR'),
    ]);

    const updated = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.patientAssignment.update({
        where: { id: assignmentId },
        data: {
          status: 'REASSIGNED',
          reason: dto.reason,
        },
      });

      const next = await tx.patientAssignment.create({
        data: {
          clinicId,
          patientCheckInId: existing.patientCheckInId,
          assignedVolunteerId: dto.assignedVolunteerId,
          assignedDoctorId: dto.assignedDoctorId,
          assignedByUserId: actorUserId,
          assignedAt: new Date(),
          status: 'ACTIVE',
          reason: dto.reason,
        },
        include: this.assignmentInclude,
      });

      return { previous, next };
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'ASSIGNMENT.REASSIGN',
      entityType: 'PatientAssignment',
      entityId: updated.next.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated.next),
      requestId,
    });

    return this.toAssignmentSummary(updated.next);
  }

  async listAssignments(clinicId: string, query: ListAssignmentsQueryDto) {
    const dayRange = await this.getDayRange(clinicId, query.date);
    const items = await this.prisma.patientAssignment.findMany({
      where: {
        clinicId,
        assignedAt: {
          gte: dayRange.start,
          lte: dayRange.end,
        },
        ...(query.status ? { status: query.status } : {}),
      },
      include: this.assignmentInclude,
      orderBy: { assignedAt: 'asc' },
    });

    return {
      date: dayRange.date,
      timezone: dayRange.timezone,
      items: items.map((item) => this.toAssignmentSummary(item)),
    };
  }

  async listMyAssignments(clinicId: string, actorUserId: string, date?: string) {
    const dayRange = await this.getDayRange(clinicId, date);
    const items = await this.prisma.patientAssignment.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
        OR: [{ assignedVolunteerId: actorUserId }, { assignedDoctorId: actorUserId }],
        patientCheckIn: {
          checkedInAt: {
            gte: dayRange.start,
            lte: dayRange.end,
          },
        },
      },
      include: this.assignmentInclude,
      orderBy: { assignedAt: 'asc' },
    });

    return {
      date: dayRange.date,
      timezone: dayRange.timezone,
      items: items.map((item) => this.toMyAssignmentSummary(item, actorUserId)),
    };
  }

  async startIntake(clinicId: string, checkinId: string, actorUserId: string, requestId?: string) {
    const existing = await this.prisma.patientCheckIn.findUnique({
      where: { id: checkinId },
      include: {
        patient: {
          select: {
            id: true,
            primaryClinicId: true,
          },
        },
        assignments: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: {
            assignedVolunteer: { select: { id: true, displayName: true } },
            assignedDoctor: { select: { id: true, displayName: true } },
            assignedBy: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    if (!existing || existing.clinicId !== clinicId) {
      throw new NotFoundException('Check-in not found');
    }
    if (existing.encounterId) {
      throw new ConflictException('Encounter has already been started for this check-in');
    }

    const activeAssignment = existing.assignments[0] ?? null;
    if (!activeAssignment || activeAssignment.assignedVolunteerId !== actorUserId) {
      throw new ForbiddenException('Only the assigned volunteer can start intake');
    }
    if (existing.status !== 'ASSIGNED') {
      throw new BadRequestException('Check-in must be ASSIGNED before intake starts');
    }

    const { encounter, checkIn } = await this.prisma.$transaction(async (tx) => {
      const encounterRecord = await this.createDraftEncounter(tx, {
        clinicId,
        patientId: existing.patientId,
        createdByUserId: actorUserId,
      });

      const updatedCheckIn = await tx.patientCheckIn.update({
        where: { id: checkinId },
        data: {
          encounterId: encounterRecord.id,
          status: 'IN_PROGRESS',
        },
        include: {
          patient: {
            select: {
              id: true,
              patientCode: true,
              firstName: true,
              lastName: true,
            },
          },
          assignments: {
            where: { status: 'ACTIVE' },
            orderBy: { assignedAt: 'desc' },
            take: 1,
            include: {
              assignedVolunteer: { select: { id: true, displayName: true } },
              assignedDoctor: { select: { id: true, displayName: true } },
              assignedBy: { select: { id: true, displayName: true } },
            },
          },
        },
      });

      return {
        encounter: encounterRecord,
        checkIn: updatedCheckIn,
      };
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'ENCOUNTER.CREATE',
      entityType: 'Encounter',
      entityId: encounter.id,
      afterJson: JSON.stringify(encounter),
      requestId,
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'CHECKIN.START_INTAKE',
      entityType: 'PatientCheckIn',
      entityId: checkIn.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(checkIn),
      requestId,
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'CHECKIN.STATUS.UPDATE',
      entityType: 'PatientCheckIn',
      entityId: checkIn.id,
      beforeJson: JSON.stringify({
        id: existing.id,
        status: existing.status,
        encounterId: existing.encounterId,
      }),
      afterJson: JSON.stringify({
        id: checkIn.id,
        status: checkIn.status,
        encounterId: checkIn.encounterId,
      }),
      requestId,
    });

    return {
      encounter: {
        id: encounter.id,
        clinicId: encounter.clinicId,
        patientId: encounter.patientId,
        status: encounter.status,
        createdAt: encounter.createdAt.toISOString(),
      },
      checkIn: this.toCheckInSummary(checkIn),
    };
  }

  private readonly assignmentInclude = {
    patientCheckIn: {
      include: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    assignedVolunteer: { select: { id: true, displayName: true } },
    assignedDoctor: { select: { id: true, displayName: true } },
    assignedBy: { select: { id: true, displayName: true } },
  } satisfies Prisma.PatientAssignmentInclude;

  private async assertActiveClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, isActive: true },
      select: { id: true },
    });
    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }
  }

  private async assertShiftRoleMembership(
    clinicId: string,
    actorUserId: string,
    roleAtShift: ShiftRole,
  ) {
    const membership = await this.prisma.userClinicRole.findFirst({
      where: {
        userId: actorUserId,
        clinicId,
        role: this.toUserRole(roleAtShift),
      },
    });
    if (!membership) {
      throw new ForbiddenException(
        'Requested shift role is not assigned to this user in the clinic',
      );
    }
  }

  private async canManageClinicShift(clinicId: string, actorUserId: string) {
    const roles = await this.prisma.userClinicRole.findMany({
      where: {
        userId: actorUserId,
        OR: [
          { clinicId, role: { in: ['MANAGER', 'DIRECTOR'] } },
          { clinicId: null, role: 'SYSTEM_ADMIN' },
        ],
      },
      select: { role: true },
    });
    return roles.length > 0;
  }

  private async getCheckInForAssignment(clinicId: string, patientCheckInId: string) {
    const checkIn = await this.prisma.patientCheckIn.findUnique({
      where: { id: patientCheckInId },
      include: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!checkIn || checkIn.clinicId !== clinicId) {
      throw new NotFoundException('Check-in not found');
    }
    return { checkIn };
  }

  private async assertAssignableStaff(clinicId: string, userId: string, requiredRole: ShiftRole) {
    const [user, membership, shift] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true, displayName: true },
      }),
      this.prisma.userClinicRole.findFirst({
        where: {
          userId,
          clinicId,
          role: this.toUserRole(requiredRole),
        },
        select: { id: true },
      }),
      this.prisma.staffShift.findFirst({
        where: {
          clinicId,
          userId,
          status: 'ACTIVE',
          roleAtShift: requiredRole,
        },
        select: { id: true },
      }),
    ]);

    if (!user || !user.isActive) {
      throw new BadRequestException('Assigned staff member is inactive or does not exist');
    }
    if (!membership) {
      throw new BadRequestException(
        `Assigned user is not a ${requiredRole.toLowerCase()} in this clinic`,
      );
    }
    if (!shift) {
      throw new BadRequestException('Assigned staff member is not checked in');
    }
  }

  private async createDraftEncounter(
    tx: TxClient,
    data: {
      clinicId: string;
      patientId: string;
      createdByUserId: string;
    },
  ) {
    const [clinic, patient, user] = await Promise.all([
      tx.clinic.findFirst({ where: { id: data.clinicId, isActive: true } }),
      tx.patient.findUnique({ where: { id: data.patientId } }),
      tx.user.findFirst({ where: { id: data.createdByUserId, isActive: true } }),
    ]);

    if (!clinic) throw new NotFoundException('Clinic not found');
    if (!patient || patient.primaryClinicId !== data.clinicId) {
      throw new NotFoundException('Patient not found for this clinic');
    }
    if (!user) throw new NotFoundException('User not found');

    return tx.encounter.create({
      data: {
        clinicId: data.clinicId,
        patientId: data.patientId,
        status: 'DRAFT',
        createdByUserId: data.createdByUserId,
      },
    });
  }

  /**
   * The UTC window covering one operational day at a clinic.
   *
   * This used to build the window from UTC midnight to UTC midnight while telling the client
   * the day was in `Africa/Accra`. Ghana is on UTC year round, so the two agreed by accident
   * and the bug never showed; any clinic in another zone got a window shifted by its offset,
   * and "today" with no date was UTC's today rather than the clinic's. Clinics can now carry
   * a real time zone, so the accident no longer holds.
   *
   * The web already asks for `?date=` computed in the clinic's zone, so this is also what makes
   * the two layers agree about which day they are talking about.
   */
  private async getDayRange(clinicId: string, date?: string): Promise<ClinicDayWindow> {
    return clinicDayWindow(date, await this.clinicTimeZone(clinicId));
  }

  /** The clinic day containing `instant`. */
  private async getDayRangeAt(clinicId: string, instant: Date): Promise<ClinicDayWindow> {
    const timeZone = await this.clinicTimeZone(clinicId);
    return clinicDayWindow(todayInTimeZone(timeZone, instant), timeZone);
  }

  private async clinicTimeZone(clinicId: string): Promise<string> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE;
  }

  /** When an online write happens now; when a replayed one happened on the device. */
  private async writeTime(clinicId: string, context: OpsWriteContext): Promise<Date> {
    const now = new Date();
    if (!context.replay) return now;
    return resolveReplayTime(context.replay.occurredAt, now, await this.clinicTimeZone(clinicId));
  }

  /**
   * The shift a client-supplied id already names, if its check-in already applied.
   *
   * An id that names someone else's shift is not a replay of this request, and is refused rather
   * than returned: returning it would hand one user another user's shift.
   */
  private async findOwnShift(id: string | undefined, clinicId: string, userId: string) {
    if (!id) return null;
    const shift = await this.prisma.staffShift.findUnique({
      where: { id },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (!shift) return null;
    if (shift.clinicId !== clinicId || shift.userId !== userId) {
      throw new ConflictException({
        code: 'APPLICATION_CONFLICT',
        message: 'This shift id is already in use.',
      });
    }
    return shift;
  }

  /** The check-in a client-supplied id already names, if it already applied. */
  private async findOwnCheckIn(id: string | undefined, clinicId: string, patientId: string) {
    if (!id) return null;
    const checkIn = await this.prisma.patientCheckIn.findUnique({
      where: { id },
      include: { patient: { select: PATIENT_SUMMARY_SELECT } },
    });
    if (!checkIn) return null;
    if (checkIn.clinicId !== clinicId || checkIn.patientId !== patientId) {
      throw new ConflictException({
        code: 'APPLICATION_CONFLICT',
        message: 'This check-in id is already in use.',
      });
    }
    return checkIn;
  }

  private shiftAlreadyActive(active: ShiftWithUser | null) {
    return new ConflictException({
      code: 'SHIFT_ALREADY_ACTIVE',
      message: 'User already has an active shift in this clinic',
      ...(active ? { existingShiftId: active.id, existingShift: this.toActiveShift(active) } : {}),
    });
  }

  /**
   * A write that had already applied before this request. A replay still leaves its idempotency
   * record, so the next replay of the same key is answered without reaching this service.
   */
  private async alreadyApplied<T>(clinicId: string, context: OpsWriteContext, result: T) {
    if (context.replay) {
      await recordAppliedSyncMutation(this.prisma, clinicId, context.replay.syncMutation);
    }
    return result;
  }

  /** The audit event, and for a replay its idempotency record, committed with the write. */
  private async recordWrite(
    tx: TxClient,
    clinicId: string,
    actorUserId: string,
    context: OpsWriteContext,
    event: Pick<LogWriteParams, 'action' | 'entityType' | 'entityId' | 'beforeJson' | 'afterJson'>,
  ) {
    await this.auditService.logWrite(
      {
        ...event,
        clinicId,
        actorUserId,
        requestId: context.requestId,
        ipAddress: context.replay?.ipAddress,
        userAgent: context.replay?.userAgent,
      },
      tx,
    );
    if (context.replay) {
      await recordAppliedSyncMutation(tx, clinicId, context.replay.syncMutation);
    }
  }

  private toUserRole(roleAtShift: ShiftRole): UserRole {
    return roleAtShift as unknown as UserRole;
  }

  private toActiveShift(shift: ShiftWithUser) {
    return {
      shiftId: shift.id,
      userId: shift.userId,
      displayName: shift.user.displayName,
      roleAtShift: shift.roleAtShift,
      checkedInAt: shift.checkedInAt.toISOString(),
      status: shift.status,
    };
  }

  private toShiftDetail(shift: ShiftWithUser) {
    return {
      id: shift.id,
      clinicId: shift.clinicId,
      userId: shift.userId,
      displayName: shift.user.displayName,
      roleAtShift: shift.roleAtShift,
      checkedInAt: shift.checkedInAt.toISOString(),
      checkedOutAt: shift.checkedOutAt?.toISOString() ?? null,
      status: shift.status,
      notes: shift.notes,
    };
  }

  private toCheckInSummary(checkIn: {
    id: string;
    clinicId: string;
    patientId: string;
    checkedInAt: Date;
    source: string;
    status: CheckInStatus;
    encounterId: string | null;
    notes: string | null;
    patient: {
      id: string;
      patientCode: string;
      firstName: string;
      lastName: string;
    };
    assignments?: Array<{
      id: string;
      assignedAt: Date;
      status: AssignmentStatus;
      assignedVolunteer: { id: string; displayName: string };
      assignedDoctor: { id: string; displayName: string };
      assignedBy: { id: string; displayName: string };
    }>;
  }) {
    const assignment = checkIn.assignments?.[0] ?? null;
    return {
      id: checkIn.id,
      clinicId: checkIn.clinicId,
      patientId: checkIn.patientId,
      checkedInAt: checkIn.checkedInAt.toISOString(),
      source: checkIn.source,
      status: checkIn.status,
      encounterId: checkIn.encounterId,
      notes: checkIn.notes,
      patient: {
        id: checkIn.patient.id,
        patientCode: checkIn.patient.patientCode,
        firstName: checkIn.patient.firstName,
        lastName: checkIn.patient.lastName,
        displayName: `${checkIn.patient.firstName} ${checkIn.patient.lastName}`.trim(),
      },
      assignmentSummary: assignment
        ? {
            id: assignment.id,
            assignedAt: assignment.assignedAt.toISOString(),
            status: assignment.status,
            assignedVolunteer: assignment.assignedVolunteer,
            assignedDoctor: assignment.assignedDoctor,
            assignedBy: assignment.assignedBy,
          }
        : null,
    };
  }

  private toAssignmentSummary(assignment: PatientAssignmentSummaryPayload) {
    return {
      id: assignment.id,
      clinicId: assignment.clinicId,
      patientCheckInId: assignment.patientCheckInId,
      assignedAt: assignment.assignedAt.toISOString(),
      status: assignment.status,
      reason: assignment.reason,
      assignedVolunteer: assignment.assignedVolunteer,
      assignedDoctor: assignment.assignedDoctor,
      assignedBy: assignment.assignedBy,
      patientCheckIn: {
        id: assignment.patientCheckIn.id,
        checkedInAt: assignment.patientCheckIn.checkedInAt.toISOString(),
        status: assignment.patientCheckIn.status,
        encounterId: assignment.patientCheckIn.encounterId,
      },
      patient: {
        id: assignment.patientCheckIn.patient.id,
        patientCode: assignment.patientCheckIn.patient.patientCode,
        firstName: assignment.patientCheckIn.patient.firstName,
        lastName: assignment.patientCheckIn.patient.lastName,
        displayName:
          `${assignment.patientCheckIn.patient.firstName} ${assignment.patientCheckIn.patient.lastName}`.trim(),
      },
    };
  }

  private toMyAssignmentSummary(assignment: PatientAssignmentSummaryPayload, actorUserId: string) {
    return {
      id: assignment.id,
      patientCheckInId: assignment.patientCheckInId,
      assignedRole: assignment.assignedVolunteerId === actorUserId ? 'VOLUNTEER' : 'DOCTOR',
      assignedAt: assignment.assignedAt.toISOString(),
      checkInStatus: assignment.patientCheckIn.status,
      checkedInAt: assignment.patientCheckIn.checkedInAt.toISOString(),
      encounterId: assignment.patientCheckIn.encounterId,
      patient: {
        id: assignment.patientCheckIn.patient.id,
        patientCode: assignment.patientCheckIn.patient.patientCode,
        firstName: assignment.patientCheckIn.patient.firstName,
        lastName: assignment.patientCheckIn.patient.lastName,
        displayName:
          `${assignment.patientCheckIn.patient.firstName} ${assignment.patientCheckIn.patient.lastName}`.trim(),
      },
      assignedVolunteer: assignment.assignedVolunteer,
      assignedDoctor: assignment.assignedDoctor,
    };
  }
}
