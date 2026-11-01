import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PatientDataRequestStatus, type Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatientPortalService } from './patient-portal.service';
import type {
  CreatePatientDataRequestDto,
  ListPatientDataRequestsQueryDto,
  RespondPatientDataRequestDto,
} from './dto/patient-data-requests.dto';

/** The response deadline the privacy notice commits to. */
export const DATA_REQUEST_RESPONSE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const OPEN_STATUSES: PatientDataRequestStatus[] = [
  PatientDataRequestStatus.RECEIVED,
  PatientDataRequestStatus.IN_PROGRESS,
];
const isOpen = (status: PatientDataRequestStatus) => OPEN_STATUSES.includes(status);

const STAFF_INCLUDE = {
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
  respondedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.PatientDataRequestInclude;

/**
 * Patients' requests about their own information: access, correction, deletion, restriction.
 *
 * Nkwapa records the request and the answer; it does not act on the record by itself. Most of a
 * medical record must be kept by law, so whether something can be deleted is a person's decision,
 * and a decline has to say why.
 */
@Injectable()
export class PatientDataRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly portal: PatientPortalService,
  ) {}

  async createForPatient(
    clinicId: string,
    userId: string,
    dto: CreatePatientDataRequestDto,
    requestId?: string,
  ) {
    const patient = await this.portal.resolvePortalPatient(clinicId, userId);
    // One open request of a kind at a time: a second identical one only adds work, not speed.
    const open = await this.prisma.patientDataRequest.findFirst({
      where: { clinicId, patientId: patient.id, type: dto.type, status: { in: OPEN_STATUSES } },
      select: { id: true },
    });
    if (open) {
      throw new ConflictException({
        code: 'DATA_REQUEST_ALREADY_OPEN',
        message: 'You already have an open request of this kind. The clinic will answer it.',
      });
    }

    const now = new Date();
    const created = await this.prisma.patientDataRequest.create({
      data: {
        clinicId,
        patientId: patient.id,
        requestedByUserId: userId,
        type: dto.type,
        details: dto.details?.trim() || null,
        dueAt: new Date(now.getTime() + DATA_REQUEST_RESPONSE_DAYS * DAY_MS),
      },
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId: userId,
      action: 'PATIENT.DATA_REQUEST.CREATE',
      entityType: 'PatientDataRequest',
      entityId: created.id,
      // The type and deadline only: the patient's own words stay on the request.
      afterJson: JSON.stringify({ type: created.type, dueAt: created.dueAt }),
      requestId,
    });
    return this.forPatient(created);
  }

  async listForPatient(clinicId: string, userId: string) {
    const patient = await this.portal.resolvePortalPatient(clinicId, userId);
    const rows = await this.prisma.patientDataRequest.findMany({
      where: { clinicId, patientId: patient.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.forPatient(row));
  }

  /** Open requests first, soonest due first, then the answered ones. */
  async listForClinic(clinicId: string, query: ListPatientDataRequestsQueryDto) {
    const rows = await this.prisma.patientDataRequest.findMany({
      where: { clinicId, ...(query.status ? { status: query.status } : {}) },
      include: STAFF_INCLUDE,
      orderBy: [{ dueAt: 'asc' }],
      take: 200,
    });
    return rows.sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)));
  }

  async respond(
    clinicId: string,
    requestIdParam: string,
    actorUserId: string,
    dto: RespondPatientDataRequestDto,
    requestId?: string,
  ) {
    const existing = await this.prisma.patientDataRequest.findFirst({
      where: { id: requestIdParam, clinicId },
    });
    if (!existing) throw new NotFoundException('Data request not found');
    if (!isOpen(existing.status)) {
      throw new ConflictException('This request has already been answered');
    }
    const note = dto.responseNote?.trim() || null;
    const closing = dto.status !== PatientDataRequestStatus.IN_PROGRESS;
    if (closing && !note) {
      // The patient sees this note; a decline without a reason is not an answer.
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Tell the patient what was done, or why it cannot be done.',
        fieldErrors: [{ field: 'responseNote', message: 'A response to the patient is required.' }],
      });
    }

    const updated = await this.prisma.patientDataRequest.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        responseNote: note ?? existing.responseNote,
        ...(closing ? { respondedByUserId: actorUserId, respondedAt: new Date() } : {}),
      },
      include: STAFF_INCLUDE,
    });
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'PATIENT.DATA_REQUEST.RESPOND',
      entityType: 'PatientDataRequest',
      entityId: existing.id,
      beforeJson: JSON.stringify({ status: existing.status }),
      afterJson: JSON.stringify({ status: updated.status }),
      requestId,
    });
    return updated;
  }

  /** What the patient sees: their request and the clinic's answer, not who on staff wrote it. */
  private forPatient(row: {
    id: string;
    type: string;
    details: string | null;
    status: string;
    dueAt: Date;
    responseNote: string | null;
    respondedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      type: row.type,
      details: row.details,
      status: row.status,
      dueAt: row.dueAt,
      responseNote: row.responseNote,
      respondedAt: row.respondedAt,
      createdAt: row.createdAt,
    };
  }
}
