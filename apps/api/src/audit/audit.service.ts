import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface LogWriteParams {
  clinicId: string | null;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logWrite(params: LogWriteParams): Promise<void> {
    const requestId = params.requestId ?? randomUUID();
    await this.prisma.auditEvent.create({
      data: {
        clinicId: params.clinicId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeJson: params.beforeJson ?? undefined,
        afterJson: params.afterJson ?? undefined,
        requestId,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    });
  }

  async list(params: {
    clinicId: string;
    from?: Date;
    to?: Date;
    action?: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    items: Array<{
      id: string;
      createdAt: Date;
      actorUserId: string;
      actorDisplayName: string;
      action: string;
      entityType: string;
      entityId: string;
      requestId: string | null;
      clinicId: string | null;
    }>;
    nextCursor: string | null;
  }> {
    const limit = Math.min(params.limit ?? 50, 200);
    const decoded = params.cursor ? this.decodeCursor(params.cursor) : null;

    const where: {
      clinicId: string;
      createdAt?: { gte?: Date; lte?: Date };
      action?: string;
      actorUserId?: string;
      entityType?: string;
      entityId?: string;
      requestId?: string;
      OR?: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
    } = { clinicId: params.clinicId };

    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }
    if (params.action) where.action = params.action;
    if (params.actorUserId) where.actorUserId = params.actorUserId;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.requestId) where.requestId = params.requestId;

    if (decoded) {
      where.OR = [
        { createdAt: { lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { lt: decoded.id } },
      ];
    }

    const events = await this.prisma.auditEvent.findMany({
      where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        actor: { select: { id: true, displayName: true } },
      },
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null;

    return {
      items: items.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        actorUserId: e.actorUserId,
        actorDisplayName: e.actor.displayName,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        requestId: e.requestId,
        clinicId: e.clinicId,
      })),
      nextCursor,
    };
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
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

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id }),
      'utf-8',
    ).toString('base64');
  }
}
