import { Injectable } from '@nestjs/common';
import { Encounter, EncounterStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type QueueStage = 'DRAFT' | 'REVIEW' | 'DOCTOR_READY' | 'PRECEPTOR';

export interface EncounterFindManyFilters {
  skip?: number;
  take?: number;
  status?: EncounterStatus;
  stage?: QueueStage;
}

@Injectable()
export class EncounterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.EncounterCreateInput): Promise<Encounter> {
    return this.prisma.encounter.create({ data });
  }

  async findById(id: string, include?: Prisma.EncounterInclude): Promise<Encounter | null> {
    return this.prisma.encounter.findUnique({
      where: { id },
      include,
    });
  }

  async findManyByClinic(
    clinicId: string,
    filters: EncounterFindManyFilters = {},
  ): Promise<Encounter[]> {
    const where: Prisma.EncounterWhereInput = { clinicId };
    if (filters.status) where.status = filters.status;
    if (filters.stage) {
      switch (filters.stage) {
        case 'DRAFT':
          where.status = 'DRAFT';
          break;
        case 'REVIEW':
        case 'PRECEPTOR':
          where.status = 'IN_REVIEW';
          where.preceptorReviewedById = null;
          break;
        case 'DOCTOR_READY':
          where.status = 'IN_REVIEW';
          where.preceptorReviewedById = { not: null };
          where.doctorFinalizedById = null;
          break;
      }
    }
    const include =
      filters.stage || filters.status
        ? { patient: true, vitals: true, hypertensionAssessment: true, diabetesScreening: true }
        : undefined;
    return this.prisma.encounter.findMany({
      where,
      include,
      skip: filters.skip,
      take: filters.take ?? 50,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findManyByPatient(
    patientId: string,
    filters: EncounterFindManyFilters = {},
  ): Promise<Encounter[]> {
    const where: Prisma.EncounterWhereInput = { patientId };
    if (filters.status) where.status = filters.status;
    return this.prisma.encounter.findMany({
      where,
      skip: filters.skip,
      take: filters.take ?? 50,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async submitForReview(id: string): Promise<Encounter> {
    return this.prisma.encounter.update({
      where: { id },
      data: { status: 'IN_REVIEW' },
    });
  }

  async setPreceptorReviewed(id: string, userId: string): Promise<Encounter> {
    return this.prisma.encounter.update({
      where: { id },
      data: { preceptorReviewedBy: { connect: { id: userId } } },
    });
  }

  async setDoctorFinalized(id: string, userId: string): Promise<Encounter> {
    return this.prisma.encounter.update({
      where: { id },
      data: {
        status: 'FINALIZED',
        doctorFinalizedBy: { connect: { id: userId } },
      },
    });
  }
}
