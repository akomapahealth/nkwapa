import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ScreeningEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EmailStatusService } from '../notifications/email/email-status.service';
import {
  VOLUNTEER_ROSTER_ASSIGNED_V1,
  VOLUNTEER_ROSTER_CANCELLED_V1,
  VOLUNTEER_ROSTER_REMOVED_V1,
  VOLUNTEER_ROSTER_UPDATED_V1,
} from '../notifications/templates/volunteer-roster';
import type {
  CancelScreeningEventDto,
  CreateScreeningEventDto,
  UpdateScreeningEventDto,
} from './dto/volunteer.dto';

/** Resends allowed per assignment per hour; the next one is refused with 429. */
export const ROSTER_RESEND_LIMIT = 3;
const HOUR_MS = 60 * 60 * 1000;
const EVENT_LIST_LIMIT = 100;

type Recipient = { id: string; volunteerContact: { displayName: string; email: string } };

type SendContext = {
  clinicId: string;
  clinic: { name: string; timezone: string };
  event: ScreeningEvent;
  senderName: string | null;
  actorUserId: string;
};

/**
 * Screening days, their rosters, and the emails that tell volunteers (#226).
 *
 * Future scheduling only: nothing here touches StaffShift. Every email goes through the
 * Reminder ledger keyed on the assignment, so retries, the webhook, the sweep and the operator
 * view all apply, and a volunteer with no account can still be told.
 */
