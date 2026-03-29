import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, CheckInStatus, Prisma, ShiftRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateAssignmentDto,
  CreatePatientCheckInDto,
  ListAssignmentsQueryDto,
  ListCheckInsQueryDto,
  ReassignAssignmentDto,
  ShiftCheckInDto,
} from './dto/ops.dto';

const DEFAULT_CLINIC_TIMEZONE = 'Africa/Accra';

type TxClient = Prisma.TransactionClient;

interface DayRange {
  date: string;
  timezone: string;
  start: Date;
  end: Date;
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

  async checkIn(clinicId: string, actorUserId: string, dto: ShiftCheckInDto, requestId?: string) {
    await this.assertActiveClinic(clinicId);
    await this.assertShiftRoleMembership(clinicId, actorUserId, dto.roleAtShift);

    const existing = await this.prisma.staffShift.findFirst({
      where: { clinicId, userId: actorUserId, status: 'ACTIVE' },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (existing) {
      throw new ConflictException({
        message: 'User already has an active shift in this clinic',
        existingShift: this.toActiveShift(existing),
      });
    }

    const created = await this.prisma.staffShift.create({
      data: {
        clinicId,
        userId: actorUserId,
        roleAtShift: dto.roleAtShift,
        checkedInAt: new Date(),
        status: 'ACTIVE',
        notes: dto.notes ?? null,
      },
      include: { user: { select: { id: true, displayName: true } } },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'SHIFT.CHECKIN',
      entityType: 'StaffShift',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId,
    });

    return this.toShiftDetail(created);
  }

  async checkOut(clinicId: string, shiftId: string, actorUserId: string, requestId?: string) {
    const existing = await this.prisma.staffShift.findUnique({
      where: { id: shiftId },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (!existing || existing.clinicId !== clinicId) {
      throw new NotFoundException('Shift not found');
    }
    if (existing.status !== 'ACTIVE') {
      throw new ConflictException('Shift is already checked out');
    }

    const canManage = await this.canManageClinicShift(clinicId, actorUserId);
    if (existing.userId !== actorUserId && !canManage) {
      throw new ForbiddenException(
        'Only the shift owner or clinic managers can check out this shift',
      );
    }

    const updated = await this.prisma.staffShift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        checkedOutAt: new Date(),
      },
      include: { user: { select: { id: true, displayName: true } } },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'SHIFT.CHECKOUT',
      entityType: 'StaffShift',
      entityId: updated.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
      requestId,
    });

    return this.toShiftDetail(updated);
  }

  async getActiveShifts(clinicId: string, date?: string) {
    const dayRange = this.getDayRange(date);
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

  async createCheckIn(
    clinicId: string,
    actorUserId: string,
    dto: CreatePatientCheckInDto,
    requestId?: string,
  ) {
    await this.assertActiveClinic(clinicId);
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, primaryClinicId: clinicId },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found for this clinic');
    }

    const created = await this.prisma.patientCheckIn.create({
      data: {
        clinicId,
        patientId: dto.patientId,
        checkedInAt: new Date(),
        source: dto.source ?? 'STAFF',
        status: 'WAITING',
        notes: dto.notes ?? null,
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
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'CHECKIN.CREATE',
      entityType: 'PatientCheckIn',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId,
    });

    return this.toCheckInSummary(created);
  }

  async listCheckIns(clinicId: string, query: ListCheckInsQueryDto) {
    const dayRange = this.getDayRange(query.date);
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
    const dayRange = this.getDayRange(query.date);
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
    const dayRange = this.getDayRange(date);
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

  private getDayRange(date?: string): DayRange {
    const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${resolvedDate}T00:00:00.000Z`);
    const end = new Date(`${resolvedDate}T23:59:59.999Z`);
    return {
      date: resolvedDate,
      timezone: DEFAULT_CLINIC_TIMEZONE,
      start,
      end,
    };
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
