import { Inject, Injectable } from "@nestjs/common";
import { ReminderStatus } from "@prisma/client";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const REMINDER_QUEUE_NAME = "reminders";

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

export interface ScheduleFollowUpNoContactParams {
  clinicId: string;
  patientId: string;
  patientCode: string;
  encounterId: string;
  followUpDate: Date;
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
  }>;
  nextCursor: string | null;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
    const createdAt = new Date(parsed.createdAt);
    if (isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf-8"
  ).toString("base64");
}

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject("SmsProvider") private readonly smsProvider: { send(to: string, body: string): Promise<{ success: boolean; providerMessageId?: string; error?: string }> },
    @InjectQueue(REMINDER_QUEUE_NAME) private readonly reminderQueue: Queue
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
        channel: "SMS",
        toAddress: params.phoneE164,
        templateKey: "FOLLOWUP_REMINDER_V1",
        payloadJson,
        scheduledAt: params.followUpDate,
        status: "QUEUED",
      },
    });

    await this.auditService.logWrite({
      clinicId: params.clinicId,
      actorUserId: params.actorUserId,
      action: "REMINDER.CREATE",
      entityType: "Reminder",
      entityId: reminder.id,
      afterJson: JSON.stringify(reminder),
      requestId: params.requestId,
    });

    await this.reminderQueue.add("send", { reminderId: reminder.id });
  }

  async scheduleFollowUpReminderNoContact(
    params: ScheduleFollowUpNoContactParams
  ): Promise<void> {
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
        channel: "SMS",
        toAddress: "N/A",
        templateKey: "FOLLOWUP_REMINDER_V1",
        payloadJson,
        scheduledAt: params.followUpDate,
        status: "FAILED",
        failureReason: "NO_CONTACT_METHOD",
      },
    });

    await this.auditService.logWrite({
      clinicId: params.clinicId,
      actorUserId: params.actorUserId,
      action: "REMINDER.CREATE",
      entityType: "Reminder",
      entityId: reminder.id,
      afterJson: JSON.stringify(reminder),
      requestId: params.requestId,
    });
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = reminders.length > limit;
    const items = hasMore ? reminders.slice(0, limit) : reminders;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(last.createdAt, last.id)
        : null;

    return {
      items: items.map((r) => ({
        id: r.id,
        clinicId: r.clinicId,
        patientId: r.patientId,
        encounterId: r.encounterId,
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
      })),
      nextCursor,
    };
  }

  async processReminder(reminderId: string): Promise<void> {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { clinic: true, patient: true },
    });
    if (!reminder || reminder.status !== "QUEUED") return;
    if (reminder.scheduledAt > new Date()) return;

    const payload = JSON.parse(reminder.payloadJson) as Record<string, unknown>;
    const body = `Follow-up reminder for ${payload.patientCode ?? "patient"}: please return on ${payload.followUpDate ?? "scheduled date"}.`;

    try {
      const result = await this.smsProvider.send(reminder.toAddress, body);
      if (result.success && result.providerMessageId) {
        await this.prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerMessageId: result.providerMessageId,
          },
        });
        await this.auditService.logWrite({
          clinicId: reminder.clinicId,
          actorUserId: "system",
          action: "REMINDER.SENT",
          entityType: "Reminder",
          entityId: reminderId,
          afterJson: JSON.stringify({
            status: "SENT",
            sentAt: new Date(),
            providerMessageId: result.providerMessageId,
          }),
        });
      } else {
        await this.prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: "FAILED",
            failureReason: result.error ?? "SEND_FAILED",
          },
        });
        await this.auditService.logWrite({
          clinicId: reminder.clinicId,
          actorUserId: "system",
          action: "REMINDER.SEND_FAILED",
          entityType: "Reminder",
          entityId: reminderId,
          afterJson: JSON.stringify({
            status: "FAILED",
            failureReason: result.error ?? "SEND_FAILED",
          }),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: "FAILED", failureReason: msg },
      });
      await this.auditService.logWrite({
        clinicId: reminder.clinicId,
        actorUserId: "system",
        action: "REMINDER.SEND_FAILED",
        entityType: "Reminder",
        entityId: reminderId,
        afterJson: JSON.stringify({ status: "FAILED", failureReason: msg }),
      });
    }
  }
}
