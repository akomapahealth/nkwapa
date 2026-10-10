import { Injectable } from '@nestjs/common';
import { Prisma, ResearchExportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decodeJsonKeysetCursor, encodeJsonKeysetCursor } from '../common/keyset-cursor';

export const researchExportInclude = {
  requestedBy: { select: { id: true, displayName: true } },
  approvedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.ResearchExportInclude;

export type ResearchExportRecord = Prisma.ResearchExportGetPayload<{
  include: typeof researchExportInclude;
}>;

@Injectable()
export class ResearchExportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ResearchExportCreateInput): Promise<ResearchExportRecord> {
    return this.prisma.researchExport.create({
      data,
      include: researchExportInclude,
    });
  }

  async findById(id: string): Promise<ResearchExportRecord | null> {
    return this.prisma.researchExport.findUnique({
      where: { id },
      include: researchExportInclude,
    });
  }

  async update(id: string, data: Prisma.ResearchExportUpdateInput): Promise<ResearchExportRecord> {
    return this.prisma.researchExport.update({
      where: { id },
      data,
      include: researchExportInclude,
    });
  }

  /**
   * Move an export from one status to another only if it is still in the first, and return it.
   * Null when another worker, or the reconciliation sweep, got there first.
   */
  async transition(
    id: string,
    from: ResearchExportStatus,
    data: Prisma.ResearchExportUpdateManyMutationInput,
  ): Promise<ResearchExportRecord | null> {
    const moved = await this.prisma.researchExport.updateMany({
      where: { id, status: from },
      data,
    });
    if (moved.count === 0) return null;
    return this.findById(id);
  }

  /** Exports a worker claimed and never finished, oldest first, across every clinic it can see. */
  async findStaleProcessing(startedBefore: Date, take: number) {
    return this.prisma.researchExport.findMany({
      where: {
        status: 'PROCESSING',
        OR: [{ startedAt: { lt: startedBefore } }, { startedAt: null }],
      },
      select: { id: true, clinicId: true, repoPath: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
      take,
    });
  }

  async listByClinic(
    clinicId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: ResearchExportRecord[]; nextCursor: string | null }> {
    const take = Math.min(limit, 100);
    const where: Prisma.ResearchExportWhereInput = { clinicId };

    if (cursor) {
      const decoded = decodeJsonKeysetCursor('requestedAt', cursor);
      if (decoded) {
        where.OR = [
          { requestedAt: { lt: decoded.timestamp } },
          { requestedAt: decoded.timestamp, id: { lt: decoded.id } },
        ];
      }
    }

    const items = await this.prisma.researchExport.findMany({
      where,
      take: take + 1,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      include: researchExportInclude,
    });

    const hasMore = items.length > take;
    const result = hasMore ? items.slice(0, take) : items;
    const last = result[result.length - 1];
    const nextCursor =
      hasMore && last ? encodeJsonKeysetCursor('requestedAt', last.requestedAt, last.id) : null;

    return { items: result, nextCursor };
  }
}
