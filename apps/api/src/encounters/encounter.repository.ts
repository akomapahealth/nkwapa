import { Injectable } from '@nestjs/common';
import { Encounter, EncounterStatus, HypertensionClassification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type QueueStage = 'DRAFT' | 'REVIEW' | 'DOCTOR_READY' | 'PRECEPTOR';

export interface EncounterFindManyFilters {
  skip?: number;
  take?: number;
  status?: EncounterStatus;
  stage?: QueueStage;
  /** Patient first name, last name, code or code alias, case-insensitive (#340). */
  search?: string;
  bpClassification?: HypertensionClassification;
  glucoseFlagged?: boolean;
  /** Inclusive UTC instants; the service turns clinic-local days into these. */
  createdFrom?: Date;
  createdTo?: Date;
}

/** The queue's high-glucose rule, in mg/dL: the one copy, read by the filter and each row. */
export const GLUCOSE_FLAG_MG_DL = { FASTING: 126, RANDOM: 200 } as const;

const glucoseFlagWhere: Prisma.DiabetesScreeningWhereInput = {
  OR: [
    { glucoseType: 'FASTING', glucoseMgDl: { gte: GLUCOSE_FLAG_MG_DL.FASTING } },
    { glucoseType: 'RANDOM', glucoseMgDl: { gte: GLUCOSE_FLAG_MG_DL.RANDOM } },
  ],
};

export function isGlucoseFlagged(
  screening: { glucoseMgDl: number | null; glucoseType: string } | null | undefined,
): boolean {
  if (screening?.glucoseMgDl == null) return false;
  const threshold =
    GLUCOSE_FLAG_MG_DL[screening.glucoseType as keyof typeof GLUCOSE_FLAG_MG_DL] ?? null;
  return threshold !== null && screening.glucoseMgDl >= threshold;
}

function clinicEncounterWhere(
  clinicId: string,
  filters: Omit<EncounterFindManyFilters, 'skip' | 'take'>,
): Prisma.EncounterWhereInput {
  // Every filter is AND-ed with the clinic scope: it can only narrow this clinic's encounters.
  const where: Prisma.EncounterWhereInput = { clinicId };
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    const s = filters.search;
    // shortcut: `contains` + insensitive skips the (lastName, firstName) index; fine at pilot
    // volume, revisit (pg_trgm) once a clinic passes a few thousand open visits.
    where.patient = {
      OR: [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { patientCode: { contains: s, mode: 'insensitive' } },
        { codeAliases: { some: { code: { contains: s, mode: 'insensitive' } } } },
      ],
    };
  }
  if (filters.bpClassification) {
    where.hypertensionAssessment = { is: { classification: filters.bpClassification } };
  }
  if (filters.glucoseFlagged === true) where.diabetesScreening = { is: glucoseFlagWhere };
  if (filters.glucoseFlagged === false) where.NOT = { diabetesScreening: { is: glucoseFlagWhere } };
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = { gte: filters.createdFrom, lte: filters.createdTo };
  }
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
  return where;
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
  ): Promise<Array<Encounter & { glucoseFlagged?: boolean }>> {
    const queue = Boolean(filters.stage || filters.status);
    const rows = await this.prisma.encounter.findMany({
      where: clinicEncounterWhere(clinicId, filters),
      include: queue
        ? { patient: true, vitals: true, hypertensionAssessment: true, diabetesScreening: true }
        : undefined,
      skip: filters.skip,
      take: filters.take ?? 50,
      orderBy: { updatedAt: 'desc' },
    });
    if (!queue) return rows;
    return rows.map((row) => ({
      ...row,
      glucoseFlagged: isGlucoseFlagged(
        (row as { diabetesScreening?: Parameters<typeof isGlucoseFlagged>[0] }).diabetesScreening,
      ),
    }));
  }

  /** The same filter as findManyByClinic, counted without its page limit (#307). */
  async countByClinic(clinicId: string, filters: EncounterFindManyFilters = {}): Promise<number> {
    return this.prisma.encounter.count({ where: clinicEncounterWhere(clinicId, filters) });
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
