import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffFeedbackReplayPayload } from './dto/staff-feedback.dto';

// shortcut: the list returns the newest 1000 and the screen filters them; page it if a clinic
// ever reports more than that within the retention window.
const LIST_LIMIT = 1000;

/**
 * Problems staff report from inside the app (#422).
 *
 * Reports arrive only through the sync outbox, so one sent offline and one sent online take the
 * same path. Nothing here logs the report or hands it to Sentry: the text may hold patient detail.
 */
@Injectable()
export class StaffFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores the report once; a replay of the same id is already done. */
  async submit(
    clinicId: string,
    userId: string,
    id: string,
    payload: StaffFeedbackReplayPayload,
  ): Promise<void> {
    const { route, role, version, online, outboxSize, occurredAt } = payload.context;
    try {
      await this.prisma.staffFeedback.create({
        data: {
          id,
          clinicId,
          userId,
          category: payload.category,
          text: payload.text?.trim() || null,
          stationKind: payload.stationKind ?? null,
          context: { route, role, version: version ?? null, online, outboxSize, occurredAt },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  async list(clinicId: string) {
    const rows = await this.prisma.staffFeedback.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      include: { user: { select: { id: true, displayName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      text: row.text,
      stationKind: row.stationKind,
      context: row.context,
      createdAt: row.createdAt.toISOString(),
      reporter: row.user,
    }));
  }
}
