import { normalizePhoneToE164 } from '@nkwapa/db';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentRequestStatus,
  AppointmentRequestType,
  AppointmentStatus,
  EncounterStatus,
  PatientMeasurementSource,
  PatientMeasurementType,
  PatientSelfReportType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import type { CreateSelfReportDto } from './dto/create-self-report.dto';
import type {
  CreatePatientMeasurementDto,
  ListPatientMeasurementsQueryDto,
} from './dto/patient-measurements.dto';
import type { ListPatientTrendsQueryDto } from './dto/patient-trends.dto';
import type {
  CancelAppointmentDto,
  CompleteAppointmentDto,
  ConfirmAppointmentRequestDto,
  CreateAppointmentRequestDto,
  ListAppointmentsQueryDto,
  ListAppointmentRequestsQueryDto,
  MarkNoShowAppointmentDto,
  PatientCancelAppointmentRequestDto,
  PatientRescheduleAppointmentRequestDto,
  RejectAppointmentRequestDto,
  RescheduleAppointmentDto,
} from './dto/appointment-requests.dto';
import type { CreatePatientPortalInviteDto } from './dto/portal-invite.dto';
import {
  APPOINTMENT_REMINDER_TEMPLATE_KEY,
  PATIENT_REMINDER_TEMPLATE_KEYS,
} from '../notifications/templates';
import type { ClaimPatientRecordDto } from './dto/claim-record.dto';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PATIENT_PORTAL_LINK_MISSING = 'PATIENT_PORTAL_LINK_MISSING';

