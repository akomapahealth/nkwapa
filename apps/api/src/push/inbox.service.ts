import { Injectable } from '@nestjs/common';
import {
  DOCTOR_REQUEST_VIEW_SELECT,
  toDoctorRequestView,
  type DoctorRequestView,
} from '../ops/doctor-request.service';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReqUser } from '../auth/auth.controller';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { screeningFlagOpenSince, TAKEABLE_KINDS } from '../follow-up/follow-up-flags.service';

/** An urgent flag on a tile (#337): whether "I'm on it" applies, and who took it. */
export interface InboxRiskFlag {
  patientId: string;
  /**
   * The flag can still be taken: an Urgent flag while the patient is Urgent; a screening flag on
   * the day it was raised, until the patient becomes Urgent and their Urgent flag takes over.
   */
  open: boolean;
  acknowledgedBy: { userId: string; displayName: string; at: Date } | null;
}

export const INBOX_PAGE_SIZE = 30;

/**
 * The signed-in person's bell. Row level security already limits every query here to their own
 * rows; the clinic filter on top hides notifications about a clinic they no longer work at.
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  private visible(user: ReqUser): Prisma.InboxNotificationWhereInput {
    const where: Prisma.InboxNotificationWhereInput = { userId: user.user.id };
    // A role with no clinic (system administrator, organisation-wide director) sees every clinic.
    if (user.roles.some((role) => role.clinicId === null)) return where;
    const clinicIds = user.roles.map((role) => role.clinicId as string);
    return { ...where, OR: [{ clinicId: null }, { clinicId: { in: clinicIds } }] };
  }

  async list(user: ReqUser, before?: Date) {
    const where = this.visible(user);
    const [items, unreadCount] = await Promise.all([
      this.prisma.inboxNotification.findMany({
        where: before ? { ...where, updatedAt: { lt: before } } : where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: INBOX_PAGE_SIZE + 1,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          url: true,
          count: true,
          clinicId: true,
          updatedAt: true,
          readAt: true,
          riskFlagId: true,
          doctorRequestId: true,
        },
      }),
      this.unreadCount(user),
    ]);
    const hasMore = items.length > INBOX_PAGE_SIZE;
    const page = hasMore ? items.slice(0, INBOX_PAGE_SIZE) : items;
    const [flags, requests] = await Promise.all([
      this.riskFlags(page.map((item) => item.riskFlagId)),
      this.doctorRequests(page.map((item) => item.doctorRequestId)),
    ]);
    return {
      items: page.map(({ riskFlagId, doctorRequestId, ...item }) => ({
        ...item,
        riskFlag: (riskFlagId && flags.get(riskFlagId)) || null,
        doctorRequest: (doctorRequestId && requests.get(doctorRequestId)) || null,
      })),
      unreadCount,
      nextBefore: hasMore ? page[page.length - 1].updatedAt.toISOString() : null,
    };
  }

  /**
   * The urgent flags behind these tiles. Read as the system: the reader was sent the tile, and a
   * colleague's display name is not otherwise theirs to read. Nothing at all with the flag off.
   */
  private async riskFlags(ids: Array<string | null>): Promise<Map<string, InboxRiskFlag>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0 || !isApiFeatureEnabled('followUpStratification')) return new Map();
    // Detached: this runs inside the reader's own RLS transaction.
    const rows = await this.prisma.detachFromRlsContext(() =>
      this.prisma.withSystemContext(
        { systemReason: 'Show who took an urgent follow-up flag' },
        (tx) =>
          tx.patientRiskFlag.findMany({
            where: { id: { in: wanted }, kind: { in: [...TAKEABLE_KINDS] } },
            select: {
              id: true,
              kind: true,
              raisedAt: true,
              patientId: true,
              patient: { select: { currentRiskTier: true } },
              acknowledgement: {
                select: { userId: true, createdAt: true, user: { select: { displayName: true } } },
              },
            },
          }),
      ),
    );
    const since = screeningFlagOpenSince();
    return new Map(
      rows.map((row) => [
        row.id,
        {
          patientId: row.patientId,
          open:
            row.kind === 'URGENT'
              ? row.patient.currentRiskTier === 'URGENT'
              : row.patient.currentRiskTier !== 'URGENT' && row.raisedAt >= since,
          acknowledgedBy: row.acknowledgement
            ? {
                userId: row.acknowledgement.userId,
                displayName: row.acknowledgement.user.displayName,
                at: row.acknowledgement.createdAt,
              }
            : null,
        },
      ]),
    );
  }

  /** The doctor requests behind these tiles (#418), with who took them. Read as the system, as above. */
  private async doctorRequests(ids: Array<string | null>): Promise<Map<string, DoctorRequestView>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0) return new Map();
    const rows = await this.prisma.detachFromRlsContext(() =>
      this.prisma.withSystemContext({ systemReason: 'Show who took a doctor request' }, (tx) =>
        tx.doctorRequest.findMany({
          where: { id: { in: wanted } },
          select: DOCTOR_REQUEST_VIEW_SELECT,
        }),
      ),
    );
    return new Map(rows.map((row) => [row.id, toDoctorRequestView(row)]));
  }

  unreadCount(user: ReqUser): Promise<number> {
    return this.prisma.inboxNotification.count({ where: { ...this.visible(user), readAt: null } });
  }

  /** Mark some, or with no ids all, of this person's notifications read. */
  async markRead(user: ReqUser, ids?: string[]): Promise<number> {
    const result = await this.prisma.inboxNotification.updateMany({
      where: { ...this.visible(user), readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
