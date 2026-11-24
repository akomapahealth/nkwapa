import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DoctorRequestReason, DoctorRequestUrgency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PushService } from '../push/push.service';

const OPEN_CHECK_IN = ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] as const;

const REASON_WORDS: Record<DoctorRequestReason, string> = {
  HIGH_BP: 'high BP',
  HIGH_GLUCOSE: 'high glucose',
  SYMPTOMS: 'symptoms',
  MEDICATION: 'medication question',
  OTHER: 'other',
};

export interface DoctorRequestInput {
  urgency: DoctorRequestUrgency;
  reason?: DoctorRequestReason | null;
  auto?: boolean;
}

/** Who took the request and when, as every screen shows it. */
export interface DoctorRequestView {
  id: string;
  urgency: DoctorRequestUrgency;
  reason: DoctorRequestReason | null;
  auto: boolean;
  stationVisitId: string | null;
  claimedBy: { id: string; displayName: string } | null;
  claimedAt: string | null;
  open: boolean;
}

export const DOCTOR_REQUEST_VIEW_SELECT = {
  id: true,
  urgency: true,
  reason: true,
  auto: true,
  stationVisitId: true,
  claimedAt: true,
  resolvedAt: true,
  claimedBy: { select: { id: true, displayName: true } },
  checkIn: { select: { status: true } },
} satisfies Prisma.DoctorRequestSelect;

type ViewRow = Prisma.DoctorRequestGetPayload<{ select: typeof DOCTOR_REQUEST_VIEW_SELECT }>;

export function toDoctorRequestView(row: ViewRow): DoctorRequestView {
  return {
    id: row.id,
    urgency: row.urgency,
    reason: row.reason,
    auto: row.auto,
    stationVisitId: row.stationVisitId,
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    open: !row.resolvedAt && (OPEN_CHECK_IN as readonly string[]).includes(row.checkIn.status),
  };
}

/** "Doctor needed now at Blood pressure (No. 14, high BP)". Never the patient's name (#250). */
export function doctorRequestMessage(input: {
  urgency: DoctorRequestUrgency;
  reason: DoctorRequestReason | null;
  stationName: string;
  dayNumber: number | null;
}) {
  const details = [
    input.dayNumber != null ? `No. ${input.dayNumber}` : null,
    input.reason ? REASON_WORDS[input.reason] : null,
  ].filter(Boolean);
  const when = input.urgency === 'NOW' ? 'now' : 'before they leave';
  return {
    title: `Doctor needed ${when}`,
    body: `At ${input.stationName}${details.length ? ` (${details.join(', ')})` : ''}`,
  };
}

/**
 * "Ask a doctor" from a station (#418).
 *
 * One open request per check-in; asking again raises its urgency rather than adding another.
 * A request counts as open while it is unresolved and its check-in is open, so the patient
 * leaving the line any way (review, Patient left, End clinic day) closes it without a write here.
 */