const appointmentRequestInclude = {
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phoneE164: true,
      email: true,
    },
  },
  triagedBy: { select: { id: true, displayName: true } },
  appointment: {
    include: {
      assignedDoctor: { select: { id: true, displayName: true } },
      assignedVolunteer: { select: { id: true, displayName: true } },
    },
  },
  sourceAppointment: {
    include: {
      assignedDoctor: { select: { id: true, displayName: true } },
      assignedVolunteer: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.AppointmentRequestInclude;

const appointmentScheduleInclude = {
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phoneE164: true,
      email: true,
    },
  },
  assignedDoctor: { select: { id: true, displayName: true } },
  assignedVolunteer: { select: { id: true, displayName: true } },
  reminders: {
    select: {
      id: true,
      status: true,
      channel: true,
      templateKey: true,
      scheduledAt: true,
      failureReason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentRequestWithRelations = Prisma.AppointmentRequestGetPayload<{
  include: typeof appointmentRequestInclude;
}>;

type AppointmentScheduleWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentScheduleInclude;
}>;

type AppointmentLifecycleAction = 'reschedule' | 'cancel' | 'complete' | 'no-show';

interface PortalPatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dob: Date | null;
  sex: string;
  primaryClinicId: string;
  phoneE164: string | null;
  email: string | null;
}

export interface ParsedMeasurementPayload {
  [key: string]: unknown;
}

interface BloodPressureTrendPoint {
  t: string;
  sys: number;
  dia: number;
  source: 'ENCOUNTER' | 'PATIENT';
}

interface GlucoseTrendPoint {
  t: string;
  value: number;
  type: 'FASTING' | 'RANDOM' | 'UNKNOWN';
  source: 'ENCOUNTER' | 'PATIENT';
}

interface ExpandedVitalsTrendPoint {
  t: string;
  temperatureCelsius: number | null;
  respiratoryRate: number | null;
  spo2Percent: number | null;
  weightKg: number | null;
  bmi: number | null;
  source: 'ENCOUNTER';
}

interface FollowUpSummary {
  requested: number;
  confirmed: number;
  completed: number;
  noShow: number;
  closed: number;
}

export interface AppointmentReminderSummary {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  nextQueuedAt: string | null;
  channels: string[];
  latestFailureReason: string | null;
}

interface AppointmentRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

export interface PatientTrendsResponse {
  bp: BloodPressureTrendPoint[];
  glucose: GlucoseTrendPoint[];
  measurements?: ExpandedVitalsTrendPoint[];
  followUp: FollowUpSummary;
}

@Injectable()
export class PatientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reminderService: ReminderService,
    private readonly emailDeliverabilityService: EmailDeliverabilityService,
  ) {}

  async getMe(clinicId: string, userId: string) {
    const patient = await this.resolvePortalPatient(clinicId, userId);

    const latestFinalized = await this.prisma.encounter.findFirst({
      where: {
        patientId: patient.id,
        clinicId,
        status: 'FINALIZED',
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        carePlan: true,
      },
    });

    const carePlan = latestFinalized?.carePlan;
    const recommendations = carePlan
      ? {
          followUpDate: carePlan.followUpDate?.toISOString() ?? null,
          carePlanNotes: carePlan.notes ?? null,
          counselingGiven: carePlan.counselingGiven,
          medicationPrescribed: carePlan.medicationPrescribed,
        }
      : null;

    const reminders = await this.prisma.reminder.findMany({
      // Explicitly the reminder templates. The ledger now also carries portal invites
      // and appointment lifecycle mail, and a patient's own feed showing "invite sent"
      // after they already claimed the record would be noise at best.
      where: {
        patientId: patient.id,
        clinicId,
        recipientType: 'PATIENT',
        templateKey: { in: [...PATIENT_REMINDER_TEMPLATE_KEYS] },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        channel: true,
      },
    });

    return {
      patient: {
        id: patient.id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dob: patient.dob?.toISOString().slice(0, 10) ?? null,
        sex: patient.sex,
      },
      recommendations,
      reminders: reminders.map((r) => ({
        id: r.id,
        scheduledAt: r.scheduledAt.toISOString(),
        status: r.status,
        channel: r.channel,
      })),
    };
  }

  async listMeasurementsForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    query: ListPatientMeasurementsQueryDto,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    return this.listMeasurements(patient.id, clinicId, query);
  }

  async listMeasurementsForStaff(
    patientId: string,
    clinicId: string,
    query: ListPatientMeasurementsQueryDto,
  ) {
    await this.assertPatientInClinic(patientId, clinicId);
    return this.listMeasurements(patientId, clinicId, query);
  }

  async listTrendsForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    query: ListPatientTrendsQueryDto,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    return this.listTrends(patient.id, clinicId, query, ['FINALIZED'], false);
  }

  async listTrendsForStaff(patientId: string, clinicId: string, query: ListPatientTrendsQueryDto) {
    await this.assertPatientInClinic(patientId, clinicId);
    return this.listTrends(patientId, clinicId, query, ['DRAFT', 'IN_REVIEW', 'FINALIZED'], true);
  }

  async createMeasurementForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    dto: CreatePatientMeasurementDto,
    requestId?: string,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    return this.createMeasurement({
      patient,
      clinicId,
      actorUserId: userId,
      source: 'PATIENT',
      dto,
      requestId,
      allowUnknownGlucoseType: false,
    });
  }

  async createAppointmentRequestForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    dto: CreateAppointmentRequestDto,
    requestId?: string,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    const requestClinicId = dto.clinicId ?? clinicId;
    if (requestClinicId !== clinicId) {
      throw new BadRequestException('clinicId must match the active clinic context');
    }
    if (requestClinicId !== patient.primaryClinicId) {
      throw new ForbiddenException(
        'Patient portal access is limited to the patient primary clinic',
      );
    }

    const preferredStartDate = this.parseDateOnly(dto.preferredStartDate, 'preferredStartDate');
    const preferredEndDate = this.parseDateOnly(dto.preferredEndDate, 'preferredEndDate');
    if (preferredEndDate < preferredStartDate) {
      throw new BadRequestException('preferredEndDate must be on or after preferredStartDate');
    }

    const created = await this.prisma.appointmentRequest.create({
      data: {
        clinicId: requestClinicId,
        patientId: patient.id,
        requestType: AppointmentRequestType.NEW_APPOINTMENT,
        preferredStartDate,
        preferredEndDate,
        reason: dto.reason?.trim() || null,
        notes: dto.notes?.trim() || null,
        status: 'REQUESTED',
      },
      include: appointmentRequestInclude,
    });

    await this.auditService.logWrite({
      clinicId: requestClinicId,
      actorUserId: userId,
      action: 'APPT.REQUEST.CREATE',
      entityType: 'AppointmentRequest',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId,
    });

    return this.serializeAppointmentRequest(created);
  }

  async listAppointmentRequestsForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    query: ListAppointmentRequestsQueryDto,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    const where = this.buildAppointmentRequestWhere(clinicId, query, patient.id);
    const items = await this.prisma.appointmentRequest.findMany({
      where,
      include: appointmentRequestInclude,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeAppointmentRequest(item));
  }

  async listAppointmentsForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    query: ListAppointmentsQueryDto,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    const range = query.from || query.to ? this.resolveAppointmentRange(query) : null;
    const where: Prisma.AppointmentWhereInput = range
      ? this.buildAppointmentWhere(clinicId, query, range, patient.id)
      : {
          clinicId,
          patientId: patient.id,
          ...(query.status ? { status: query.status } : {}),
        };
    const items = await this.prisma.appointment.findMany({
      where,
      include: appointmentScheduleInclude,
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      range: {
        from: range?.from ?? null,
        to: range?.to ?? null,
      },
      timezone: 'Africa/Accra',
      summary: this.summarizeAppointments(items),
      items: items.map((item) => this.serializeAppointment(item)),
    };
  }

  async createCancelAppointmentRequestForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    appointmentId: string,
    dto: PatientCancelAppointmentRequestDto,
    requestId?: string,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        fieldErrors: [{ field: 'reason', message: 'reason should not be empty' }],
        recoveryAction: 'Add a cancellation reason and try again.',
      });
    }

    const { patient, appointment } = await this.resolvePatientChangeRequestAppointment(
      clinicId,
      userId,
      appointmentId,
      'cancel',
    );

    const appointmentDate = this.toDateOnly(appointment.startsAt);
    const created = await this.prisma.appointmentRequest.create({
      data: {
        clinicId,
        patientId: patient.id,
        requestType: AppointmentRequestType.CANCEL_APPOINTMENT,
        sourceAppointmentId: appointment.id,
        preferredStartDate: appointmentDate,
        preferredEndDate: appointmentDate,
        reason,
        notes: dto.notes?.trim() || null,
        status: AppointmentRequestStatus.REQUESTED,
      },
      include: appointmentRequestInclude,
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: userId,
      action: 'APPT.REQUEST.CANCEL_REQUEST.CREATE',
      entityType: 'AppointmentRequest',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId,
    });

    return this.serializeAppointmentRequest(created);
  }

  async createRescheduleAppointmentRequestForAuthenticatedPatient(
    clinicId: string,
    userId: string,
    appointmentId: string,
    dto: PatientRescheduleAppointmentRequestDto,
    requestId?: string,
  ) {
    const preferredStartDate = this.parseDateOnly(dto.preferredStartDate, 'preferredStartDate');
    const preferredEndDate = this.parseDateOnly(dto.preferredEndDate, 'preferredEndDate');
    if (preferredEndDate < preferredStartDate) {
      throw new BadRequestException('preferredEndDate must be on or after preferredStartDate');
    }

    const { patient, appointment } = await this.resolvePatientChangeRequestAppointment(
      clinicId,
      userId,
      appointmentId,
      'reschedule',
    );

    const created = await this.prisma.appointmentRequest.create({
      data: {
        clinicId,
        patientId: patient.id,
        requestType: AppointmentRequestType.RESCHEDULE_APPOINTMENT,
        sourceAppointmentId: appointment.id,
        preferredStartDate,
        preferredEndDate,
        reason: dto.reason?.trim() || null,
        notes: dto.notes?.trim() || null,
        status: AppointmentRequestStatus.REQUESTED,
      },
      include: appointmentRequestInclude,
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: userId,
      action: 'APPT.REQUEST.RESCHEDULE_REQUEST.CREATE',
      entityType: 'AppointmentRequest',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId,
    });

    return this.serializeAppointmentRequest(created);
  }

  async listAppointmentRequestsForClinic(clinicId: string, query: ListAppointmentRequestsQueryDto) {
    const where = this.buildAppointmentRequestWhere(clinicId, query);
    const items = await this.prisma.appointmentRequest.findMany({
      where,
      include: appointmentRequestInclude,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeAppointmentRequest(item, true));
  }

  async listAppointmentsForClinic(clinicId: string, query: ListAppointmentsQueryDto) {
    const range = this.resolveAppointmentRange(query);
    const where = this.buildAppointmentWhere(clinicId, query, range);
    const items = await this.prisma.appointment.findMany({
      where,
      include: appointmentScheduleInclude,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      range: {
        from: range.from,
        to: range.to,
      },
      timezone: 'Africa/Accra',
      summary: this.summarizeAppointments(items),
      items: items.map((item) => this.serializeScheduledAppointment(item)),
    };
  }

  async listAppointmentStaffOptionsForClinic(clinicId: string) {
    const rows = await this.prisma.userClinicRole.findMany({
      where: {
        clinicId,
        role: { in: [UserRole.DOCTOR, UserRole.VOLUNTEER] },
        user: { isActive: true },
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const doctors = new Map<string, { id: string; displayName: string }>();
    const volunteers = new Map<string, { id: string; displayName: string }>();

    for (const row of rows) {
      const option = { id: row.user.id, displayName: row.user.displayName };
      if (row.role === UserRole.DOCTOR) {
        doctors.set(option.id, option);
      }
      if (row.role === UserRole.VOLUNTEER) {
        volunteers.set(option.id, option);
      }
    }

    const byName = (left: { displayName: string }, right: { displayName: string }) =>
      left.displayName.localeCompare(right.displayName);

    return {
      doctors: [...doctors.values()].sort(byName),
      volunteers: [...volunteers.values()].sort(byName),
    };
  }

  async rescheduleAppointment(
    clinicId: string,
    appointmentId: string,
    actorUserId: string,
    dto: RescheduleAppointmentDto,
    requestId?: string,
  ) {
    const startsAt = this.parseDateTime(dto.startsAt, 'startsAt');
    const endsAt = this.parseDateTime(dto.endsAt, 'endsAt');
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    await Promise.all([
      dto.assignedDoctorId
        ? this.assertAppointmentAssignee(clinicId, dto.assignedDoctorId, 'DOCTOR')
        : Promise.resolve(),
      dto.assignedVolunteerId
        ? this.assertAppointmentAssignee(clinicId, dto.assignedVolunteerId, 'VOLUNTEER')
        : Promise.resolve(),
    ]);

    const { before, after } = await this.mutateConfirmedAppointment({
      clinicId,
      appointmentId,
      action: 'reschedule',
      data: {
        startsAt,
        endsAt,
        assignedDoctorId: dto.assignedDoctorId ?? null,
        assignedVolunteerId: dto.assignedVolunteerId ?? null,
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });

    await this.auditAppointmentLifecycle({
      clinicId,
      actorUserId,
      action: 'APPT.RESCHEDULE',
      before,
      after,
      requestId,
      metadata: {
        previousStatus: before.status,
        newStatus: after.status,
        previousStartsAt: before.startsAt.toISOString(),
        previousEndsAt: before.endsAt.toISOString(),
        newStartsAt: after.startsAt.toISOString(),
        newEndsAt: after.endsAt.toISOString(),
      },
    });

    await this.reminderService.suppressQueuedAppointmentReminders(
      clinicId,
      appointmentId,
      actorUserId,
      'APPOINTMENT_RESCHEDULED',
      requestId,
    );
    await this.scheduleAppointmentReminder(after.patient, after, actorUserId, requestId);

    return this.serializeScheduledAppointment(after);
  }

  async cancelAppointment(
    clinicId: string,
    appointmentId: string,
    actorUserId: string,
    dto: CancelAppointmentDto,
    requestId?: string,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        fieldErrors: [{ field: 'reason', message: 'reason should not be empty' }],
        recoveryAction: 'Add a cancellation reason and try again.',
      });
    }

    const { before, after } = await this.mutateConfirmedAppointment({
      clinicId,
      appointmentId,
      action: 'cancel',
      data: { status: 'CANCELLED' },
    });

    await this.auditAppointmentLifecycle({
      clinicId,
      actorUserId,
      action: 'APPT.CANCEL',
      before,
      after,
      requestId,
      metadata: { previousStatus: before.status, newStatus: after.status, reason },
    });
    await this.reminderService.suppressQueuedAppointmentReminders(
      clinicId,
      appointmentId,
      actorUserId,
      'APPOINTMENT_CANCELLED',
      requestId,
    );

    return this.serializeScheduledAppointment(after);
  }

  async completeAppointment(
    clinicId: string,
    appointmentId: string,
    actorUserId: string,
    dto: CompleteAppointmentDto,
    requestId?: string,
  ) {
    const { before, after } = await this.mutateConfirmedAppointment({
      clinicId,
      appointmentId,
      action: 'complete',
      requireStarted: true,
      data: {
        status: 'COMPLETED',
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });

    await this.auditAppointmentLifecycle({
      clinicId,
      actorUserId,
      action: 'APPT.COMPLETE',
      before,
      after,
      requestId,
      metadata: {
        previousStatus: before.status,
        newStatus: after.status,
        notes: dto.notes?.trim() || null,
      },
    });
    await this.reminderService.suppressQueuedAppointmentReminders(
      clinicId,
      appointmentId,
      actorUserId,
      'APPOINTMENT_COMPLETED',
      requestId,
    );

    return this.serializeScheduledAppointment(after);
  }

  async markAppointmentNoShow(
    clinicId: string,
    appointmentId: string,
    actorUserId: string,
    dto: MarkNoShowAppointmentDto,
    requestId?: string,
  ) {
    const reason = dto.reason?.trim() || null;
    const { before, after } = await this.mutateConfirmedAppointment({
      clinicId,
      appointmentId,
      action: 'no-show',
      requireStarted: true,
      data: { status: 'NO_SHOW' },
    });

    await this.auditAppointmentLifecycle({
      clinicId,
      actorUserId,
      action: 'APPT.NO_SHOW',
      before,
      after,
      requestId,
      metadata: { previousStatus: before.status, newStatus: after.status, reason },
    });
    await this.reminderService.suppressQueuedAppointmentReminders(
      clinicId,
      appointmentId,
      actorUserId,
      'APPOINTMENT_NO_SHOW',
      requestId,
    );

    return this.serializeScheduledAppointment(after);
  }

  async confirmAppointmentRequest(
    clinicId: string,
    appointmentRequestId: string,
    actorUserId: string,
    dto: ConfirmAppointmentRequestDto,
    requestId?: string,
  ) {
    const existing = await this.prisma.appointmentRequest.findFirst({
      where: { id: appointmentRequestId, clinicId },
      include: appointmentRequestInclude,
    });
    if (!existing) {
      throw new NotFoundException('Appointment request not found');
    }
    if (!['REQUESTED', 'TRIAGED'].includes(existing.status)) {
      throw new BadRequestException('Only requested appointment requests can be confirmed');
    }
    if (existing.appointment) {
      throw new ConflictException('Appointment request is already linked to an appointment');
    }

    const startsAt = this.parseDateTime(dto.startsAt, 'startsAt');
    const endsAt = this.parseDateTime(dto.endsAt, 'endsAt');
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    await Promise.all([
      dto.assignedDoctorId
        ? this.assertAppointmentAssignee(clinicId, dto.assignedDoctorId, 'DOCTOR')
        : Promise.resolve(),
      dto.assignedVolunteerId
        ? this.assertAppointmentAssignee(clinicId, dto.assignedVolunteerId, 'VOLUNTEER')
        : Promise.resolve(),
    ]);

    const { appointment, updatedRequest } = await this.prisma.$transaction(async (tx) => {
      const createdAppointment = await tx.appointment.create({
        data: {
          clinicId,
          patientId: existing.patientId,
          startsAt,
          endsAt,
          status: 'CONFIRMED',
          linkedRequestId: existing.id,
          assignedDoctorId: dto.assignedDoctorId ?? null,
          assignedVolunteerId: dto.assignedVolunteerId ?? null,
          notes: dto.notes?.trim() || null,
        },
      });

      const requestRecord = await tx.appointmentRequest.update({
        where: { id: existing.id },
        data: {
          status: 'CONFIRMED',
          triagedByUserId: actorUserId,
          triagedAt: new Date(),
          rejectionReason: null,
        },
        include: appointmentRequestInclude,
      });

      return { appointment: createdAppointment, updatedRequest: requestRecord };
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'APPT.CREATE',
      entityType: 'Appointment',
      entityId: appointment.id,
      afterJson: JSON.stringify(appointment),
      requestId,
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'APPT.REQUEST.CONFIRM',
      entityType: 'AppointmentRequest',
      entityId: updatedRequest.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updatedRequest),
      requestId,
    });

    await this.scheduleAppointmentReminder(
      updatedRequest.patient,
      appointment,
      actorUserId,
      requestId,
    );

    return {
      request: this.serializeAppointmentRequest(updatedRequest, true),
      appointment: this.serializeAppointment(appointment),
    };
  }

  async rejectAppointmentRequest(
    clinicId: string,
    appointmentRequestId: string,
    actorUserId: string,
    dto: RejectAppointmentRequestDto,
    requestId?: string,
  ) {
    const existing = await this.prisma.appointmentRequest.findFirst({
      where: { id: appointmentRequestId, clinicId },
      include: appointmentRequestInclude,
    });
    if (!existing) {
      throw new NotFoundException('Appointment request not found');
    }
    if (!['REQUESTED', 'TRIAGED'].includes(existing.status)) {
      throw new BadRequestException('Only requested appointment requests can be rejected');
    }

    const updated = await this.prisma.appointmentRequest.update({
      where: { id: existing.id },
      data: {
        status: 'REJECTED',
        triagedByUserId: actorUserId,
        triagedAt: new Date(),
        rejectionReason: dto.reason.trim(),
      },
      include: appointmentRequestInclude,
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'APPT.REQUEST.REJECT',
      entityType: 'AppointmentRequest',
      entityId: updated.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
      requestId,
    });

    return this.serializeAppointmentRequest(updated, true);
  }

  async listSelfReports(clinicId: string, userId: string) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    return this.listCompatibilitySelfReports(patient.id, clinicId);
  }

  async createSelfReport(
    clinicId: string,
    userId: string,
    dto: CreateSelfReportDto,
    requestId?: string,
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);

    if (dto.type === 'HOME_BP' || dto.type === 'HOME_GLUCOSE') {
      const measurementDto = this.translateLegacySelfReportToMeasurement(dto);
      const created = await this.createMeasurement({
        patient,
        clinicId,
        actorUserId: userId,
        source: 'PATIENT',
        dto: measurementDto,
        requestId,
        allowUnknownGlucoseType: true,
      });
      return this.serializeLegacySelfReportFromMeasurement(created);
    }

    const recordedAt = dto.recordedAt
      ? this.parseDateTime(dto.recordedAt, 'recordedAt')
      : new Date();

    const report = await this.prisma.patientSelfReport.create({
      data: {
        patientId: patient.id,
        clinicId,
        submittedByUserId: userId,
        type: dto.type,
        recordedAt,
        symptomsJson: dto.symptomsJson ?? null,
        notes: dto.notes ?? null,
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId: userId,
      action: 'PATIENT.SELF_REPORT.CREATE',
      entityType: 'PatientSelfReport',
      entityId: report.id,
      afterJson: JSON.stringify(report),
      requestId,
    });

    return this.serializeLegacySelfReport(report);
  }

  async linkPortalUser(
    clinicId: string,
    patientId: string,
    userId: string,
    actorUserId: string,
    requestId?: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingBySub = await this.prisma.patientAccountLink.findUnique({
      where: { keycloakSub: user.keycloakSub },
    });
    if (existingBySub && existingBySub.patientId !== patientId) {
      throw new ForbiddenException('User is already linked to another patient');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const link = await tx.patientAccountLink.upsert({
        where: { patientId },
        create: {
          patientId,
          keycloakSub: user.keycloakSub,
        },
        update: {
          keycloakSub: user.keycloakSub,
        },
      });

      await tx.patient.update({
        where: { id: patientId },
        data: { portalUserId: userId },
      });

      await tx.userClinicRole.upsert({
        where: {
          userId_clinicId_role: {
            userId,
            clinicId,
            role: 'PATIENT',
          },
        },
        create: {
          userId,
          clinicId,
          role: 'PATIENT',
        },
        update: {},
      });

      await tx.patientPortalInvite.updateMany({
        where: {
          patientId,
          clinicId,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      return link;
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'PATIENT.PORTAL.LINK',
      entityType: 'PatientAccountLink',
      entityId: updated.id,
      afterJson: JSON.stringify(updated),
      requestId,
    });

    return { success: true, patientId, userId, keycloakSub: user.keycloakSub };
  }

  async listPortalLinkCandidates(clinicId: string, patientId: string, q?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        primaryClinicId: clinicId,
        mergedIntoPatientId: null,
      },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        portalUserId: true,
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const trimmedQuery = q?.trim() ?? '';
    const queryPhone = trimmedQuery
      ? (normalizePhoneToE164(trimmedQuery, 'GH') ?? trimmedQuery.replace(/\s+/g, ''))
      : null;

    const clauses: Prisma.UserWhereInput[] = [];

    if (patient.portalUserId) {
      clauses.push({ id: patient.portalUserId });
    }

    if (trimmedQuery) {
      clauses.push(
        { email: { contains: trimmedQuery, mode: 'insensitive' } },
        { displayName: { contains: trimmedQuery, mode: 'insensitive' } },
        { firstName: { contains: trimmedQuery, mode: 'insensitive' } },
        { lastName: { contains: trimmedQuery, mode: 'insensitive' } },
      );
      if (queryPhone) {
        clauses.push({ phoneE164: { contains: queryPhone } });
      }
    } else {
      if (patient.email) {
        clauses.push({ email: { equals: patient.email, mode: 'insensitive' } });
      }
      if (patient.phoneE164) {
        clauses.push({ phoneE164: patient.phoneE164 });
      }
    }

    if (clauses.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: clauses,
      },
      select: {
        id: true,
        keycloakSub: true,
        displayName: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneE164: true,
      },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });

    if (users.length === 0) {
      return [];
    }

    const userIds = users.map((user) => user.id);
    const keycloakSubs = [
      ...new Set(
        users.map((user) => user.keycloakSub).filter((value): value is string => Boolean(value)),
      ),
    ];

    const [accountLinks, legacyLinks] = await Promise.all([
      keycloakSubs.length > 0
        ? this.prisma.patientAccountLink.findMany({
            where: {
              keycloakSub: { in: keycloakSubs },
            },
            select: {
              keycloakSub: true,
              patientId: true,
              patient: {
                select: {
                  patientCode: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.patient.findMany({
            where: {
              portalUserId: { in: userIds },
            },
            select: {
              id: true,
              portalUserId: true,
              patientCode: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const linkedByKeycloakSub = new Map(
      accountLinks.map((link) => [
        link.keycloakSub,
        {
          patientId: link.patientId,
          patientCode: link.patient.patientCode,
        },
      ]),
    );
    const linkedByUserId = new Map(
      legacyLinks
        .filter((linkedPatient) => Boolean(linkedPatient.portalUserId))
        .map((linkedPatient) => [
          linkedPatient.portalUserId as string,
          {
            patientId: linkedPatient.id,
            patientCode: linkedPatient.patientCode,
          },
        ]),
    );

    const normalizedPatientEmail = patient.email?.trim().toLowerCase() ?? null;
    const normalizedPatientPhone = patient.phoneE164 ?? null;

    return users
      .map((user) => {
        const existingLink =
          linkedByKeycloakSub.get(user.keycloakSub) ?? linkedByUserId.get(user.id) ?? null;

        if (existingLink && existingLink.patientId !== patientId) {
          return null;
        }

        let score = 0;
        if (patient.portalUserId && user.id === patient.portalUserId) {
          score += 100;
        }
        if (normalizedPatientEmail && user.email?.trim().toLowerCase() === normalizedPatientEmail) {
          score += 50;
        }
        if (normalizedPatientPhone && user.phoneE164 === normalizedPatientPhone) {
          score += 40;
        }
        if (trimmedQuery) {
          const loweredQuery = trimmedQuery.toLowerCase();
          if (user.email?.trim().toLowerCase() === loweredQuery) {
            score += 25;
          }
          if (queryPhone && user.phoneE164 === queryPhone) {
            score += 20;
          }
        }

        return {
          id: user.id,
          displayName:
            user.displayName ||
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
            user.email ||
            user.keycloakSub,
          email: user.email,
          phoneE164: user.phoneE164,
          alreadyLinked: existingLink?.patientId === patientId,
          isSuggestedMatch: score >= 40,
          score,
        };
      })
      .filter(
        (
          user,
        ): user is {
          id: string;
          displayName: string;
          email: string | null;
          phoneE164: string | null;
          alreadyLinked: boolean;
          isSuggestedMatch: boolean;
          score: number;
        } => Boolean(user),
      )
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.displayName.localeCompare(right.displayName);
      });
  }

  async createPortalInvite(
    clinicId: string,
    patientId: string,
    dto: CreatePatientPortalInviteDto,
    actorUserId: string,
    requestId?: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        primaryClinicId: clinicId,
        mergedIntoPatientId: null,
      },
      select: {
        id: true,
        portalUserId: true,
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const email = dto.email?.trim().toLowerCase() || null;
    const phoneE164 = dto.phoneE164
      ? (normalizePhoneToE164(dto.phoneE164, 'GH') ?? dto.phoneE164.trim())
      : null;

    if (!email && !phoneE164) {
      throw new BadRequestException('Provide an email or phone number to create a portal invite');
    }
    if (email) {
      await this.emailDeliverabilityService.assertDomainAcceptsEmail(email);
    }

    const existingLink = await this.prisma.patientAccountLink.findUnique({
      where: { patientId },
      select: { id: true },
    });
    if (existingLink || patient.portalUserId) {
      throw new ConflictException('This patient already has a linked portal account');
    }

    const expiresAt = dto.expiresAt ? this.parseDateTime(dto.expiresAt, 'expiresAt') : null;

    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.patientPortalInvite.updateMany({
        where: {
          patientId,
          clinicId,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      return tx.patientPortalInvite.create({
        data: {
          patientId,
          clinicId,
          email,
          phoneE164,
          expiresAt,
          createdByUserId: actorUserId,
        },
      });
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'PATIENT.PORTAL.INVITE',
      entityType: 'PatientPortalInvite',
      entityId: invite.id,
      afterJson: JSON.stringify(invite),
      requestId,
    });

    return this.serializePortalInvite(invite);
  }

  async cancelPortalInvite(
    clinicId: string,
    patientId: string,
    inviteId: string,
    actorUserId: string,
    requestId?: string,
  ) {
    const invite = await this.prisma.patientPortalInvite.findFirst({
      where: {
        id: inviteId,
        patientId,
        clinicId,
      },
    });
    if (!invite) {
      throw new NotFoundException('Portal invite not found');
    }
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Only pending portal invites can be cancelled');
    }

    const updated = await this.prisma.patientPortalInvite.update({
      where: { id: inviteId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'PATIENT.PORTAL.INVITE.CANCEL',
      entityType: 'PatientPortalInvite',
      entityId: updated.id,
      beforeJson: JSON.stringify(invite),
      afterJson: JSON.stringify(updated),
      requestId,
    });

    return this.serializePortalInvite(updated);
  }

  async listPendingInvitesForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        email: true,
        phoneE164: true,
      },
    });
    if (!user?.isActive) {
      return [];
    }

    const orConditions: Prisma.PatientPortalInviteWhereInput[] = [];
    if (user.email) {
      orConditions.push({
        email: {
          equals: user.email,
          mode: 'insensitive',
        },
      });
    }
    if (user.phoneE164) {
      orConditions.push({
        phoneE164: user.phoneE164,
      });
    }

    if (orConditions.length === 0) {
      return [];
    }

    const invites = await this.prisma.patientPortalInvite.findMany({
      where: {
        status: 'PENDING',
        OR: orConditions,
        patient: {
          mergedIntoPatientId: null,
        },
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientCode: true,
            primaryClinicId: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return invites.map((invite) => ({
      id: invite.id,
      clinicId: invite.clinicId,
      clinicName: invite.clinic.name,
      patientId: invite.patientId,
      patientName: `${invite.patient.firstName} ${invite.patient.lastName}`.trim(),
      patientCode: invite.patient.patientCode,
      email: invite.email,
      phoneE164: invite.phoneE164,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt?.toISOString() ?? null,
    }));
  }

  async claimPatientRecord(userId: string, dto: ClaimPatientRecordDto, requestId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        keycloakSub: true,
        isActive: true,
        email: true,
        phoneE164: true,
      },
    });
    if (!user?.isActive) {
      throw new NotFoundException('User not found');
    }

    const invite = await this.prisma.patientPortalInvite.findFirst({
      where: {
        id: dto.inviteId,
        status: 'PENDING',
      },
      include: {
        patient: {
          include: {
            codeAliases: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });
    if (!invite) {
      throw new NotFoundException('Pending portal invite not found');
    }
    if (invite.patient.mergedIntoPatientId) {
      throw new ConflictException('This patient record has been merged into another chart');
    }

    const matchesEmail =
      Boolean(invite.email) &&
      Boolean(user.email) &&
      invite.email!.toLowerCase() === user.email!.toLowerCase();
    const matchesPhone =
      Boolean(invite.phoneE164) && Boolean(user.phoneE164) && invite.phoneE164 === user.phoneE164;

    if (!matchesEmail && !matchesPhone) {
      throw new ForbiddenException(
        'This account does not match the email or phone number staged for the patient portal invite',
      );
    }

    const acceptedCodes = new Set([
      invite.patient.patientCode.toUpperCase(),
      ...invite.patient.codeAliases.map((alias) => alias.code.toUpperCase()),
    ]);
    if (!acceptedCodes.has(dto.patientCode.trim().toUpperCase())) {
      throw new BadRequestException('Patient code does not match this invited record');
    }

    const expectedDob = invite.patient.dob?.toISOString().slice(0, 10) ?? null;
    if (!expectedDob) {
      throw new BadRequestException(
        'This patient record is missing a date of birth. Ask clinic staff to update the chart before portal claim.',
      );
    }
    if (dto.dob !== expectedDob) {
      throw new BadRequestException('Date of birth does not match this invited record');
    }

    const existingLink = await this.prisma.patientAccountLink.findUnique({
      where: { keycloakSub: user.keycloakSub },
    });
    if (existingLink && existingLink.patientId !== invite.patientId) {
      throw new ConflictException('This account is already linked to another patient record');
    }

    const link = await this.prisma.$transaction(async (tx) => {
      const createdLink = await tx.patientAccountLink.upsert({
        where: { patientId: invite.patientId },
        create: {
          patientId: invite.patientId,
          keycloakSub: user.keycloakSub,
        },
        update: {
          keycloakSub: user.keycloakSub,
        },
      });

      await tx.patient.update({
        where: { id: invite.patientId },
        data: { portalUserId: user.id },
      });

      await tx.userClinicRole.upsert({
        where: {
          userId_clinicId_role: {
            userId,
            clinicId: invite.clinicId,
            role: 'PATIENT',
          },
        },
        create: {
          userId,
          clinicId: invite.clinicId,
          role: 'PATIENT',
        },
        update: {},
      });

      await tx.patientPortalInvite.update({
        where: { id: invite.id },
        data: {
          status: 'CLAIMED',
          claimedByUserId: user.id,
          claimedAt: new Date(),
        },
      });

      await tx.patientPortalInvite.updateMany({
        where: {
          patientId: invite.patientId,
          clinicId: invite.clinicId,
          status: 'PENDING',
          id: { not: invite.id },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      return createdLink;
    });

    await this.auditService.logWrite({
      clinicId: invite.clinicId,
      actorUserId: user.id,
      action: 'PATIENT.PORTAL.CLAIM',
      entityType: 'PatientAccountLink',
      entityId: link.id,
      afterJson: JSON.stringify(link),
      requestId,
    });

    return {
      success: true,
      clinicId: invite.clinicId,
      patientId: invite.patientId,
      patientCode: invite.patient.patientCode,
    };
  }

  async listSelfReportsForStaff(patientId: string, clinicId: string) {
    await this.assertPatientInClinic(patientId, clinicId);
    return this.listCompatibilitySelfReports(patientId, clinicId);
  }

  private async resolvePortalPatient(
    clinicId: string,
    userId: string,
  ): Promise<PortalPatientSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, keycloakSub: true, isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundException('Patient portal user not found');
    }

    const linkedPatient = await this.prisma.patientAccountLink.findFirst({
      where: {
        keycloakSub: user.keycloakSub,
        patient: { primaryClinicId: clinicId },
      },
      select: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
            dob: true,
            sex: true,
            primaryClinicId: true,
            phoneE164: true,
            email: true,
          },
        },
      },
    });

    if (linkedPatient?.patient) {
      return linkedPatient.patient;
    }

    const legacyPatient = await this.prisma.patient.findFirst({
      where: { portalUserId: userId, primaryClinicId: clinicId },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        dob: true,
        sex: true,
        primaryClinicId: true,
        phoneE164: true,
        email: true,
      },
    });
    if (legacyPatient) {
      return legacyPatient;
    }

    const [clinicPatientRole, linkedPatientAnywhere, legacyPatientAnywhere] = await Promise.all([
      this.prisma.userClinicRole.findFirst({
        where: {
          userId,
          clinicId,
          role: UserRole.PATIENT,
        },
        select: { id: true },
      }),
      this.prisma.patientAccountLink.findFirst({
        where: { keycloakSub: user.keycloakSub },
        select: {
          patient: {
            select: {
              id: true,
            },
          },
        },
      }),
      this.prisma.patient.findFirst({
        where: { portalUserId: userId },
        select: { id: true },
      }),
    ]);

    if (clinicPatientRole || linkedPatientAnywhere?.patient || legacyPatientAnywhere) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: PATIENT_PORTAL_LINK_MISSING,
        message:
          'This patient account is not linked to a patient record for the active clinic. Ask clinic staff to link portal access from the patient record.',
      });
    }

    throw new NotFoundException('Patient record not found for this clinic');
  }

  private async assertPatientInClinic(patientId: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found for this clinic');
    }
  }

  private async listMeasurements(
    patientId: string,
    clinicId: string,
    query: ListPatientMeasurementsQueryDto,
  ) {
    const recordedAtFilter = this.buildRecordedAtFilter(query.from, query.to);
    const items = await this.prisma.patientMeasurement.findMany({
      where: {
        patientId,
        clinicId,
        ...(query.type ? { type: query.type } : {}),
        ...(recordedAtFilter ? { recordedAt: recordedAtFilter } : {}),
      },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return items.map((item) => this.serializeMeasurement(item));
  }

  private async listTrends(
    patientId: string,
    clinicId: string,
    query: ListPatientTrendsQueryDto,
    encounterStatuses: EncounterStatus[],
    includeExpandedVitals: boolean,
  ): Promise<PatientTrendsResponse> {
    const dateFilter = this.buildRecordedAtFilter(query.from, query.to);

    const [
      measurements,
      encounters,
      diabetesScreenings,
      requested,
      confirmed,
      completed,
      noShow,
      closedRequests,
      closedAppointments,
    ] = await Promise.all([
      this.prisma.patientMeasurement.findMany({
        where: {
          patientId,
          clinicId,
          type: { in: ['BP', 'GLUCOSE'] },
          ...(dateFilter ? { recordedAt: dateFilter } : {}),
        },
        orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.encounter.findMany({
        where: {
          patientId,
          clinicId,
          status: { in: encounterStatuses },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        select: {
          createdAt: true,
          vitals: {
            select: {
              systolicBp: true,
              diastolicBp: true,
              temperatureCelsius: true,
              respiratoryRate: true,
              spo2Percent: true,
              weightKg: true,
              bmi: true,
            },
          },
        },
      }),
      this.prisma.diabetesScreening.findMany({
        where: {
          clinicId,
          encounter: { patientId, status: { in: encounterStatuses } },
          ...(dateFilter ? { collectedAt: dateFilter } : {}),
        },
        select: { collectedAt: true, glucoseMgDl: true, glucoseType: true },
      }),
      this.prisma.appointmentRequest.count({
        where: {
          clinicId,
          patientId,
          status: { in: [AppointmentRequestStatus.REQUESTED, AppointmentRequestStatus.TRIAGED] },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      this.prisma.appointment.count({
        where: {
          clinicId,
          patientId,
          status: AppointmentStatus.CONFIRMED,
          ...(dateFilter ? { startsAt: dateFilter } : {}),
        },
      }),
      this.prisma.appointment.count({
        where: {
          clinicId,
          patientId,
          status: AppointmentStatus.COMPLETED,
          ...(dateFilter ? { startsAt: dateFilter } : {}),
        },
      }),
      this.prisma.appointment.count({
        where: {
          clinicId,
          patientId,
          status: AppointmentStatus.NO_SHOW,
          ...(dateFilter ? { startsAt: dateFilter } : {}),
        },
      }),
      this.prisma.appointmentRequest.count({
        where: {
          clinicId,
          patientId,
          status: { in: [AppointmentRequestStatus.REJECTED, AppointmentRequestStatus.CANCELLED] },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      this.prisma.appointment.count({
        where: {
          clinicId,
          patientId,
          status: AppointmentStatus.CANCELLED,
          ...(dateFilter ? { startsAt: dateFilter } : {}),
        },
      }),
    ]);

    const bp: BloodPressureTrendPoint[] = [
      ...encounters.flatMap((encounter) => {
        if (encounter.vitals?.systolicBp == null || encounter.vitals.diastolicBp == null) {
          return [];
        }

        return [
          {
            t: encounter.createdAt.toISOString(),
            sys: encounter.vitals.systolicBp,
            dia: encounter.vitals.diastolicBp,
            source: 'ENCOUNTER' as const,
          },
        ];
      }),
      ...measurements.flatMap((measurement) => {
        if (measurement.type !== 'BP') {
          return [];
        }

        const payload = this.parsePayloadJson(measurement.payloadJson);
        const sys = this.readOptionalNumber(payload.systolic);
        const dia = this.readOptionalNumber(payload.diastolic);
        if (sys == null || dia == null) {
          return [];
        }

        return [
          {
            t: measurement.recordedAt.toISOString(),
            sys,
            dia,
            source: 'PATIENT' as const,
          },
        ];
      }),
    ].sort((left, right) => new Date(left.t).getTime() - new Date(right.t).getTime());

    const glucose: GlucoseTrendPoint[] = [
      ...diabetesScreenings.flatMap((screening) => {
        if (screening.glucoseMgDl == null) {
          return [];
        }

        return [
          {
            t: screening.collectedAt.toISOString(),
            value: screening.glucoseMgDl,
            type: this.normalizeTrendGlucoseType(screening.glucoseType),
            source: 'ENCOUNTER' as const,
          },
        ];
      }),
      ...measurements.flatMap((measurement) => {
        if (measurement.type !== 'GLUCOSE') {
          return [];
        }

        const payload = this.parsePayloadJson(measurement.payloadJson);
        const value = this.readOptionalNumber(payload.value);
        if (value == null) {
          return [];
        }

        return [
          {
            t: measurement.recordedAt.toISOString(),
            value,
            type: this.normalizeTrendGlucoseType(payload.glucoseType),
            source: 'PATIENT' as const,
          },
        ];
      }),
    ].sort((left, right) => new Date(left.t).getTime() - new Date(right.t).getTime());

    const expandedMeasurements: ExpandedVitalsTrendPoint[] = includeExpandedVitals
      ? encounters.flatMap((encounter) => {
          const vitals = encounter.vitals;
          if (
            !vitals ||
            [
              vitals.temperatureCelsius,
              vitals.respiratoryRate,
              vitals.spo2Percent,
              vitals.weightKg,
              vitals.bmi,
            ].every((value) => value == null)
          ) {
            return [];
          }
          return [
            {
              t: encounter.createdAt.toISOString(),
              temperatureCelsius: vitals.temperatureCelsius,
              respiratoryRate: vitals.respiratoryRate,
              spo2Percent: vitals.spo2Percent,
              weightKg: vitals.weightKg,
              bmi: vitals.bmi,
              source: 'ENCOUNTER' as const,
            },
          ];
        })
      : [];

    return {
      bp,
      glucose,
      ...(includeExpandedVitals ? { measurements: expandedMeasurements } : {}),
      followUp: {
        requested,
        confirmed,
        completed,
        noShow,
        closed: closedRequests + closedAppointments,
      },
    };
  }

  private async createMeasurement(params: {
    patient: PortalPatientSummary;
    clinicId: string;
    actorUserId: string;
    source: PatientMeasurementSource;
    dto: CreatePatientMeasurementDto;
    requestId?: string;
    allowUnknownGlucoseType: boolean;
  }) {
    const recordedAt = params.dto.recordedAt
      ? this.parseDateTime(params.dto.recordedAt, 'recordedAt')
      : new Date();

    const normalized = this.normalizeMeasurementPayload(
      params.dto.type,
      params.dto.payload,
      params.allowUnknownGlucoseType,
    );

    const created = await this.prisma.patientMeasurement.create({
      data: {
        patientId: params.patient.id,
        clinicId: params.patient.primaryClinicId,
        recordedAt,
        source: params.source,
        type: params.dto.type,
        payloadJson: JSON.stringify(normalized),
        notes: params.dto.notes?.trim() || null,
        linkedEncounterId: null,
      },
    });

    await this.auditService.logWrite({
      clinicId: params.clinicId,
      actorUserId: params.actorUserId,
      action: 'MEASUREMENT.CREATE',
      entityType: 'PatientMeasurement',
      entityId: created.id,
      afterJson: JSON.stringify(created),
      requestId: params.requestId,
    });

    return this.serializeMeasurement(created);
  }

  private normalizeMeasurementPayload(
    type: PatientMeasurementType,
    payload: Record<string, unknown>,
    allowUnknownGlucoseType: boolean,
  ): ParsedMeasurementPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('payload must be an object');
    }

    if (type === 'BP') {
      const systolic = this.readNumber(payload.systolic, 'payload.systolic');
      const diastolic = this.readNumber(payload.diastolic, 'payload.diastolic');
      const pulse = payload.pulse == null ? null : this.readNumber(payload.pulse, 'payload.pulse');
      this.assertRange(systolic, 50, 300, 'payload.systolic');
      this.assertRange(diastolic, 30, 200, 'payload.diastolic');
      if (pulse != null) {
        this.assertRange(pulse, 20, 250, 'payload.pulse');
      }
      return {
        systolic,
        diastolic,
        ...(pulse != null ? { pulse } : {}),
      };
    }

    if (type === 'GLUCOSE') {
      const value = this.readNumber(payload.value, 'payload.value');
      this.assertRange(value, 20, 600, 'payload.value');
      const glucoseTypeRaw = payload.glucoseType;
      const glucoseType =
        typeof glucoseTypeRaw === 'string' ? glucoseTypeRaw.trim().toUpperCase() : '';
      const allowedTypes = allowUnknownGlucoseType
        ? ['FASTING', 'RANDOM', 'UNKNOWN']
        : ['FASTING', 'RANDOM'];
      if (!allowedTypes.includes(glucoseType)) {
        throw new BadRequestException(
          `payload.glucoseType must be one of: ${allowedTypes.join(', ')}`,
        );
      }
      return {
        value,
        glucoseType,
      };
    }

    if (type === 'WEIGHT') {
      const kg = this.readNumber(payload.kg, 'payload.kg');
      this.assertRange(kg, 1, 500, 'payload.kg');
      return { kg };
    }

    throw new BadRequestException(`Unsupported measurement type: ${type}`);
  }

  private buildAppointmentRequestWhere(
    clinicId: string,
    query: ListAppointmentRequestsQueryDto,
    patientId?: string,
  ): Prisma.AppointmentRequestWhereInput {
    const from = query.from ? this.parseDateOnly(query.from, 'from') : null;
    const to = query.to ? this.parseDateOnly(query.to, 'to') : null;

    return {
      clinicId,
      ...(patientId ? { patientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(from ? { preferredEndDate: { gte: from } } : {}),
      ...(to ? { preferredStartDate: { lte: to } } : {}),
    };
  }

  private resolveAppointmentRange(query: Pick<ListAppointmentsQueryDto, 'from' | 'to'>) {
    const today = new Date().toISOString().slice(0, 10);
    const from = query.from ?? query.to ?? today;
    const to = query.to ?? query.from ?? today;
    const start = this.parseDateOnly(from, 'from');
    const end = this.parseFlexibleDate(to, 'to', true);

    if (end < start) {
      throw new BadRequestException('to must be on or after from');
    }

    return {
      from,
      to,
      start,
      end,
    };
  }

  private buildAppointmentWhere(
    clinicId: string,
    query: ListAppointmentsQueryDto,
    range: AppointmentRange,
    patientId?: string,
  ): Prisma.AppointmentWhereInput {
    const patientSearch = query.patientSearch?.trim();

    return {
      clinicId,
      ...(patientId ? { patientId } : {}),
      startsAt: { lte: range.end },
      endsAt: { gte: range.start },
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedDoctorId ? { assignedDoctorId: query.assignedDoctorId } : {}),
      ...(query.assignedVolunteerId ? { assignedVolunteerId: query.assignedVolunteerId } : {}),
      ...(patientSearch
        ? {
            patient: {
              OR: [
                { patientCode: { contains: patientSearch, mode: 'insensitive' } },
                { firstName: { contains: patientSearch, mode: 'insensitive' } },
                { lastName: { contains: patientSearch, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
  }

  private async resolvePatientChangeRequestAppointment(
    clinicId: string,
    userId: string,
    appointmentId: string,
    action: 'cancel' | 'reschedule',
  ) {
    const patient = await this.resolvePortalPatient(clinicId, userId);
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId,
        patientId: patient.id,
      },
      include: appointmentScheduleInclude,
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'APPOINTMENT_CHANGE_REQUEST_NOT_ALLOWED',
        message: `Only confirmed appointments can receive patient ${action} requests.`,
        appointmentId,
        currentStatus: appointment.status,
        attemptedAction: action,
        recoveryAction: 'Refresh appointments and choose an upcoming confirmed appointment.',
      });
    }
    if (appointment.startsAt <= new Date()) {
      throw new BadRequestException({
        code: 'APPOINTMENT_CHANGE_REQUEST_TOO_LATE',
        message: `Patient ${action} requests are only available for future appointments.`,
        appointmentId,
        startsAt: appointment.startsAt.toISOString(),
        attemptedAction: action,
        recoveryAction: 'Contact the clinic if this appointment already started or passed.',
      });
    }

    return { patient, appointment };
  }

  private async mutateConfirmedAppointment(params: {
    clinicId: string;
    appointmentId: string;
    action: AppointmentLifecycleAction;
    data: Prisma.AppointmentUncheckedUpdateManyInput;
    requireStarted?: boolean;
  }) {
    const before = await this.prisma.appointment.findFirst({
      where: { id: params.appointmentId, clinicId: params.clinicId },
      include: appointmentScheduleInclude,
    });
    if (!before) {
      throw new NotFoundException('Appointment not found');
    }

    if (before.status !== 'CONFIRMED') {
      throw this.invalidAppointmentTransition(before.status, params.action);
    }

    if (params.requireStarted && before.startsAt > new Date()) {
      throw new BadRequestException({
        code: 'APPOINTMENT_ACTION_TOO_EARLY',
        message: 'Appointment action is only available after the appointment start time.',
        attemptedAction: params.action,
        appointmentId: params.appointmentId,
        clinicId: params.clinicId,
        startsAt: before.startsAt.toISOString(),
        recoveryAction: 'Wait until the appointment has started, then try again.',
      });
    }

    const after = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: {
          id: params.appointmentId,
          clinicId: params.clinicId,
          status: 'CONFIRMED',
        },
        data: params.data,
      });

      if (result.count !== 1) {
        throw this.invalidAppointmentTransition(before.status, params.action);
      }

      const updated = await tx.appointment.findFirst({
        where: { id: params.appointmentId, clinicId: params.clinicId },
        include: appointmentScheduleInclude,
      });
      if (!updated) {
        throw new NotFoundException('Appointment not found');
      }

      return updated;
    });

    return { before, after };
  }

  private invalidAppointmentTransition(
    currentStatus: AppointmentStatus,
    attemptedAction: AppointmentLifecycleAction,
  ) {
    return new BadRequestException({
      code: 'APPOINTMENT_INVALID_TRANSITION',
      message: `Cannot ${attemptedAction} an appointment with status ${currentStatus}.`,
      currentStatus,
      attemptedAction,
      allowedSourceStatuses: ['CONFIRMED'],
      recoveryAction:
        'Refresh the appointment schedule and choose an eligible confirmed appointment.',
    });
  }

  private async auditAppointmentLifecycle(params: {
    clinicId: string;
    actorUserId: string;
    action: 'APPT.RESCHEDULE' | 'APPT.CANCEL' | 'APPT.COMPLETE' | 'APPT.NO_SHOW';
    before: AppointmentScheduleWithRelations;
    after: AppointmentScheduleWithRelations;
    requestId?: string;
    metadata: Record<string, unknown>;
  }) {
    const baseContext = {
      actorUserId: params.actorUserId,
      clinicId: params.clinicId,
      appointmentId: params.after.id,
      patientId: params.after.patientId,
      ...params.metadata,
    };

    await this.auditService.logWrite({
      clinicId: params.clinicId,
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: 'Appointment',
      entityId: params.after.id,
      beforeJson: JSON.stringify({
        ...baseContext,
        appointment: this.serializeAuditAppointment(params.before),
      }),
      afterJson: JSON.stringify({
        ...baseContext,
        appointment: this.serializeAuditAppointment(params.after),
      }),
      requestId: params.requestId,
    });
  }

  private serializeAuditAppointment(appointment: AppointmentScheduleWithRelations) {
    return {
      id: appointment.id,
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      linkedRequestId: appointment.linkedRequestId,
      assignedDoctorId: appointment.assignedDoctorId,
      assignedVolunteerId: appointment.assignedVolunteerId,
      notes: appointment.notes,
      updatedAt: appointment.updatedAt.toISOString(),
    };
  }

  private async scheduleAppointmentReminder(
    patient: {
      id: string;
      patientCode: string;
      phoneE164: string | null;
      email: string | null;
    },
    appointment: {
      id: string;
      clinicId: string;
      startsAt: Date;
    },
    actorUserId: string,
    requestId?: string,
  ) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: appointment.clinicId },
      select: { name: true, timezone: true },
    });

    if (patient.phoneE164) {
      await this.reminderService.scheduleAppointmentReminder({
        clinicId: appointment.clinicId,
        clinicName: clinic?.name ?? 'Clinic',
        clinicTimezone: clinic?.timezone,
        patientId: patient.id,
        patientCode: patient.patientCode,
        phoneE164: patient.phoneE164,
        appointmentId: appointment.id,
        startsAt: appointment.startsAt,
        actorUserId,
        requestId,
      });
    } else if (!patient.phoneE164 && !patient.email) {
      await this.reminderService.scheduleAppointmentReminderNoContact({
        clinicId: appointment.clinicId,
        patientId: patient.id,
        patientCode: patient.patientCode,
        appointmentId: appointment.id,
        startsAt: appointment.startsAt,
        actorUserId,
        requestId,
      });
    }

    if (patient.email) {
      await this.reminderService.scheduleAppointmentEmailReminder({
        clinicId: appointment.clinicId,
        clinicName: clinic?.name ?? 'Clinic',
        clinicTimezone: clinic?.timezone,
        patientId: patient.id,
        patientCode: patient.patientCode,
        email: patient.email,
        appointmentId: appointment.id,
        startsAt: appointment.startsAt,
        actorUserId,
        requestId,
      });
    }
  }

  private async assertAppointmentAssignee(
    clinicId: string,
    userId: string,
    role: 'DOCTOR' | 'VOLUNTEER',
  ) {
    const [user, membership] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, isActive: true },
        select: { id: true },
      }),
      this.prisma.userClinicRole.findFirst({
        where: { userId, clinicId, role },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw new BadRequestException(
        'Assigned appointment staff member does not exist or is inactive',
      );
    }
    if (!membership) {
      throw new BadRequestException(
        `Assigned appointment user is not a ${role.toLowerCase()} in this clinic`,
      );
    }
  }

  private async listCompatibilitySelfReports(patientId: string, clinicId: string) {
    const [measurements, legacyReports] = await Promise.all([
      this.prisma.patientMeasurement.findMany({
        where: { patientId, clinicId },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.patientSelfReport.findMany({
        where: {
          patientId,
          clinicId,
          type: {
            notIn: ['HOME_BP', 'HOME_GLUCOSE'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const combined = [
      ...measurements.map((item) =>
        this.serializeLegacySelfReportFromMeasurement(this.serializeMeasurement(item)),
      ),
      ...legacyReports.map((item) => this.serializeLegacySelfReport(item)),
    ];

    combined.sort((a, b) => {
      const aTime = new Date(a.recordedAt).getTime();
      const bTime = new Date(b.recordedAt).getTime();
      return bTime - aTime;
    });

    return combined.slice(0, 50);
  }

  private translateLegacySelfReportToMeasurement(
    dto: CreateSelfReportDto,
  ): CreatePatientMeasurementDto {
    if (dto.type === 'HOME_BP') {
      return {
        type: 'BP',
        recordedAt: dto.recordedAt,
        notes: dto.notes,
        payload: {
          systolic: dto.systolicBp,
          diastolic: dto.diastolicBp,
        },
      };
    }

    return {
      type: 'GLUCOSE',
      recordedAt: dto.recordedAt,
      notes: dto.notes,
      payload: {
        value: dto.glucoseMgDl,
        glucoseType: dto.glucoseType ?? 'UNKNOWN',
      },
    };
  }

  private serializeMeasurement(measurement: {
    id: string;
    patientId: string;
    clinicId: string;
    recordedAt: Date;
    source: PatientMeasurementSource;
    type: PatientMeasurementType;
    payloadJson: string;
    notes: string | null;
    linkedEncounterId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: measurement.id,
      patientId: measurement.patientId,
      clinicId: measurement.clinicId,
      recordedAt: measurement.recordedAt.toISOString(),
      source: measurement.source,
      type: measurement.type,
      payload: this.parsePayloadJson(measurement.payloadJson),
      notes: measurement.notes,
      linkedEncounterId: measurement.linkedEncounterId,
      createdAt: measurement.createdAt.toISOString(),
      updatedAt: measurement.updatedAt.toISOString(),
    };
  }

  private serializePortalInvite(invite: {
    id: string;
    patientId: string;
    clinicId: string;
    status: string;
    email: string | null;
    phoneE164: string | null;
    claimedByUserId?: string | null;
    claimedAt?: Date | null;
    cancelledAt?: Date | null;
    expiresAt?: Date | null;
    createdAt: Date;
    updatedAt?: Date;
  }) {
    return {
      id: invite.id,
      patientId: invite.patientId,
      clinicId: invite.clinicId,
      status: invite.status,
      email: invite.email,
      phoneE164: invite.phoneE164,
      claimedByUserId: invite.claimedByUserId ?? null,
      claimedAt: invite.claimedAt?.toISOString() ?? null,
      cancelledAt: invite.cancelledAt?.toISOString() ?? null,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      updatedAt: invite.updatedAt?.toISOString() ?? null,
    };
  }

  private serializeAppointmentRequest(
    request: AppointmentRequestWithRelations,
    includePatient = false,
  ) {
    return {
      id: request.id,
      clinicId: request.clinicId,
      patientId: request.patientId,
      ...(includePatient
        ? {
            patient: {
              id: request.patient.id,
              patientCode: request.patient.patientCode,
              firstName: request.patient.firstName,
              lastName: request.patient.lastName,
            },
          }
        : {}),
      requestType: request.requestType,
      sourceAppointmentId: request.sourceAppointmentId ?? null,
      preferredStartDate: request.preferredStartDate.toISOString().slice(0, 10),
      preferredEndDate: request.preferredEndDate.toISOString().slice(0, 10),
      reason: request.reason,
      notes: request.notes,
      status: request.status,
      triagedAt: request.triagedAt?.toISOString() ?? null,
      triagedBy: request.triagedBy
        ? { id: request.triagedBy.id, displayName: request.triagedBy.displayName }
        : null,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      appointment: request.appointment ? this.serializeAppointment(request.appointment) : null,
      sourceAppointment: request.sourceAppointment
        ? this.serializeAppointment(request.sourceAppointment)
        : null,
    };
  }

  private serializeAppointment(appointment: {
    id: string;
    clinicId: string;
    patientId: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    linkedRequestId: string | null;
    assignedDoctorId?: string | null;
    assignedVolunteerId?: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    assignedDoctor?: { id: string; displayName: string } | null;
    assignedVolunteer?: { id: string; displayName: string } | null;
  }) {
    return {
      id: appointment.id,
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      linkedRequestId: appointment.linkedRequestId ?? null,
      assignedDoctor: appointment.assignedDoctor
        ? {
            id: appointment.assignedDoctor.id,
            displayName: appointment.assignedDoctor.displayName,
          }
        : appointment.assignedDoctorId
          ? { id: appointment.assignedDoctorId, displayName: null }
          : null,
      assignedVolunteer: appointment.assignedVolunteer
        ? {
            id: appointment.assignedVolunteer.id,
            displayName: appointment.assignedVolunteer.displayName,
          }
        : appointment.assignedVolunteerId
          ? { id: appointment.assignedVolunteerId, displayName: null }
          : null,
      notes: appointment.notes,
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
    };
  }

  private serializeScheduledAppointment(appointment: AppointmentScheduleWithRelations) {
    return {
      id: appointment.id,
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      linkedRequestId: appointment.linkedRequestId ?? null,
      patient: {
        id: appointment.patient.id,
        patientCode: appointment.patient.patientCode,
        firstName: appointment.patient.firstName,
        lastName: appointment.patient.lastName,
        displayName: `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim(),
      },
      assignedDoctor: appointment.assignedDoctor
        ? {
            id: appointment.assignedDoctor.id,
            displayName: appointment.assignedDoctor.displayName,
          }
        : appointment.assignedDoctorId
          ? { id: appointment.assignedDoctorId, displayName: null }
          : null,
      assignedVolunteer: appointment.assignedVolunteer
        ? {
            id: appointment.assignedVolunteer.id,
            displayName: appointment.assignedVolunteer.displayName,
          }
        : appointment.assignedVolunteerId
          ? { id: appointment.assignedVolunteerId, displayName: null }
          : null,
      notes: appointment.notes,
      reminderSummary: this.summarizeAppointmentReminders(appointment.reminders ?? []),
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
    };
  }

  private summarizeAppointmentReminders(
    allRows: Array<{
      status: string;
      channel: string;
      templateKey: string;
      scheduledAt: Date;
      failureReason: string | null;
      updatedAt: Date;
    }>,
  ): AppointmentReminderSummary {
    // Only the 24-hour reminder counts here. Confirmation and cancellation mail is
    // linked to the same appointment, and counting it would tell an operator that an
    // appointment had three delivered reminders when it had one.
    const reminders = allRows.filter(
      (row) => row.templateKey === APPOINTMENT_REMINDER_TEMPLATE_KEY,
    );
    const summary: AppointmentReminderSummary = {
      total: reminders.length,
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      nextQueuedAt: null,
      channels: [],
      latestFailureReason: null,
    };
    const channels = new Set<string>();
    let nextQueuedAt: Date | null = null;
    let latestFailedAt: Date | null = null;

    for (const reminder of reminders) {
      channels.add(reminder.channel);
      switch (reminder.status) {
        case 'QUEUED':
          summary.queued += 1;
          if (!nextQueuedAt || reminder.scheduledAt < nextQueuedAt) {
            nextQueuedAt = reminder.scheduledAt;
          }
          break;
        case 'SENT':
          summary.sent += 1;
          break;
        case 'DELIVERED':
          summary.delivered += 1;
          break;
        case 'FAILED':
          summary.failed += 1;
          if (
            reminder.failureReason &&
            (!latestFailedAt || reminder.updatedAt.getTime() > latestFailedAt.getTime())
          ) {
            latestFailedAt = reminder.updatedAt;
            summary.latestFailureReason = reminder.failureReason;
          }
          break;
      }
    }

    summary.channels = [...channels].sort();
    summary.nextQueuedAt = nextQueuedAt?.toISOString() ?? null;
    return summary;
  }

  private summarizeAppointments(appointments: Array<{ status: AppointmentStatus }>) {
    return appointments.reduce(
      (summary, appointment) => {
        summary.total += 1;
        switch (appointment.status) {
          case 'CONFIRMED':
            summary.confirmed += 1;
            break;
          case 'CANCELLED':
            summary.cancelled += 1;
            break;
          case 'COMPLETED':
            summary.completed += 1;
            break;
          case 'NO_SHOW':
            summary.noShow += 1;
            break;
        }
        return summary;
      },
      {
        total: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        noShow: 0,
      },
    );
  }

  private serializeLegacySelfReport(report: {
    id: string;
    type: PatientSelfReportType;
    systolicBp?: number | null;
    diastolicBp?: number | null;
    glucoseMgDl?: number | null;
    glucoseType?: string | null;
    symptomsJson?: string | null;
    notes?: string | null;
    recordedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: report.id,
      type: report.type,
      systolicBp: report.systolicBp ?? null,
      diastolicBp: report.diastolicBp ?? null,
      glucoseMgDl: report.glucoseMgDl ?? null,
      glucoseType: report.glucoseType ?? null,
      symptomsJson: report.symptomsJson ?? null,
      notes: report.notes ?? null,
      recordedAt: report.recordedAt.toISOString(),
      createdAt: report.createdAt.toISOString(),
    };
  }

  private serializeLegacySelfReportFromMeasurement(
    measurement: ReturnType<PatientPortalService['serializeMeasurement']>,
  ) {
    const payload = measurement.payload as Record<string, unknown>;
    if (measurement.type === 'BP') {
      return {
        id: measurement.id,
        type: 'HOME_BP',
        systolicBp: this.readOptionalNumber(payload.systolic),
        diastolicBp: this.readOptionalNumber(payload.diastolic),
        glucoseMgDl: null,
        glucoseType: null,
        weightKg: null,
        notes: measurement.notes,
        recordedAt: measurement.recordedAt,
        createdAt: measurement.createdAt,
      };
    }

    if (measurement.type === 'GLUCOSE') {
      return {
        id: measurement.id,
        type: 'HOME_GLUCOSE',
        systolicBp: null,
        diastolicBp: null,
        glucoseMgDl: this.readOptionalNumber(payload.value),
        glucoseType: typeof payload.glucoseType === 'string' ? payload.glucoseType : null,
        weightKg: null,
        notes: measurement.notes,
        recordedAt: measurement.recordedAt,
        createdAt: measurement.createdAt,
      };
    }

    return {
      id: measurement.id,
      type: 'WEIGHT',
      systolicBp: null,
      diastolicBp: null,
      glucoseMgDl: null,
      glucoseType: null,
      weightKg: this.readOptionalNumber(payload.kg),
      notes: measurement.notes,
      recordedAt: measurement.recordedAt,
      createdAt: measurement.createdAt,
    };
  }

  private buildRecordedAtFilter(from?: string, to?: string) {
    const gte = from ? this.parseFlexibleDate(from, 'from') : null;
    const lte = to ? this.parseFlexibleDate(to, 'to', true) : null;
    if (!gte && !lte) {
      return undefined;
    }
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  private parseFlexibleDate(value: string, fieldName: string, endOfDay = false) {
    if (DATE_ONLY_RE.test(value)) {
      const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
      return new Date(`${value}${suffix}`);
    }
    return this.parseDateTime(value, fieldName);
  }

  private parseDateOnly(value: string, fieldName: string) {
    if (!DATE_ONLY_RE.test(value)) {
      throw new BadRequestException(`${fieldName} must be YYYY-MM-DD`);
    }
    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDateOnly(value: Date) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  private parseDateTime(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }
    return parsed;
  }

  private parsePayloadJson(payloadJson: string): ParsedMeasurementPayload {
    try {
      const parsed = JSON.parse(payloadJson) as ParsedMeasurementPayload;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private readNumber(value: unknown, fieldName: string) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : NaN;
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`${fieldName} must be a number`);
    }
    return parsed;
  }

  private readOptionalNumber(value: unknown) {
    if (value == null) {
      return null;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeTrendGlucoseType(value: unknown): 'FASTING' | 'RANDOM' | 'UNKNOWN' {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (normalized === 'FASTING' || normalized === 'RANDOM') {
      return normalized;
    }
    return 'UNKNOWN';
  }

  private assertRange(value: number, min: number, max: number, fieldName: string) {
    if (value < min || value > max) {
      throw new BadRequestException(`${fieldName} must be between ${min} and ${max}`);
    }
  }
}
