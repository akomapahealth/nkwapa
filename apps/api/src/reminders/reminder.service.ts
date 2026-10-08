import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, Reminder, ReminderStatus } from '@prisma/client';
import { CLINIC_DEFAULT_TIMEZONE, todayInTimeZone } from '@nkwapa/db';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { lockForTransaction, tryLockForTransaction } from '../prisma/transaction-lock';
import { AuditService } from '../audit/audit.service';
import { redactLogValue } from '../common/redaction';
import { SINGLE_FINAL_ATTEMPT, hasAttemptsLeft, type JobAttempt } from '../common/job-attempt';
import {
  buildKeysetWhere,
  decodeJsonKeysetCursor,
  encodeJsonKeysetCursor,
} from '../common/keyset-cursor';
import { EMAIL_PROVIDER } from '../notifications/email/email-provider.token';
import type {
  EmailProvider,
  EmailSendResult,
} from '../notifications/email/email-provider.interface';
import type { JobStep } from '../prisma/job-tenant-context.runner';
import type { SmsProvider, SmsSendResult } from './sms-provider.interface';
import { REMINDER_BACKOFF, REMINDER_SEND_ATTEMPTS } from './reminder-retry';
import {
  isTemplateKey,
  renderMessage,
  NOTIFICATION_TYPE_GROUPS,
  type NotificationTypeGroup,
} from '../notifications/templates';
import { DEFAULT_TIMEZONE } from '../notifications/templates/partials';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';

const REMINDER_QUEUE_NAME = 'reminders';
const FOLLOWUP_TEMPLATE_KEY = 'FOLLOWUP_REMINDER_V1';
const APPOINTMENT_TEMPLATE_KEY = 'APPOINTMENT_REMINDER_V1';
const REMINDER_SEND_FAILED = 'SEND_FAILED';
/** A send whose outcome nobody knows: the worker claimed it and never recorded what happened. */
export const SEND_OUTCOME_UNKNOWN = 'SEND_OUTCOME_UNKNOWN';
/**
 * How long a send may stay in flight before the sweep calls its outcome unknown. A provider call
 * is bounded by seconds (SMTP's connect timeout is 10 s), so ten minutes is never a live send.
 */
export const REMINDER_SEND_STALE_AFTER_MS = 10 * 60 * 1000;
const REMINDER_RECONCILE_BATCH = 200;
/**
 * How far past its time a QUEUED reminder may be before the sweep looks for its job (#165). Longer
 * than the retry schedule (5 s, then 60 s) and the rate limiter's queueing, so a reminder that is
 * merely waiting its turn is never re-queued under a live job.
 */
export const REMINDER_OVERDUE_GRACE_MS = 15 * 60 * 1000;
/** Job states in which the queue still holds a run of this reminder. */
const LIVE_JOB_STATES = new Set([
  'waiting',
  'delayed',
  'active',
  'prioritized',
  'waiting-children',
]);

/**
 * What one run of `processReminder` asks of the queue. `notDueUntil`: the job arrived before the
 * reminder's time and must run again then (#165).
 */
export type ReminderRunOutcome = { notDueUntil: Date } | void;
/** Why a staff-scheduled reminder that never went out is marked FAILED (#116). */
export const CANCELLED_BY_STAFF = 'CANCELLED_BY_STAFF';

/**
 * Thrown to hand a transient send failure back to BullMQ.
 *
 * The row is deliberately left QUEUED when this is raised: `processReminder` refuses to act on a
 * row that is not QUEUED, so marking it FAILED first would make every retry a silent no-op. That
 * is what the old code did - it caught every failure, wrote FAILED, and returned normally, so the
 * `attempts: 3` on the queue never once fired for a send failure and a momentary relay blip killed
 * the notification outright.
 */
export class TransientReminderSendError extends Error {
  constructor(
    readonly reminderId: string,
    readonly failureReason: string,
    readonly attemptsMade: number,
  ) {
    super(`Reminder ${reminderId} send failed transiently (attempt ${attemptsMade})`);
    this.name = 'TransientReminderSendError';
  }
}
const EMAIL_CHANNEL_UNAVAILABLE = 'EMAIL_CHANNEL_UNAVAILABLE';
const TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND';
const QUEUE_UNAVAILABLE = 'QUEUE_UNAVAILABLE';
const NO_CONTACT_METHOD = 'NO_CONTACT_METHOD';
const APPOINTMENT_NOT_FOUND = 'APPOINTMENT_NOT_FOUND';
const APPOINTMENT_NOT_CONFIRMED = 'APPOINTMENT_NOT_CONFIRMED';
const APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED';