@Injectable()
export class DoctorRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly push?: PushService,
  ) {}

  async request(
    clinicId: string,
    visitId: string,
    actorUserId: string | null,
    input: DoctorRequestInput,
    requestId?: string,
  ): Promise<DoctorRequestView> {
    try {
      return await this.requestOnce(clinicId, visitId, actorUserId, input, requestId);
    } catch (error) {
      // Two stations asked at once: the open-request index refused the second, which now updates.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.requestOnce(clinicId, visitId, actorUserId, input, requestId);
      }
      throw error;
    }
  }

  private async requestOnce(
    clinicId: string,
    visitId: string,
    actorUserId: string | null,
    input: DoctorRequestInput,
    requestId?: string,
  ): Promise<DoctorRequestView> {
    const { row, notify, visit } = await this.prisma.$transaction(async (tx) => {
      const visit = await tx.patientStationVisit.findUnique({
        where: { id: visitId },
        select: {
          id: true,
          clinicId: true,
          station: { select: { name: true } },
          patientCheckIn: { select: { id: true, status: true, dayNumber: true } },
        },
      });
      if (!visit || visit.clinicId !== clinicId) {
        throw new NotFoundException({
          code: 'STATION_VISIT_NOT_FOUND',
          message: 'That station visit was not found.',
        });
      }
      if (!(OPEN_CHECK_IN as readonly string[]).includes(visit.patientCheckIn.status)) {
        throw new ConflictException({
          code: 'CHECK_IN_CLOSED',
          message: 'This patient has left the line, so no doctor can be asked for them.',
        });
      }
      const existing = await tx.doctorRequest.findFirst({
        where: { checkInId: visit.patientCheckIn.id, resolvedAt: null },
      });
      if (existing) {
        // Urgency only goes up; a reason fills in, never changes.
        const raise = existing.urgency !== 'NOW' && input.urgency === 'NOW';
        const row = await tx.doctorRequest.update({
          where: { id: existing.id },
          data: {
            ...(raise ? { urgency: 'NOW' } : {}),
            ...(!existing.reason && input.reason ? { reason: input.reason } : {}),
          },
          select: { ...DOCTOR_REQUEST_VIEW_SELECT, checkInId: true },
        });
        return { row, notify: raise, visit };
      }
      const row = await tx.doctorRequest.create({
        data: {
          clinicId,
          checkInId: visit.patientCheckIn.id,
          stationVisitId: visit.id,
          urgency: input.urgency,
          reason: input.reason ?? null,
          auto: input.auto ?? false,
          requestedByUserId: actorUserId,
        },
        select: { ...DOCTOR_REQUEST_VIEW_SELECT, checkInId: true },
      });
      if (actorUserId) {
        await this.auditService.logWrite(
          {
            clinicId,
            actorUserId,
            action: 'DOCTOR_REQUEST.CREATE',
            entityType: 'DoctorRequest',
            entityId: row.id,
            afterJson: JSON.stringify({
              checkInId: visit.patientCheckIn.id,
              urgency: row.urgency,
              reason: row.reason,
              auto: row.auto,
            }),
            requestId,
          },
          tx,
        );
      }
      return { row, notify: true, visit };
    });

    if (notify && this.push) {
      const recipients = (await this.push.doctorsOnShift(clinicId)).filter(
        (id) => id !== actorUserId,
      );
      const message = doctorRequestMessage({
        urgency: row.urgency,
        reason: row.reason,
        stationName: visit.station.name,
        dayNumber: visit.patientCheckIn.dayNumber,
      });
      this.push.notify(recipients, {
        ...message,
        url: `/stations/visits/${row.stationVisitId ?? visitId}`,
        tag: `doctor-request:${row.id}`,
        kind: 'DOCTOR_REQUEST',
        clinicId,
        doctorRequestId: row.id,
      });
    }
    return toDoctorRequestView(row);
  }

  /** "I'm on it". The first doctor wins; a second gets a refusal naming who took it. */
  async claim(clinicId: string, requestId: string, actorUserId: string, auditRequestId?: string) {
    const view = await this.prisma.$transaction(async (tx) => {
      const taken = await tx.doctorRequest.updateMany({
        where: {
          id: requestId,
          clinicId,
          claimedByUserId: null,
          resolvedAt: null,
          checkIn: { status: { in: [...OPEN_CHECK_IN] } },
        },
        data: { claimedByUserId: actorUserId, claimedAt: new Date() },
      });
      const row = await tx.doctorRequest.findUnique({
        where: { id: requestId },
        select: { ...DOCTOR_REQUEST_VIEW_SELECT, clinicId: true },
      });
      if (!row || row.clinicId !== clinicId) throw this.notFound();
      const view = toDoctorRequestView(row);
      if (taken.count === 0) {
        if (view.claimedBy?.id === actorUserId) return view;
        if (view.claimedBy) {
          throw new ConflictException({
            code: 'DOCTOR_REQUEST_TAKEN',
            message: `${view.claimedBy.displayName} is already on it.`,
            claimedBy: view.claimedBy,
          });
        }
        throw new ConflictException({
          code: 'DOCTOR_REQUEST_CLOSED',
          message: 'This patient no longer needs a doctor from this request.',
        });
      }
      await this.auditService.logWrite(
        {
          clinicId,
          actorUserId,
          action: 'DOCTOR_REQUEST.CLAIM',
          entityType: 'DoctorRequest',
          entityId: requestId,
          requestId: auditRequestId,
        },
        tx,
      );
      return view;
    });
    // Everyone else's tile is answered: it stays in their feed, read, showing who took it.
    await this.prisma.detachFromRlsContext(() =>
      this.prisma.withSystemContext(
        { systemReason: 'Mark a taken doctor request read for the other doctors' },
        (client) =>
          client.inboxNotification.updateMany({
            where: { doctorRequestId: requestId, readAt: null },
            data: { readAt: new Date() },
          }),
      ),
    );
    return view;
  }

  /** "Seen": the doctor who took it closes it. */
  async resolve(clinicId: string, requestId: string, actorUserId: string, auditRequestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.doctorRequest.findUnique({
        where: { id: requestId },
        select: { ...DOCTOR_REQUEST_VIEW_SELECT, clinicId: true, claimedByUserId: true },
      });
      if (!row || row.clinicId !== clinicId) throw this.notFound();
      if (row.claimedByUserId !== actorUserId) {
        throw new ForbiddenException({
          code: 'DOCTOR_REQUEST_NOT_YOURS',
          message: 'Only the doctor who took this request can mark it seen.',
        });
      }
      if (row.resolvedAt) return toDoctorRequestView(row);
      const resolved = await tx.doctorRequest.update({
        where: { id: requestId },
        data: { resolvedAt: new Date() },
        select: DOCTOR_REQUEST_VIEW_SELECT,
      });
      await this.auditService.logWrite(
        {
          clinicId,
          actorUserId,
          action: 'DOCTOR_REQUEST.RESOLVE',
          entityType: 'DoctorRequest',
          entityId: requestId,
          requestId: auditRequestId,
        },
        tx,
      );
      return toDoctorRequestView(resolved);
    });
  }

  private notFound() {
    return new NotFoundException({
      code: 'DOCTOR_REQUEST_NOT_FOUND',
      message: 'That doctor request was not found.',
    });
  }
}
