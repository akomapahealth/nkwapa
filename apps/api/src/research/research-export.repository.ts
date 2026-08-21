import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