export interface ScheduleFollowUpParams {
  clinicId: string;
  clinicName: string;
  clinicTimezone?: string;
  patientId: string;
  patientCode: string;
  phoneE164: string;
  /** Null for a reminder a staff member scheduled directly, outside any encounter (#116). */
  encounterId: string | null;
  followUpDate: Date;
  /** Set only when a staff member scheduled it directly; makes it cancellable by staff. */
  createdByUserId?: string;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleFollowUpEmailParams {
  clinicId: string;
  clinicName: string;
  clinicTimezone?: string;
  patientId: string;
  patientCode: string;
  email: string;
  encounterId: string | null;
  followUpDate: Date;
  /** Set only when a staff member scheduled it directly; makes it cancellable by staff. */
  createdByUserId?: string;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleFollowUpNoContactParams {
  clinicId: string;
  patientId: string;
  patientCode: string;
  encounterId: string | null;
  followUpDate: Date;
  /** Set only when a staff member scheduled it directly; makes it cancellable by staff. */
  createdByUserId?: string;
  actorUserId: string;
  requestId?: string;
}

/** The furthest ahead a staff member may schedule a follow-up reminder, in days. */
export const STAFF_FOLLOW_UP_MAX_DAYS = 366;

export interface ScheduleStaffFollowUpParams {
  clinicId: string;
  patientId: string;
  /** The clinic-local calendar date the patient should return, `YYYY-MM-DD`. */
  followUpDate: string;
  actorUserId: string;
  requestId?: string;
}

export interface CancelStaffReminderParams {
  clinicId: string;
  reminderId: string;
  actorUserId: string;
  /** Holds REMINDER.CANCEL_ANY: may cancel a colleague's, not only their own. */
  canCancelAny: boolean;
  requestId?: string;
}

export interface ScheduleAppointmentReminderParams {
  clinicId: string;
  clinicName: string;
  clinicTimezone?: string;
  patientId: string;
  patientCode: string;
  phoneE164: string;
  appointmentId: string;
  startsAt: Date;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleAppointmentEmailReminderParams {
  clinicId: string;
  clinicName: string;
  clinicTimezone?: string;
  patientId: string;
  patientCode: string;
  email: string;
  appointmentId: string;
  startsAt: Date;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleAppointmentNoContactParams {
  clinicId: string;
  patientId: string;
  patientCode: string;
  appointmentId: string;
  startsAt: Date;
  actorUserId: string;
  requestId?: string;
}

export interface SendNotificationParams {
  /** Null only for genuinely system-scoped notices, which no clinic owns. */
  clinicId: string | null;
  recipientType: 'PATIENT' | 'USER';
  patientId?: string | null;
  recipientUserId?: string | null;
  portalInviteId?: string | null;
  /** Addresses a staff invitation, whose recipient may not have a User row yet. */
  staffInviteId?: string | null;
  appointmentId?: string | null;
  encounterId?: string | null;
  /** Null when the recipient has no address on file; recorded as a visible failure. */
  toAddress: string | null;
  templateKey: string;
  payload: Record<string, unknown>;
  actorUserId: string;
  requestId?: string;
}

export interface ListRemindersParams {
  clinicId: string;
  /**
   * Limit the ledger to patient reminders. Staff lifecycle notices (invites, role changes) are
   * about colleagues, not patients, and a volunteer reading the ledger has no reason to see them.
   */
  patientRemindersOnly?: boolean;
  status?: ReminderStatus;
  channel?: 'SMS' | 'EMAIL';
  /** A message-kind group rather than a raw template key; see NOTIFICATION_TYPE_GROUPS. */
  type?: NotificationTypeGroup;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface ListRemindersResult {
  items: Array<{
    id: string;
    clinicId: string | null;
    patientId: string | null;
    encounterId: string | null;
    appointmentId: string | null;
    channel: string;
    toAddress: string;
    templateKey: string;
    payloadJson: string;
    scheduledAt: Date;
    sentAt: Date | null;
    status: string;
    providerMessageId: string | null;
    failureReason: string | null;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  nextCursor: string | null;
}

/** The row `processReminder` claimed, with what deciding to send it needed to read. */
type ReminderToSend = Prisma.ReminderGetPayload<{
  include: { clinic: true; patient: true; appointment: true };
}>;

type ReminderMessage = {
  subject: string;
  smsBody: string;
  emailHtml: string;
  emailText: string;
};

type AppointmentReminderChannel = 'SMS' | 'EMAIL';

type ScheduleAppointmentReminderRecordParams = {
  clinicId: string;
  clinicName?: string;
  clinicTimezone?: string;
  patientId: string;
  patientCode: string;
  appointmentId: string;
  startsAt: Date;
  actorUserId: string;
  requestId?: string;
  channel: AppointmentReminderChannel;
  toAddress: string;
  status: ReminderStatus;
  failureReason?: string;
};

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    // The declared interface rather than a structural copy of it. The copy had already drifted:
    // it did not carry `retryable`, so the union below silently lost the field.
    @Inject('SmsProvider')
    private readonly smsProvider: SmsProvider,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider | null,
    @InjectQueue(REMINDER_QUEUE_NAME) private readonly reminderQueue: Queue,
  ) {}

  /**
   * Record and queue a message to go out now.
   *
   * "Now" is a zero delay on the existing queue rather than an inline send. The whole
   * request already runs inside one Postgres transaction, so an SMTP round-trip here
   * would hold a database connection open for the length of a network call — and a slow
   * relay would start failing invite creation and role assignment, not just the mail.
   *
   * Returns the ledger row so callers can report delivery state to the operator who
   * triggered it.
   */
  async sendNotificationNow(params: SendNotificationParams) {
    if (!isTemplateKey(params.templateKey)) {
      // A caller naming a template that does not exist is a programming error, and
      // queueing the row would only turn it into a delivery failure hours later.
      throw new Error(`Unknown notification template: ${params.templateKey}`);
    }

    const base = {
      clinicId: params.clinicId,
      patientId: params.recipientType === 'PATIENT' ? (params.patientId ?? null) : null,
      recipientType: params.recipientType,
      recipientUserId: params.recipientType === 'USER' ? (params.recipientUserId ?? null) : null,
      portalInviteId: params.portalInviteId ?? null,
      staffInviteId: params.staffInviteId ?? null,
      appointmentId: params.appointmentId ?? null,
      encounterId: params.encounterId ?? null,
      channel: 'EMAIL' as const,
      templateKey: params.templateKey,
      payloadJson: JSON.stringify(params.payload),
      scheduledAt: new Date(),
    };

    if (!params.toAddress) {
      // Recorded rather than skipped. A silent no-op leaves staff believing an invite
      // went out; a visible failed row is what "explain why email is unavailable" means.
      const reminder = await this.prisma.reminder.create({
        data: { ...base, toAddress: '', status: 'FAILED', failureReason: NO_CONTACT_METHOD },
      });
      await this.auditReminderCreate(
        params.clinicId,
        params.actorUserId,
        reminder,
        params.requestId,
      );
      return reminder;
    }

    const reminder = await this.prisma.reminder.create({
      data: { ...base, toAddress: params.toAddress, status: 'QUEUED' },
    });
    await this.auditReminderCreate(params.clinicId, params.actorUserId, reminder, params.requestId);

    try {
      await this.queueReminder(reminder.id, base.scheduledAt, params.clinicId);
    } catch (err) {
      // Redis is now in the blast radius of invite creation and role assignment. A queue
      // outage must degrade to a visible failed row, not a 500 on the workflow itself.
      // Safe to catch: this throws from Redis, so the ambient Postgres transaction is
      // still healthy and the update below will apply.
      this.logger.error(
        JSON.stringify({
          message: 'Notification could not be queued',
          reminderId: reminder.id,
          templateKey: params.templateKey,
          error: redactLogValue(err),
        }),
      );
      return this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: 'FAILED', failureReason: QUEUE_UNAVAILABLE },
      });
    }

    return reminder;
  }

  async scheduleFollowUpReminder(params: ScheduleFollowUpParams): Promise<Reminder> {
    const payloadJson = JSON.stringify({
      patientCode: params.patientCode,
      clinicName: params.clinicName,
      timezone: params.clinicTimezone ?? DEFAULT_TIMEZONE,
      followUpDate: params.followUpDate.toISOString(),
      patientId: params.patientId,
      encounterId: params.encounterId,
    });

    const reminder = await this.prisma.reminder.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        createdByUserId: params.createdByUserId ?? null,
        channel: 'SMS',
        toAddress: params.phoneE164,
        templateKey: FOLLOWUP_TEMPLATE_KEY,
        payloadJson,
        scheduledAt: params.followUpDate,
        status: 'QUEUED',
      },
    });

    await this.auditReminderCreate(params.clinicId, params.actorUserId, reminder, params.requestId);
    await this.queueReminder(reminder.id, params.followUpDate, params.clinicId);
    return reminder;
  }

  async scheduleFollowUpEmailReminder(params: ScheduleFollowUpEmailParams): Promise<Reminder> {
    const payloadJson = JSON.stringify({
      patientCode: params.patientCode,
      clinicName: params.clinicName,
      timezone: params.clinicTimezone ?? DEFAULT_TIMEZONE,
      followUpDate: params.followUpDate.toISOString(),
      patientId: params.patientId,
      encounterId: params.encounterId,
    });

    const reminder = await this.prisma.reminder.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        createdByUserId: params.createdByUserId ?? null,
        channel: 'EMAIL',
        toAddress: params.email,
        templateKey: FOLLOWUP_TEMPLATE_KEY,
        payloadJson,
        scheduledAt: params.followUpDate,
        status: 'QUEUED',
      },
    });

    await this.auditReminderCreate(params.clinicId, params.actorUserId, reminder, params.requestId);
    await this.queueReminder(reminder.id, params.followUpDate, params.clinicId);
    return reminder;
  }

  async scheduleFollowUpReminderNoContact(
    params: ScheduleFollowUpNoContactParams,
  ): Promise<Reminder> {
    const payloadJson = JSON.stringify({
      patientCode: params.patientCode,
      followUpDate: params.followUpDate.toISOString(),
      patientId: params.patientId,
      encounterId: params.encounterId,
    });

    const reminder = await this.prisma.reminder.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        createdByUserId: params.createdByUserId ?? null,
        channel: 'SMS',
        toAddress: 'N/A',
        templateKey: FOLLOWUP_TEMPLATE_KEY,
        payloadJson,
        scheduledAt: params.followUpDate,
        status: 'FAILED',
        failureReason: NO_CONTACT_METHOD,
      },
    });

    await this.auditReminderCreate(params.clinicId, params.actorUserId, reminder, params.requestId);
    return reminder;
  }

  /**
   * A follow-up reminder a staff member schedules directly for a patient (#116).
   *
   * Before this, every reminder was a side effect of something else (an encounter finalized with
   * a follow-up date, an appointment, an invite), so a volunteer had no way to set one. The message
   * is the registered follow-up template and nothing else: there is no free-text outbound channel.
   * The channel is chosen exactly as encounter finalize chooses it (SMS to a phone, email to an
   * address, a visible NO_CONTACT_METHOD failure when the chart has neither), and every row goes
   * through the same ledger, queue, retry policy and audit as any other reminder.
   */
  async scheduleStaffFollowUp(params: ScheduleStaffFollowUpParams): Promise<Reminder[]> {
    const [patient, clinic] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { id: params.patientId, primaryClinicId: params.clinicId },
        select: {
          id: true,
          patientCode: true,
          phoneE164: true,
          email: true,
          mergedIntoPatientId: true,
        },
      }),
      this.prisma.clinic.findUnique({
        where: { id: params.clinicId },
        select: { name: true, timezone: true },
      }),
    ]);
    if (!patient) throw new NotFoundException('Patient not found for this clinic');
    if (patient.mergedIntoPatientId) {
      throw new ConflictException({
        code: 'PATIENT_MERGED',
        message: 'This chart was merged into another chart. Schedule the reminder there instead.',
        canonicalPatientId: patient.mergedIntoPatientId,
      });
    }

    const timezone = clinic?.timezone ?? CLINIC_DEFAULT_TIMEZONE;
    const followUpDate = this.parseStaffFollowUpDate(params.followUpDate, timezone);
    const base = {
      clinicId: params.clinicId,
      clinicName: clinic?.name ?? 'Clinic',
      clinicTimezone: timezone,
      patientId: patient.id,
      patientCode: patient.patientCode,
      encounterId: null,
      followUpDate,
      createdByUserId: params.actorUserId,
      actorUserId: params.actorUserId,
      requestId: params.requestId,
    };

    const created: Reminder[] = [];
    if (patient.phoneE164) {
      created.push(await this.scheduleFollowUpReminder({ ...base, phoneE164: patient.phoneE164 }));
    }
    if (patient.email) {
      created.push(await this.scheduleFollowUpEmailReminder({ ...base, email: patient.email }));
    }
    if (!patient.phoneE164 && !patient.email) {
      created.push(await this.scheduleFollowUpReminderNoContact(base));
    }
    return created;
  }

  /**
   * Cancel a staff-scheduled reminder that has not gone out yet (#116).
   *
   * Only reminders a staff member scheduled directly: a finalize follow-up, an appointment reminder
   * or an invite belongs to the workflow that created it, which already cancels or suppresses it.
   * The person who scheduled it may cancel it; managers may cancel anyone's. The cancel serializes
   * with the worker's send on the same lock, so a reminder is either sent or cancelled, never both.
   * It is kept as a FAILED row with its reason, like a suppressed one, so the ledger still shows
   * that it was scheduled.
   */
  async cancelStaffReminder(params: CancelStaffReminderParams): Promise<Reminder> {
    const updated = await this.prisma.$transaction(async (tx) => {
      // The worker holds this lock for the length of a send. Waiting on it means a cancel that
      // arrives mid-send reads the row the send left behind (SENT) and refuses, instead of
      // reporting a cancellation for a message that went out.
      await lockForTransaction(tx, `reminder-send:${params.reminderId}`);
      const reminder = await tx.reminder.findFirst({
        where: { id: params.reminderId, clinicId: params.clinicId },
      });
      if (!reminder) throw new NotFoundException('Reminder not found in this clinic');
      if (!reminder.createdByUserId) {
        throw new ConflictException({
          code: 'REMINDER_NOT_CANCELLABLE',
          message:
            'This reminder was created by a visit, appointment or invite, which manages it. It cannot be cancelled here.',
        });
      }
      if (reminder.createdByUserId !== params.actorUserId && !params.canCancelAny) {
        throw new ForbiddenException(
          'Only the person who scheduled this reminder, or a manager, can cancel it',
        );
      }
      if (reminder.status !== 'QUEUED') {
        throw new ConflictException({
          code: 'REMINDER_NOT_QUEUED',
          message: 'This reminder is no longer waiting to be sent.',
          existingStatus: reminder.status,
        });
      }

      const cancelled = await tx.reminder.update({
        where: { id: reminder.id },
        data: { status: 'FAILED', failureReason: CANCELLED_BY_STAFF },
      });
      await this.auditService.logWrite(
        {
          clinicId: params.clinicId,
          actorUserId: params.actorUserId,
          action: 'REMINDER.CANCEL',
          entityType: 'Reminder',
          entityId: reminder.id,
          beforeJson: JSON.stringify(reminder),
          afterJson: JSON.stringify(cancelled),
          requestId: params.requestId,
        },
        tx,
      );
      return cancelled;
    });
    // After commit: a job that fires now finds the row FAILED and stands down even if this fails.
    await this.removeQueuedReminderJob(updated.id);
    return updated;
  }

  /**
   * Today or later in the clinic's own calendar, and not absurdly far out. Stored at UTC midnight
   * of that date, as a care plan's follow-up date is, so both paths schedule the same way.
   */
  private parseStaffFollowUpDate(value: string, timezone: string): Date {
    const invalid = (message: string) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Reminder validation failed',
        fieldErrors: [{ field: 'followUpDate', message }],
      });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid('Use a date in the form YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw invalid('That date does not exist.');
    }
    const today = new Date(`${todayInTimeZone(timezone)}T00:00:00.000Z`);
    if (date.getTime() < today.getTime()) throw invalid('The follow-up date is in the past.');
    const latest = today.getTime() + STAFF_FOLLOW_UP_MAX_DAYS * 24 * 60 * 60 * 1000;
    if (date.getTime() > latest) {
      throw invalid(`Choose a date within ${STAFF_FOLLOW_UP_MAX_DAYS} days.`);
    }
    return date;
  }

  async scheduleAppointmentReminder(params: ScheduleAppointmentReminderParams): Promise<void> {
    await this.scheduleAppointmentReminderRecord({
      clinicId: params.clinicId,
      clinicName: params.clinicName,
      clinicTimezone: params.clinicTimezone,
      patientId: params.patientId,
      patientCode: params.patientCode,
      appointmentId: params.appointmentId,
      startsAt: params.startsAt,
      actorUserId: params.actorUserId,
      requestId: params.requestId,
      channel: 'SMS',
      toAddress: params.phoneE164,
      status: 'QUEUED',
    });
  }

  async scheduleAppointmentEmailReminder(
    params: ScheduleAppointmentEmailReminderParams,
  ): Promise<void> {
    await this.scheduleAppointmentReminderRecord({
      clinicId: params.clinicId,
      clinicName: params.clinicName,
      clinicTimezone: params.clinicTimezone,
      patientId: params.patientId,
      patientCode: params.patientCode,
      appointmentId: params.appointmentId,
      startsAt: params.startsAt,
      actorUserId: params.actorUserId,
      requestId: params.requestId,
      channel: 'EMAIL',
      toAddress: params.email,
      status: 'QUEUED',
    });
  }

  async scheduleAppointmentReminderNoContact(
    params: ScheduleAppointmentNoContactParams,
  ): Promise<void> {
    await this.scheduleAppointmentReminderRecord({
      clinicId: params.clinicId,
      patientId: params.patientId,
      patientCode: params.patientCode,
      appointmentId: params.appointmentId,
      startsAt: params.startsAt,
      actorUserId: params.actorUserId,
      requestId: params.requestId,
      channel: 'SMS',
      toAddress: 'N/A',
      status: 'FAILED',
      failureReason: NO_CONTACT_METHOD,
    });
  }

  async suppressQueuedAppointmentReminders(
    clinicId: string,
    appointmentId: string,
    actorUserId: string,
    failureReason: string,
    requestId?: string,
  ): Promise<void> {
    const reminders = await this.prisma.reminder.findMany({
      where: {
        clinicId,
        status: 'QUEUED',
        templateKey: APPOINTMENT_TEMPLATE_KEY,
        OR: [
          { appointmentId },
          {
            appointmentId: null,
            payloadJson: { contains: `"appointmentId":"${appointmentId}"` },
          },
        ],
      },
    });

    for (const reminder of reminders) {
      const updated = await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: 'FAILED',
          failureReason,
        },
      });

      await this.auditService.logWrite({
        clinicId,
        actorUserId,
        action: 'REMINDER.SUPPRESS',
        entityType: 'Reminder',
        entityId: reminder.id,
        beforeJson: JSON.stringify(reminder),
        afterJson: JSON.stringify(updated),
        requestId,
      });

      await this.removeQueuedReminderJob(reminder.id);
    }
  }

  async list(params: ListRemindersParams): Promise<ListRemindersResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const decoded = params.cursor ? decodeJsonKeysetCursor('createdAt', params.cursor) : null;
    const cursorWhere = buildKeysetWhere('createdAt', decoded);

    const reminders = await this.prisma.reminder.findMany({
      where: {
        clinicId: params.clinicId,
        ...(params.patientRemindersOnly && { recipientType: 'PATIENT' as const }),
        ...(params.status && { status: params.status }),
        ...(params.channel && { channel: params.channel }),
        ...(params.type && {
          templateKey: { in: [...NOTIFICATION_TYPE_GROUPS[params.type]] },
        }),
        ...(params.from || params.to
          ? {
              scheduledAt: {
                ...(params.from && { gte: params.from }),
                ...(params.to && { lte: params.to }),
              },
            }
          : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = reminders.length > limit;
    const items = hasMore ? reminders.slice(0, limit) : reminders;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeJsonKeysetCursor('createdAt', last.createdAt, last.id) : null;

    return {
      items: items.map((r) => ({
        id: r.id,
        clinicId: r.clinicId,
        patientId: r.patientId,
        encounterId: r.encounterId,
        appointmentId: r.appointmentId,
        channel: r.channel,
        toAddress: r.toAddress,
        templateKey: r.templateKey,
        payloadJson: r.payloadJson,
        scheduledAt: r.scheduledAt,
        sentAt: r.sentAt,
        status: r.status,
        providerMessageId: r.providerMessageId,
        failureReason: r.failureReason,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      nextCursor,
    };
  }

  async updateDeliveryStatus(
    providerMessageId: string,
    status: 'DELIVERED' | 'FAILED',
    errorCode?: string,
  ): Promise<void> {
    const reminder = await this.prisma.reminder.findFirst({
      where: { providerMessageId },
    });
    if (!reminder) return;

    const before = JSON.stringify(reminder);
    const data: Record<string, unknown> = { status };
    if (status === 'FAILED' && errorCode) {
      data.failureReason = `DELIVERY_FAILED:${errorCode}`;
    }

    const updated = await this.prisma.reminder.update({
      where: { id: reminder.id },
      data,
    });

    await this.auditService.logWrite({
      clinicId: reminder.clinicId,
      actorUserId: SYSTEM_ACTOR_USER_ID,
      action: 'REMINDER.DELIVERY_UPDATE',
      entityType: 'Reminder',
      entityId: reminder.id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
    });
  }

  /**
   * @param attempt Where this run sits in the job's retry budget. Omitted by callers outside the
   * queue (and by older queued jobs), which is read as a single, final attempt - the behaviour
   * before retries existed.
   */
  /**
   * Send one queued reminder (#164).
   *
   * Three short steps, never one transaction around the provider call:
   *
   * 1. **Claim**: under the job's tenant context, move the row QUEUED -> SENDING and commit. A
   *    duplicate delivery of the job, or a retry, finds SENDING and stands down.
   * 2. **Send**, with no transaction open, so a slow provider cannot outlive one.
   * 3. **Record** SENT or the failure in a second step.
   *
   * The old shape ran all three in the job's single transaction. When the provider took longer
   * than the transaction's timeout, the provider had the message but the SENT write rolled back,
   * and the retry sent it again. Now a crash or a failed record step leaves the row in SENDING,
   * which means "we do not know whether it went": `reconcileStaleSends` records that, and nothing
   * resends it automatically.
   *
   * @param step Runs one transaction under the job's tenant context. The processor always passes
   * one; the default is for callers already inside a context, such as tests.
   */
  async processReminder(
    reminderId: string,
    attempt: JobAttempt = SINGLE_FINAL_ATTEMPT,
    step: JobStep = (callback) => callback(this.prisma),
  ): Promise<ReminderRunOutcome> {
    const claim = await step(() => this.claimForSend(reminderId));
    if (!claim) return;
    if ('notDueUntil' in claim) {
      /*
        Delivered early (#165): clock skew between this host and Redis, or someone promoting a
        delayed job by hand. Returning used to complete the job with nothing re-queued, so the row
        stayed QUEUED with no job behind it and never sent. The processor puts the job back until
        the reminder's time instead; it is never sent early.
      */
      this.logger.warn(
        JSON.stringify({
          message: 'Reminder delivered before its time; delayed until due',
          reminderId,
          scheduledAt: claim.notDueUntil.toISOString(),
          earlyByMs: claim.notDueUntil.getTime() - Date.now(),
        }),
      );
      return { notDueUntil: claim.notDueUntil };
    }
    const { reminder, message } = claim;

    let result: SmsSendResult | EmailSendResult;
    try {
      result =
        reminder.channel === 'EMAIL' && this.emailProvider
          ? await this.emailProvider.send(
              reminder.toAddress,
              message.subject,
              message.emailHtml,
              message.emailText,
            )
          : await this.smsProvider.send(reminder.toAddress, message.smsBody);
    } catch (err) {
      // Providers report their own failures as results. A throw is something nobody classified,
      // and it may have come after the provider accepted the message, so the row stays SENDING
      // for the sweep instead of being retried into a second copy.
      this.logger.error(
        JSON.stringify({
          message: 'Reminder send outcome unknown; left for reconciliation',
          reminderId,
          clinicId: reminder.clinicId,
          channel: reminder.channel,
          error: redactLogValue(err),
        }),
      );
      return;
    }

    if (result.success && result.providerMessageId) {
      const providerMessageId = result.providerMessageId;
      try {
        await step(() => this.recordSent(reminder, providerMessageId));
      } catch (err) {
        // The provider has the message. Throwing hands the job back to the queue, and the retry
        // finds SENDING and stands down; the sweep then records the outcome as unknown.
        this.logger.error(
          JSON.stringify({
            message: 'Reminder was sent but SENT could not be recorded',
            reminderId,
            clinicId: reminder.clinicId,
            channel: reminder.channel,
            providerMessageId,
            error: redactLogValue(err),
          }),
        );
        throw err;
      }
      return;
    }

    if (result.error) {
      this.logger.warn(
        JSON.stringify({
          message: 'Reminder provider send failed',
          reminderId,
          clinicId: reminder.clinicId,
          channel: reminder.channel,
          error: redactLogValue(result.error),
        }),
      );
    }
    const failureReason = this.normalizeFailureReason(result.error);

    if (result.retryable && hasAttemptsLeft(attempt)) {
      /*
        The provider said this one did not go and might next time. Hand the claim back (SENDING
        -> QUEUED) and throw, so BullMQ schedules the next attempt and the claim lets it through.
        Nothing is recorded as FAILED on purpose: a row that reads FAILED between attempts would
        show an operator a failure that is still being worked on, and a resend they do not need.
      */
      await step(() => this.releaseClaim(reminderId));
      this.logger.log(
        JSON.stringify({
          message: 'Reminder send will be retried',
          reminderId,
          clinicId: reminder.clinicId,
          channel: reminder.channel,
          attemptsMade: attempt.attemptsMade,
          failureReason,
        }),
      );
      throw new TransientReminderSendError(reminderId, failureReason, attempt.attemptsMade);
    }

    // Keep the provider's own code when it gave one. A row that reads EMAIL_NOT_CONFIGURED tells an
    // operator exactly what to change; SEND_FAILED sends them to the logs to find out.
    await step(() =>
      this.failReminder(reminder, failureReason, 'REMINDER.SEND_FAILED', { from: 'SENDING' }),
    );
  }

  /**
   * Record reminders whose send outcome nobody knows (#164).
   *
   * A row still SENDING well after its claim belongs to a worker that died, or that sent the
   * message and then could not record it. Either way the message may or may not have reached the
   * patient. It is marked FAILED with SEND_OUTCOME_UNKNOWN so an operator sees it and decides,
   * and it is never resent from here. If the original worker does record SENT afterwards, that
   * still wins: see `recordSent`.
   *
   * Runs under system context: it crosses clinics, and touches nothing but these rows.
   */
  async reconcileStaleSends(now: Date = new Date()): Promise<number> {
    const staleBefore = new Date(now.getTime() - REMINDER_SEND_STALE_AFTER_MS);
    const stale = await this.prisma.reminder.findMany({
      where: {
        status: 'SENDING',
        OR: [{ sendingStartedAt: { lt: staleBefore } }, { sendingStartedAt: null }],
      },
      select: { id: true, clinicId: true, sendingStartedAt: true },
      orderBy: { sendingStartedAt: 'asc' },
      take: REMINDER_RECONCILE_BATCH,
    });

    let reconciled = 0;
    for (const row of stale) {
      const marked = await this.prisma.reminder.updateMany({
        where: { id: row.id, status: 'SENDING' },
        data: { status: 'FAILED', failureReason: SEND_OUTCOME_UNKNOWN },
      });
      if (marked.count === 0) continue;
      reconciled += 1;
      await this.auditService.logWrite({
        clinicId: row.clinicId,
        actorUserId: SYSTEM_ACTOR_USER_ID,
        action: 'REMINDER.OUTCOME_UNKNOWN',
        entityType: 'Reminder',
        entityId: row.id,
        beforeJson: JSON.stringify({ status: 'SENDING', sendingStartedAt: row.sendingStartedAt }),
        afterJson: JSON.stringify({ status: 'FAILED', failureReason: SEND_OUTCOME_UNKNOWN }),
      });
      this.logger.warn(
        JSON.stringify({
          message: 'Reminder send outcome unknown; recorded for an operator',
          reminderId: row.id,
          clinicId: row.clinicId,
        }),
      );
    }
    return reconciled;
  }

  /**
   * Re-queue reminders that are past their time with no job behind them (#165).
   *
   * The safety net for any way a job is lost: one that completed before its time under an older
   * worker, a Redis flush, a queue outage after the row was written. A reminder whose job is still
   * waiting, delayed or running is left alone, so this never adds a second run of a live one.
   * Each re-queued job carries its own clinic, exactly as `queueReminder` built the first, so the
   * worker runs it under that clinic's context.
   *
   * @param step Reads the overdue rows under the sweep's system context. Redis is asked outside
   * any transaction.
   */
  async requeueOverdue(step: JobStep, now: Date = new Date()): Promise<number> {
    const overdue = await step(() =>
      this.prisma.reminder.findMany({
        where: {
          status: 'QUEUED',
          scheduledAt: { lt: new Date(now.getTime() - REMINDER_OVERDUE_GRACE_MS) },
        },
        select: { id: true, clinicId: true, scheduledAt: true },
        orderBy: { scheduledAt: 'asc' },
        take: REMINDER_RECONCILE_BATCH,
      }),
    );

    let requeued = 0;
    for (const row of overdue) {
      const jobId = this.getReminderJobId(row.id);
      const job = await this.reminderQueue.getJob(jobId);
      const state = job ? await job.getState() : null;
      if (state && LIVE_JOB_STATES.has(state)) continue;
      // BullMQ ignores an add under an id it still holds, finished or not.
      await job?.remove();
      await this.queueReminder(row.id, row.scheduledAt, row.clinicId);
      requeued += 1;
      this.logger.warn(
        JSON.stringify({
          message: 'Overdue reminder had no live job; re-queued',
          reminderId: row.id,
          clinicId: row.clinicId,
          previousJobState: state ?? 'missing',
          overdueByMs: now.getTime() - row.scheduledAt.getTime(),
        }),
      );
    }
    return requeued;
  }

  /**
   * Step 1 of `processReminder`: decide whether this reminder should go, and if so take it.
   * Returns null when there is nothing for this worker to send.
   */
  private async claimForSend(
    reminderId: string,
  ): Promise<
    { reminder: ReminderToSend; message: ReminderMessage } | { notDueUntil: Date } | null
  > {
    // Stands down cheaply when another delivery of this job is deciding the same row. The claim
    // below is what actually makes the send exclusive.
    if (!(await tryLockForTransaction(this.prisma, `reminder-send:${reminderId}`))) return null;

    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { clinic: true, patient: true, appointment: true },
    });
    if (!reminder || reminder.status !== 'QUEUED') return null;
    if (reminder.scheduledAt > new Date()) return { notDueUntil: reminder.scheduledAt };

    const payload = JSON.parse(reminder.payloadJson) as Record<string, unknown>;
    const appointmentSuppressionReason = await this.getAppointmentSendSuppressionReason(
      reminder,
      payload,
    );
    if (appointmentSuppressionReason) {
      await this.failReminder(reminder, appointmentSuppressionReason, 'REMINDER.SUPPRESS');
      return null;
    }

    if (reminder.channel === 'EMAIL' && !this.emailProvider) {
      // Never fall through to SMS here. This branch used to send the SMS body to an
      // email address, which delivered a stripped message and recorded it as a success.
      await this.failReminder(reminder, EMAIL_CHANNEL_UNAVAILABLE, 'REMINDER.SEND_FAILED');
      return null;
    }

    let message: ReminderMessage;
    try {
      message = this.buildMessage(reminder.templateKey, payload);
    } catch (err) {
      // An unknown template is a deploy problem, not a transient send failure, and it
      // must not be recorded as a generic SEND_FAILED that nobody can act on.
      this.logger.error(
        JSON.stringify({
          message: 'Reminder template could not be rendered',
          reminderId,
          templateKey: reminder.templateKey,
          error: redactLogValue(err),
        }),
      );
      await this.failReminder(
        reminder,
        `${TEMPLATE_NOT_FOUND}:${reminder.templateKey}`.slice(0, 255),
        'REMINDER.SEND_FAILED',
      );
      return null;
    }

    const claimed = await this.prisma.reminder.updateMany({
      where: { id: reminderId, status: 'QUEUED' },
      data: { status: 'SENDING', sendingStartedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    return { reminder, message };
  }

  /**
   * Step 3 of `processReminder` on success.
   *
   * Also accepts a row the sweep already marked SEND_OUTCOME_UNKNOWN: the provider has confirmed
   * the message went, which is better than not knowing.
   */
  private async recordSent(reminder: ReminderToSend, providerMessageId: string): Promise<void> {
    const sentAt = new Date();
    const recorded = await this.prisma.reminder.updateMany({
      where: {
        id: reminder.id,
        OR: [{ status: 'SENDING' }, { status: 'FAILED', failureReason: SEND_OUTCOME_UNKNOWN }],
      },
      data: { status: 'SENT', sentAt, providerMessageId, failureReason: null },
    });
    if (recorded.count === 0) {
      this.logger.warn(
        JSON.stringify({
          message: 'Reminder was sent but its row had moved on; SENT not recorded',
          reminderId: reminder.id,
          clinicId: reminder.clinicId,
          providerMessageId,
        }),
      );
      return;
    }
    await this.auditService.logWrite({
      clinicId: reminder.clinicId,
      actorUserId: SYSTEM_ACTOR_USER_ID,
      action: 'REMINDER.SENT',
      entityType: 'Reminder',
      entityId: reminder.id,
      afterJson: JSON.stringify({ status: 'SENT', sentAt, providerMessageId }),
    });
  }

  /** Hand a claimed reminder back to the queue after a send that certainly did not go. */
  private async releaseClaim(reminderId: string): Promise<void> {
    await this.prisma.reminder.updateMany({
      where: { id: reminderId, status: 'SENDING' },
      data: { status: 'QUEUED', sendingStartedAt: null },
    });
  }

  async findReminderClinicId(reminderId: string): Promise<string | null> {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { clinicId: true },
    });

    return reminder?.clinicId ?? null;
  }

  private async scheduleAppointmentReminderRecord(
    params: ScheduleAppointmentReminderRecordParams,
  ): Promise<void> {
    const scheduledAt = this.getAppointmentReminderTime(params.startsAt);
    const payloadJson = JSON.stringify({
      patientCode: params.patientCode,
      clinicName: params.clinicName,
      timezone: params.clinicTimezone ?? DEFAULT_TIMEZONE,
      startsAt: params.startsAt.toISOString(),
      patientId: params.patientId,
      appointmentId: params.appointmentId,
    });

    const reminder = await this.prisma.reminder.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        appointmentId: params.appointmentId,
        channel: params.channel,
        toAddress: params.toAddress,
        templateKey: APPOINTMENT_TEMPLATE_KEY,
        payloadJson,
        scheduledAt,
        status: params.status,
        failureReason: params.failureReason,
      },
    });

    await this.auditReminderCreate(params.clinicId, params.actorUserId, reminder, params.requestId);
    if (params.status === 'QUEUED') {
      await this.queueReminder(reminder.id, scheduledAt, params.clinicId);
    }
  }

  private async getAppointmentSendSuppressionReason(
    reminder: {
      clinicId: string | null;
      templateKey: string;
      appointmentId: string | null;
      appointment?: { id: string; status: string; startsAt: Date } | null;
    },
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    if (reminder.templateKey !== APPOINTMENT_TEMPLATE_KEY) {
      return null;
    }

    const payloadAppointmentId =
      typeof payload.appointmentId === 'string' ? payload.appointmentId : null;
    const appointmentId = reminder.appointmentId ?? payloadAppointmentId;
    if (!appointmentId) {
      return APPOINTMENT_NOT_FOUND;
    }

    const appointment =
      reminder.appointment ??
      (await this.prisma.appointment.findFirst({
        // Appointments are always clinic-scoped, so a row without a clinic cannot be
        // referring to one. Narrowing here keeps the lookup from silently widening to
        // every clinic if a malformed row ever reaches this path.
        where: reminder.clinicId
          ? { id: appointmentId, clinicId: reminder.clinicId }
          : { id: appointmentId },
        select: { id: true, status: true, startsAt: true },
      }));
    if (!appointment) {
      return APPOINTMENT_NOT_FOUND;
    }
    if (appointment.status !== 'CONFIRMED') {
      return `${APPOINTMENT_NOT_CONFIRMED}:${appointment.status}`;
    }

    const payloadStartsAt =
      typeof payload.startsAt === 'string' ? new Date(payload.startsAt) : null;
    if (!payloadStartsAt || Number.isNaN(payloadStartsAt.getTime())) {
      return APPOINTMENT_RESCHEDULED;
    }
    if (payloadStartsAt.getTime() !== appointment.startsAt.getTime()) {
      return APPOINTMENT_RESCHEDULED;
    }

    return null;
  }

  /**
   * @param options.from The status the row must still be in. After a send, the row must still be
   * SENDING: if the sweep has already recorded it, that record stands.
   */
  private async failReminder(
    reminder: { id: string; clinicId: string | null },
    failureReason: string,
    action: 'REMINDER.SEND_FAILED' | 'REMINDER.SUPPRESS',
    options: { from?: ReminderStatus } = {},
  ): Promise<void> {
    if (options.from) {
      const failed = await this.prisma.reminder.updateMany({
        where: { id: reminder.id, status: options.from },
        data: { status: 'FAILED', failureReason },
      });
      if (failed.count === 0) return;
    } else {
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: 'FAILED', failureReason },
      });
    }
    await this.auditService.logWrite({
      clinicId: reminder.clinicId,
      actorUserId: SYSTEM_ACTOR_USER_ID,
      action,
      entityType: 'Reminder',
      entityId: reminder.id,
      afterJson: JSON.stringify({ status: 'FAILED', failureReason }),
    });
  }

  /**
   * Reduce a provider result to a stable code safe to persist and display.
   *
   * `failureReason` is VarChar(255) and is rendered straight to operators, so anything
   * unrecognised collapses to the generic code rather than leaking provider prose.
   */
  private normalizeFailureReason(error: string | undefined): string {
    if (!error) return REMINDER_SEND_FAILED;
    return /^[A-Z0-9_]{1,64}$/.test(error) ? error : REMINDER_SEND_FAILED;
  }

  private getAppointmentReminderTime(startsAt: Date) {
    const target = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
    return target > new Date() ? target : new Date();
  }

  private async queueReminder(reminderId: string, scheduledAt: Date, clinicId: string | null) {
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
    await this.reminderQueue.add(
      'send',
      // `scope` states whether the missing clinic is deliberate. Without it the worker
      // cannot tell a genuinely global notification from a legacy payload, and would
      // discard the former while trying to resolve a tenant that does not exist.
      clinicId
        ? { reminderId, clinicId, userId: null, scope: 'clinic' as const }
        : { reminderId, userId: null, scope: 'global' as const },
      {
        jobId: this.getReminderJobId(reminderId),
        delay: delayMs,
        attempts: REMINDER_SEND_ATTEMPTS,
        backoff: REMINDER_BACKOFF,
      },
    );
  }

  private async removeQueuedReminderJob(reminderId: string): Promise<void> {
    try {
      const job = await this.reminderQueue.getJob(this.getReminderJobId(reminderId));
      await job?.remove();
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          message: 'Unable to remove queued reminder job',
          reminderId,
          error: redactLogValue(err),
        }),
      );
    }
  }

  /**
   * The deterministic job id a reminder is queued under, so suppression can find and remove it.
   *
   * Separated by a hyphen, not a colon: BullMQ builds its Redis keys around `:` and rejects a
   * custom id containing one. It threw on every scheduled reminder, which surfaced as a 500 from
   * appointment confirmation and reschedule and from follow-up scheduling, after the reminder row
   * had already been written.
   */
  private getReminderJobId(reminderId: string): string {
    return `reminder-${reminderId}`;
  }

  private async auditReminderCreate(
    clinicId: string | null,
    actorUserId: string,
    reminder: Record<string, unknown>,
    requestId?: string,
  ) {
    await this.auditService.logWrite({
      clinicId,
      actorUserId,
      action: 'REMINDER.CREATE',
      entityType: 'Reminder',
      entityId: reminder.id as string,
      afterJson: JSON.stringify(reminder),
      requestId,
    });
  }

  private buildMessage(templateKey: string, payload: Record<string, unknown>): ReminderMessage {
    const rendered = renderMessage(templateKey, payload);
    return {
      subject: rendered.subject,
      // Falls back to the subject only for templates that are email-only; the reminder
      // templates both define an SMS body, and an EMAIL row never reads this.
      smsBody: rendered.smsBody ?? rendered.text,
      emailHtml: rendered.html,
      emailText: rendered.text,
    };
  }
}
