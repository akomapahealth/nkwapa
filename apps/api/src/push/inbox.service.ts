import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReqUser } from '../auth/auth.controller';

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
        },
      }),
      this.unreadCount(user),
    ]);
    const hasMore = items.length > INBOX_PAGE_SIZE;
    const page = hasMore ? items.slice(0, INBOX_PAGE_SIZE) : items;
    return {
      items: page,
      unreadCount,
      nextBefore: hasMore ? page[page.length - 1].updatedAt.toISOString() : null,
    };
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
