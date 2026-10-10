import { Injectable } from '@nestjs/common';
import { Prescription, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrescriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PrescriptionCreateInput): Promise<Prescription> {
    return this.prisma.prescription.create({ data });
  }

  async findById(id: string): Promise<Prescription | null> {
    return this.prisma.prescription.findUnique({ where: { id } });
  }

  async findByIdWithDrug(id: string) {
    return this.prisma.prescription.findUnique({
      where: { id },
      include: { drug: true },
    });
  }

  async update(id: string, data: Prisma.PrescriptionUpdateInput): Promise<Prescription> {
    return this.prisma.prescription.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.prescription.delete({ where: { id } });
  }

  async listByEncounter(encounterId: string) {
    return this.prisma.prescription.findMany({
      where: { encounterId },
      include: { drug: true, prescribedBy: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
