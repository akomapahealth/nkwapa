import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { redactLogValue } from '../common/redaction';

const REMINDER_QUEUE_NAME = 'reminders';
const FOLLOWUP_TEMPLATE_KEY = 'FOLLOWUP_REMINDER_V1';
const APPOINTMENT_TEMPLATE_KEY = 'APPOINTMENT_REMINDER_V1';
const REMINDER_SEND_FAILED = 'SEND_FAILED';
const APPOINTMENT_NOT_FOUND = 'APPOINTMENT_NOT_FOUND';
const APPOINTMENT_NOT_CONFIRMED = 'APPOINTMENT_NOT_CONFIRMED';
const APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED';

export interface ScheduleFollowUpParams {
  clinicId: string;
  clinicName: string;
  patientId: string;
  patientCode: string;
  phoneE164: string;
  encounterId: string;
  followUpDate: Date;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleFollowUpEmailParams {
  clinicId: string;
  clinicName: string;
  patientId: string;
  patientCode: string;
  email: string;
  encounterId: string;
  followUpDate: Date;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleFollowUpNoContactParams {
  clinicId: string;
  patientId: string;
  patientCode: string;
  encounterId: string;
  followUpDate: Date;
  actorUserId: string;
  requestId?: string;
}

export interface ScheduleAppointmentReminderParams {
  clinicId: string;
  clinicName: string;
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

export interface ListRemindersParams {
  clinicId: string;
  status?: ReminderStatus;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface ListRemindersResult {
  items: Array<{
    id: string;
    clinicId: string;
    patientId: string;
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
    createdAt: Date;
    updatedAt: Date;
  }>;
  nextCursor: string | null;
}

type ReminderMessage = {
  subject: string;
  smsBody: string;
  emailHtml: string;
};

type AppointmentReminderChannel = 'SMS' | 'EMAIL';

type ScheduleAppointmentReminderRecordParams = {
  clinicId: string;
  clinicName?: string;
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

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
    const createdAt = new Date(parsed.createdAt);
    if (isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf-8').toString(
    'base64',
  );
}

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private readonly emailTemplates = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject('SmsProvider')
    private readonly smsProvider: {
      send(
        to: string,
        body: string,
      ): Promise<{ success: boolean; providerMessageId?: string; error?: string }>;
    },
    @Optional()
    @Inject('EmailProvider')
    private readonly emailProvider: {
      send(
        to: string,
        subject: string,
        html: string,
      ): Promise<{ success: boolean; providerMessageId?: string; error?: string }>;
    } | null,
    @InjectQueue(REMINDER_QUEUE_NAME) private readonly reminderQueue: Queue,
  ) {}

  async scheduleFollowUpReminder(params: ScheduleFollowUpParams): Promise<void> {
    const payloadJson = JSON.stringify({
      patientCode: params.patientCode,
      clinicName: params.clinicName,
      followUpDate: params.followUpDate.toISOString(),
      patientId: params.patientId,
      encounterId: params.encounterId,
    });

    const reminder = await this.prisma.reminder.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        encounterId: params.encounterId,
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
  }

  async scheduleFollowUpEmailReminder(params: ScheduleFollowUpEmailParams): Promise<void> {
    const payloadJson = JSON.stringify({
      patientCode: params.patientCode,
      clinicName: params.clinicName,
      followUpDate: params.followUpDate.toISOString(),
      patientId: params.patientId,
      encounterId: params.encounterId,
    });

    const reminder = await this.prisma.reminder.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        encounterId: params.encounterId,
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
  }

  async scheduleFollowUpReminderNoContact(params: ScheduleFollowUpNoContactParams): Promise<void> {
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
        channel: 'SMS',
        toAddress: 'N/A',
        templateKey: FOLLOWUP_TEMPLATE_KEY,
        payloadJson,
        scheduledAt: params.followUpDate,
        status: 'FAILED',
        failureReason: 'NO_CONTACT_METHOD',
      },
    });

