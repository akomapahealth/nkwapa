import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderService } from '../reminders/reminder.service';
import { PERMISSIONS, rolesWithPermission } from '../auth/constants/permissions';
import { resolveAppPublicUrl } from '../notifications/email/email-config';
import { RESEARCH_RUN_ATTENTION_V1 } from '../notifications/templates/research-run';

export interface ResearchRunAttention {
  id: string;
  clinicId: string;
  runKey: string;
  status: 'SKIPPED' | 'FAILED';
  reason: string | null;
}

/**
 * Tells a clinic's directors that a scheduled run was skipped or failed (#166), through the
 * notification ledger, so delivery is visible and retried like any other notice. The message
 * carries the run key and a reason, never data from the run.
 */
@Injectable()
export class ResearchRunNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: ReminderService,
  ) {}

  /** Call inside the run's clinic context. Returns how many directors were notified. */
  async notifyDirectors(run: ResearchRunAttention, actorUserId: string): Promise<number> {
    const [clinic, seats] = await Promise.all([
      this.prisma.clinic.findUnique({ where: { id: run.clinicId }, select: { name: true } }),
      this.prisma.userClinicRole.findMany({
        where: {
          clinicId: run.clinicId,
          role: { in: rolesWithPermission(PERMISSIONS.RESEARCH_EXPORT_APPROVE) },
          user: { isActive: true },
        },
        select: { user: { select: { id: true, email: true } } },
      }),
    ]);
    const directors = new Map(seats.map((seat) => [seat.user.id, seat.user.email]));
    const appUrl = resolveAppPublicUrl();

    for (const [userId, email] of directors) {
      await this.reminders.sendNotificationNow({
        clinicId: run.clinicId,
        recipientType: 'USER',
        recipientUserId: userId,
        toAddress: email,
        templateKey: RESEARCH_RUN_ATTENTION_V1.key,
        payload: {
          clinicName: clinic?.name ?? null,
          runKey: run.runKey,
          outcome: run.status,
          reason: run.reason,
          exportsUrl: appUrl ? `${appUrl}/clinics/${run.clinicId}/research/exports` : null,
        },
        actorUserId,
        requestId: run.runKey,
      });
    }
    return directors.size;
  }
}