@Injectable()
export class ScreeningEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reminderService: ReminderService,
    private readonly emailStatus: EmailStatusService,
  ) {}

  async list(clinicId: string) {
    const clinic = await this.clinic(clinicId);
    const events = await this.prisma.screeningEvent.findMany({
      where: { clinicId },
      include: { _count: { select: { assignments: { where: { status: 'ASSIGNED' } } } } },
      orderBy: [{ startsAt: 'desc' }],
      take: EVENT_LIST_LIMIT,
    });
    return {
      timezone: clinic.timezone,
      items: events.map(({ _count, ...event }) => ({
        ...event,
        rosteredCount: _count.assignments,
      })),
    };
  }

  async get(clinicId: string, eventId: string) {
    const event = await this.find(clinicId, eventId);
    const assignments = await this.prisma.screeningEventAssignment.findMany({
      where: { clinicId, eventId },
      include: {
        volunteerContact: {
          select: { id: true, displayName: true, email: true, isActive: true },
        },
        reminders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, failureReason: true, sentAt: true, createdAt: true },
        },
      },
      orderBy: [{ status: 'asc' }, { assignedAt: 'asc' }],
    });
    const clinic = await this.clinic(clinicId);
    return {
      event,
      timezone: clinic.timezone,
      emailConfigured: this.emailStatus.getStatus().available,
      roster: assignments.map(({ reminders, ...assignment }) => ({
        ...assignment,
        // Delivery state is the latest roster email's; null until the first send.
        delivery: reminders[0] ?? null,
        notifiedForCurrentDetails:
          assignment.lastNotifiedAt !== null && assignment.lastNotifiedAt >= event.detailsChangedAt,
      })),
    };
  }

  async create(clinicId: string, actorUserId: string, dto: CreateScreeningEventDto) {
    const { startsAt, endsAt } = this.times(dto.startsAt, dto.endsAt);
    if (startsAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'SCREENING_EVENT_IN_PAST',
        message: 'A screening day must start in the future.',
      });
    }
    const event = await this.prisma.screeningEvent.create({
      data: {
        clinicId,
        title: dto.title,
        startsAt,
        endsAt,
        siteName: dto.siteName,
        siteAddress: dto.siteAddress || null,
        notes: dto.notes || null,
        createdByUserId: actorUserId,
      },
    });
    await this.audit(clinicId, actorUserId, 'SCREENING_EVENT.CREATE', 'ScreeningEvent', event.id, {
      after: event,
    });
    return event;
  }

  async update(
    clinicId: string,
    eventId: string,
    actorUserId: string,
    dto: UpdateScreeningEventDto,
  ) {
    const before = this.assertOpen(await this.find(clinicId, eventId));
    const { startsAt, endsAt } = this.times(
      dto.startsAt ?? before.startsAt.toISOString(),
      dto.endsAt ?? before.endsAt.toISOString(),
    );
    if (dto.startsAt && startsAt.getTime() !== before.startsAt.getTime() && startsAt < new Date()) {
      throw new BadRequestException({
        code: 'SCREENING_EVENT_IN_PAST',
        message: 'A screening day cannot be moved into the past.',
      });
    }
    const siteAddress =
      dto.siteAddress === undefined ? before.siteAddress : dto.siteAddress || null;
    const siteName = dto.siteName ?? before.siteName;
    const detailsChanged =
      startsAt.getTime() !== before.startsAt.getTime() ||
      endsAt.getTime() !== before.endsAt.getTime() ||
      siteName !== before.siteName ||
      siteAddress !== before.siteAddress;
    const now = new Date();

    const event = await this.prisma.screeningEvent.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        startsAt,
        endsAt,
        siteName,
        siteAddress,
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...(detailsChanged && { detailsChangedAt: now }),
      },
    });

    // Only people already told about the old details need the new ones. Default on.
    let notified = 0;
    if (detailsChanged && dto.notifyChange !== false) {
      const recipients = await this.recipients(clinicId, eventId, { notifiedOnly: true });
      const ctx = await this.sendContext(clinicId, event, actorUserId);
      for (const recipient of recipients) {
        await this.send(ctx, recipient, VOLUNTEER_ROSTER_UPDATED_V1.key, { markNotified: true });
      }
      notified = recipients.length;
    }

    await this.audit(clinicId, actorUserId, 'SCREENING_EVENT.UPDATE', 'ScreeningEvent', eventId, {
      before,
      after: event,
      notified,
    });
    return { event, notified };
  }

  async cancel(
    clinicId: string,
    eventId: string,
    actorUserId: string,
    dto: CancelScreeningEventDto,
  ) {
    const before = this.assertOpen(await this.find(clinicId, eventId));
    const event = await this.prisma.screeningEvent.update({
      where: { id: eventId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
    });

    let notified = 0;
    if (dto.notifyVolunteers !== false) {
      // Someone never told about the day does not need telling it is off.
      const recipients = await this.recipients(clinicId, eventId, { notifiedOnly: true });
      const ctx = await this.sendContext(clinicId, event, actorUserId);
      for (const recipient of recipients) {
        await this.send(ctx, recipient, VOLUNTEER_ROSTER_CANCELLED_V1.key, {
          extra: { cancelReason: dto.reason },
        });
      }
      notified = recipients.length;
    }

    await this.audit(clinicId, actorUserId, 'SCREENING_EVENT.CANCEL', 'ScreeningEvent', eventId, {
      before: { status: before.status },
      after: { status: event.status, cancelReason: event.cancelReason },
      notified,
    });
    return { event, notified };
  }

  /**
   * Put directory contacts on the roster. Every id must be this clinic's (404) and active (400);
   * a volunteer removed earlier is reactivated on the same row rather than duplicated.
   */
  async addToRoster(
    clinicId: string,
    eventId: string,
    actorUserId: string,
    volunteerContactIds: string[],
  ) {
    this.assertOpen(await this.find(clinicId, eventId));
    const ids = [...new Set(volunteerContactIds)];
    const contacts = await this.prisma.volunteerContact.findMany({
      where: { clinicId, id: { in: ids } },
      select: { id: true, isActive: true },
    });
    if (contacts.length !== ids.length) throw new NotFoundException('Volunteer not found');
    if (contacts.some((contact) => !contact.isActive)) {
      throw new BadRequestException({
        code: 'VOLUNTEER_INACTIVE',
        message: 'Inactive volunteers cannot be added to a roster. Reactivate them first.',
      });
    }

    const now = new Date();
    for (const volunteerContactId of ids) {
      await this.prisma.screeningEventAssignment.upsert({
        where: { eventId_volunteerContactId: { eventId, volunteerContactId } },
        create: { clinicId, eventId, volunteerContactId, assignedByUserId: actorUserId },
        update: {
          status: 'ASSIGNED',
          assignedByUserId: actorUserId,
          assignedAt: now,
          removedAt: null,
          removedByUserId: null,
          // A returning volunteer has not been told about this booking yet.
          lastNotifiedAt: null,
        },
      });
    }
    await this.audit(clinicId, actorUserId, 'ROSTER.ADD', 'ScreeningEvent', eventId, {
      after: { volunteerContactIds: ids },
    });
    return this.get(clinicId, eventId);
  }

  async removeFromRoster(
    clinicId: string,
    eventId: string,
    assignmentId: string,
    actorUserId: string,
    notify: boolean,
  ) {
    const event = this.assertOpen(await this.find(clinicId, eventId));
    const assignment = await this.findAssignment(clinicId, eventId, assignmentId);
    if (assignment.status === 'REMOVED') return this.get(clinicId, eventId);

    await this.prisma.screeningEventAssignment.update({
      where: { id: assignmentId },
      data: { status: 'REMOVED', removedAt: new Date(), removedByUserId: actorUserId },
    });
    if (notify) {
      const ctx = await this.sendContext(clinicId, event, actorUserId);
      await this.send(ctx, assignment, VOLUNTEER_ROSTER_REMOVED_V1.key);
    }
    await this.audit(
      clinicId,
      actorUserId,
      'ROSTER.REMOVE',
      'ScreeningEventAssignment',
      assignmentId,
      {
        before: { status: 'ASSIGNED' },
        after: {
          status: 'REMOVED',
          volunteerContactId: assignment.volunteerContactId,
          notified: notify,
        },
      },
    );
    return this.get(clinicId, eventId);
  }

  /** Email every ASSIGNED volunteer who has not been told the event's current details. */
  async notify(clinicId: string, eventId: string, actorUserId: string) {
    const event = this.assertOpen(await this.find(clinicId, eventId));
    const recipients = await this.prisma.screeningEventAssignment.findMany({
      where: {
        clinicId,
        eventId,
        status: 'ASSIGNED',
        OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: event.detailsChangedAt } }],
      },
      include: { volunteerContact: { select: { displayName: true, email: true } } },
    });
    const ctx = await this.sendContext(clinicId, event, actorUserId);
    for (const recipient of recipients) {
      await this.send(ctx, recipient, VOLUNTEER_ROSTER_ASSIGNED_V1.key, { markNotified: true });
    }
    await this.audit(clinicId, actorUserId, 'ROSTER.NOTIFY', 'ScreeningEvent', eventId, {
      after: { assignmentIds: recipients.map((recipient) => recipient.id) },
    });
    return { queued: recipients.length };
  }

  async resend(clinicId: string, eventId: string, assignmentId: string, actorUserId: string) {
    const event = this.assertOpen(await this.find(clinicId, eventId));
    const assignment = await this.findAssignment(clinicId, eventId, assignmentId);
    if (assignment.status !== 'ASSIGNED') {
      throw new BadRequestException({
        code: 'ROSTER_NOT_ASSIGNED',
        message: 'This volunteer is no longer on the roster.',
      });
    }

    // Counted from the audit trail, which records each resend and nothing else under this action.
    const recent = await this.prisma.auditEvent.count({
      where: {
        clinicId,
        action: 'ROSTER.RESEND',
        entityId: assignmentId,
        createdAt: { gte: new Date(Date.now() - HOUR_MS) },
      },
    });
    if (recent >= ROSTER_RESEND_LIMIT) {
      throw new HttpException(
        {
          code: 'ROSTER_RESEND_LIMIT',
          message: `This volunteer has been emailed ${ROSTER_RESEND_LIMIT} times in the last hour. Try again later.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ctx = await this.sendContext(clinicId, event, actorUserId);
    const reminder = await this.send(ctx, assignment, VOLUNTEER_ROSTER_ASSIGNED_V1.key, {
      markNotified: true,
      extra: { resend: true },
    });
    await this.audit(
      clinicId,
      actorUserId,
      'ROSTER.RESEND',
      'ScreeningEventAssignment',
      assignmentId,
      {
        after: { reminderId: reminder.id },
      },
    );
    return { reminderId: reminder.id, status: reminder.status };
  }

  private async find(clinicId: string, eventId: string) {
    const event = await this.prisma.screeningEvent.findFirst({ where: { id: eventId, clinicId } });
    if (!event) throw new NotFoundException('Screening event not found');
    return event;
  }

  private async findAssignment(clinicId: string, eventId: string, assignmentId: string) {
    const assignment = await this.prisma.screeningEventAssignment.findFirst({
      where: { id: assignmentId, clinicId, eventId },
      include: { volunteerContact: { select: { displayName: true, email: true } } },
    });
    if (!assignment) throw new NotFoundException('Roster entry not found');
    return assignment;
  }

  // shortcut: nothing marks an event COMPLETED yet; a past SCHEDULED event stays editable. Add a
  // "mark completed" action if managers need past days locked.
  private assertOpen(event: ScreeningEvent) {
    if (event.status !== 'SCHEDULED') {
      throw new ConflictException({
        code: 'SCREENING_EVENT_CLOSED',
        message: `This screening day is ${event.status.toLowerCase()} and can no longer be changed.`,
      });
    }
    return event;
  }

  private times(startsAtIso: string, endsAtIso: string) {
    const startsAt = new Date(startsAtIso);
    const endsAt = new Date(endsAtIso);
    if (endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'SCREENING_EVENT_TIME_ORDER',
        message: 'The end time must be after the start time.',
      });
    }
    return { startsAt, endsAt };
  }

  private recipients(
    clinicId: string,
    eventId: string,
    { notifiedOnly }: { notifiedOnly: boolean },
  ) {
    return this.prisma.screeningEventAssignment.findMany({
      where: {
        clinicId,
        eventId,
        status: 'ASSIGNED',
        ...(notifiedOnly && { lastNotifiedAt: { not: null } }),
      },
      include: { volunteerContact: { select: { displayName: true, email: true } } },
    });
  }

  private clinic(clinicId: string) {
    return this.prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: { name: true, timezone: true },
    });
  }

  private async sendContext(
    clinicId: string,
    event: ScreeningEvent,
    actorUserId: string,
  ): Promise<SendContext> {
    const [clinic, actor] = await Promise.all([
      this.clinic(clinicId),
      this.prisma.user.findUnique({ where: { id: actorUserId }, select: { displayName: true } }),
    ]);
    return { clinicId, clinic, event, senderName: actor?.displayName ?? null, actorUserId };
  }

  /** The payload holds the event and the volunteer's first name, never anything about a patient. */
  private async send(
    ctx: SendContext,
    recipient: Recipient,
    templateKey: string,
    options: { markNotified?: boolean; extra?: Record<string, unknown> } = {},
  ) {
    const { event, clinic } = ctx;
    const reminder = await this.reminderService.sendNotificationNow({
      clinicId: ctx.clinicId,
      recipientType: 'USER',
      screeningEventAssignmentId: recipient.id,
      toAddress: recipient.volunteerContact.email,
      templateKey,
      payload: {
        firstName: recipient.volunteerContact.displayName.trim().split(/\s+/)[0] ?? null,
        clinicName: clinic.name,
        timezone: clinic.timezone,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        siteName: event.siteName,
        siteAddress: event.siteAddress,
        notes: event.notes,
        senderName: ctx.senderName,
        ...options.extra,
      },
      actorUserId: ctx.actorUserId,
    });
    if (options.markNotified) {
      await this.prisma.screeningEventAssignment.update({
        where: { id: recipient.id },
        data: { lastNotifiedAt: new Date() },
      });
    }
    return reminder;
  }

  private audit(
    clinicId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    detail: { before?: unknown; after?: unknown; notified?: number },
  ) {
    return this.auditService.logWrite({
      clinicId,
      actorUserId,
      action,
      entityType,
      entityId,
      beforeJson: detail.before ? JSON.stringify(detail.before) : null,
      afterJson: JSON.stringify(
        detail.notified === undefined
          ? detail.after
          : { ...(detail.after as object), notified: detail.notified },
      ),
    });
  }
}