    await this.auditReminderCreate(params.clinicId, params.actorUserId, reminder, params.requestId);
  }

  async scheduleAppointmentReminder(params: ScheduleAppointmentReminderParams): Promise<void> {
    await this.scheduleAppointmentReminderRecord({
      clinicId: params.clinicId,
      clinicName: params.clinicName,
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
      failureReason: 'NO_CONTACT_METHOD',
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
    const decoded = params.cursor ? decodeCursor(params.cursor) : null;
    const cursorWhere = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { createdAt: decoded.createdAt, id: { lt: decoded.id } },
          ],
        }
      : {};

    const reminders = await this.prisma.reminder.findMany({
      where: {
        clinicId: params.clinicId,
        ...(params.status && { status: params.status }),
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
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

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
      actorUserId: 'system',
      action: 'REMINDER.DELIVERY_UPDATE',
      entityType: 'Reminder',
      entityId: reminder.id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
    });
  }

  async processReminder(reminderId: string): Promise<void> {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { clinic: true, patient: true, appointment: true },
    });
    if (!reminder || reminder.status !== 'QUEUED') return;
    if (reminder.scheduledAt > new Date()) return;

    const payload = JSON.parse(reminder.payloadJson) as Record<string, unknown>;
    const appointmentSuppressionReason = await this.getAppointmentSendSuppressionReason(
      reminder,
      payload,
    );
    if (appointmentSuppressionReason) {
      await this.failReminder(reminder, appointmentSuppressionReason, 'REMINDER.SUPPRESS');
      return;
    }

    try {
      const message = this.buildMessage(reminder.templateKey, payload);
      let result: { success: boolean; providerMessageId?: string; error?: string };

      if (reminder.channel === 'EMAIL' && this.emailProvider) {
        result = await this.emailProvider.send(
          reminder.toAddress,
          message.subject,
          message.emailHtml,
        );
      } else {
        result = await this.smsProvider.send(reminder.toAddress, message.smsBody);
      }

      if (result.success && result.providerMessageId) {
        const sentAt = new Date();
        await this.prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: 'SENT',
            sentAt,
            providerMessageId: result.providerMessageId,
          },
        });
        await this.auditService.logWrite({
          clinicId: reminder.clinicId,
          actorUserId: 'system',
          action: 'REMINDER.SENT',
          entityType: 'Reminder',
          entityId: reminderId,
          afterJson: JSON.stringify({
            status: 'SENT',
            sentAt,
            providerMessageId: result.providerMessageId,
          }),
        });
      } else {
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
        await this.failReminder(reminder, REMINDER_SEND_FAILED, 'REMINDER.SEND_FAILED');
      }
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          message: 'Reminder processing failed',
          reminderId,
          clinicId: reminder.clinicId,
          channel: reminder.channel,
          error: redactLogValue(err),
        }),
      );
      await this.failReminder(reminder, REMINDER_SEND_FAILED, 'REMINDER.SEND_FAILED');
    }
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
      clinicId: string;
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
        where: { id: appointmentId, clinicId: reminder.clinicId },
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

  private async failReminder(
    reminder: { id: string; clinicId: string },
    failureReason: string,
    action: 'REMINDER.SEND_FAILED' | 'REMINDER.SUPPRESS',
  ): Promise<void> {
    await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: 'FAILED', failureReason },
    });
    await this.auditService.logWrite({
      clinicId: reminder.clinicId,
      actorUserId: 'system',
      action,
      entityType: 'Reminder',
      entityId: reminder.id,
      afterJson: JSON.stringify({ status: 'FAILED', failureReason }),
    });
  }

  private getAppointmentReminderTime(startsAt: Date) {
    const target = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
    return target > new Date() ? target : new Date();
  }

  private async queueReminder(reminderId: string, scheduledAt: Date, clinicId: string) {
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
    await this.reminderQueue.add(
      'send',
      { reminderId, clinicId },
      {
        jobId: this.getReminderJobId(reminderId),
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
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

  private getReminderJobId(reminderId: string): string {
    return `reminder:${reminderId}`;
  }

  private async auditReminderCreate(
    clinicId: string,
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
    if (templateKey === FOLLOWUP_TEMPLATE_KEY) {
      const clinicName = (payload.clinicName as string) ?? 'Clinic';
      const patientCode = (payload.patientCode as string) ?? 'patient';
      const followUpDate = this.formatIsoDate(payload.followUpDate as string | undefined);
      return {
        subject: `Follow-Up Reminder - ${clinicName}`,
        smsBody: `Follow-up reminder for ${patientCode}: please return on ${followUpDate}.`,
        emailHtml: this.renderTemplate('followup-reminder.html', {
          patientCode,
          clinicName,
          followUpDate,
        }),
      };
    }

    if (templateKey === APPOINTMENT_TEMPLATE_KEY) {
      const clinicName = (payload.clinicName as string) ?? 'Clinic';
      const patientCode = (payload.patientCode as string) ?? 'patient';
      const startsAt = this.formatIsoDateTime(payload.startsAt as string | undefined);
      return {
        subject: `Appointment Reminder - ${clinicName}`,
        smsBody: `Appointment reminder for ${patientCode}: your appointment is scheduled for ${startsAt}.`,
        emailHtml: this.renderTemplate('appointment-reminder.html', {
          patientCode,
          clinicName,
          startsAt,
        }),
      };
    }

    throw new Error(`Unsupported reminder template: ${templateKey}`);
  }

  private renderTemplate(templateFileName: string, replacements: Record<string, string>): string {
    const template = this.getEmailTemplate(templateFileName);
    return Object.entries(replacements).reduce(
      (html, [key, value]) => html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
      template,
    );
  }

  private getEmailTemplate(templateFileName: string): string {
    const cached = this.emailTemplates.get(templateFileName);
    if (cached) {
      return cached;
    }

    let template: string;
    try {
      template = readFileSync(join(__dirname, 'templates', templateFileName), 'utf-8');
    } catch {
      if (templateFileName === 'appointment-reminder.html') {
        template =
          '<p>Appointment reminder for {{patientCode}} at {{clinicName}} on {{startsAt}}.</p>';
      } else {
        template =
          '<p>Follow-up reminder for {{patientCode}} at {{clinicName}}. Please return on {{followUpDate}}.</p>';
      }
    }

    this.emailTemplates.set(templateFileName, template);
    return template;
  }

  private formatIsoDate(value?: string) {
    if (!value) return 'scheduled date';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
  }

  private formatIsoDateTime(value?: string) {
    if (!value) return 'scheduled time';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  }
}
