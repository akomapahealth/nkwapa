import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentRequestStatus,
  AppointmentStatus,
  EncounterStatus,
  PatientMeasurementSource,
  PatientMeasurementType,
  PatientSelfReportType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import type { CreateSelfReportDto } from './dto/create-self-report.dto';
import type {
  CreatePatientMeasurementDto,
  ListPatientMeasurementsQueryDto,
} from './dto/patient-measurements.dto';
import type { ListPatientTrendsQueryDto } from './dto/patient-trends.dto';
import type {
  ConfirmAppointmentRequestDto,
  CreateAppointmentRequestDto,
  ListAppointmentRequestsQueryDto,
  RejectAppointmentRequestDto,
} from './dto/appointment-requests.dto';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
} satisfies Prisma.AppointmentRequestInclude;

type AppointmentRequestWithRelations = Prisma.AppointmentRequestGetPayload<{
  include: typeof appointmentRequestInclude;
}>;

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

interface FollowUpSummary {
  requested: number;
  confirmed: number;
  completed: number;
  noShow: number;
  closed: number;
}

export interface PatientTrendsResponse {
  bp: BloodPressureTrendPoint[];
  glucose: GlucoseTrendPoint[];
  followUp: FollowUpSummary;
}

@Injectable()
export class PatientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reminderService: ReminderService,
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
      where: { patientId: patient.id, clinicId },
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
    return this.listTrends(patient.id, clinicId, query, ['FINALIZED']);
  }

  async listTrendsForStaff(patientId: string, clinicId: string, query: ListPatientTrendsQueryDto) {
    await this.assertPatientInClinic(patientId, clinicId);
    return this.listTrends(patientId, clinicId, query, ['DRAFT', 'IN_REVIEW', 'FINALIZED']);
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

  async listAppointmentRequestsForClinic(clinicId: string, query: ListAppointmentRequestsQueryDto) {
    const where = this.buildAppointmentRequestWhere(clinicId, query);
    const items = await this.prisma.appointmentRequest.findMany({
      where,
      include: appointmentRequestInclude,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeAppointmentRequest(item, true));
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
  ): Promise<PatientTrendsResponse> {
    const dateFilter = this.buildRecordedAtFilter(query.from, query.to);

    const [
      measurements,
      encounters,
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
            },
          },
          diabetesScreening: {
            select: {
              glucoseMgDl: true,
              glucoseType: true,
            },
          },
        },
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
      ...encounters.flatMap((encounter) => {
        if (encounter.diabetesScreening?.glucoseMgDl == null) {
          return [];
        }

        return [
          {
            t: encounter.createdAt.toISOString(),
            value: encounter.diabetesScreening.glucoseMgDl,
            type: this.normalizeTrendGlucoseType(encounter.diabetesScreening.glucoseType),
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

    return {
      bp,
      glucose,
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
      select: { name: true },
    });

    if (patient.phoneE164) {
      await this.reminderService.scheduleAppointmentReminder({
        clinicId: appointment.clinicId,
        clinicName: clinic?.name ?? 'Clinic',
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
