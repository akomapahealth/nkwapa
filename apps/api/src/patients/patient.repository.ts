import { Injectable } from "@nestjs/common";
import { Patient, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface PatientFindManyFilters {
  primaryClinicId?: string;
  search?: string;
  /** When q matches phone pattern, service sets normalized E.164 for exact match. */
  phoneE164?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class PatientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PatientCreateInput): Promise<Patient> {
    return this.prisma.patient.create({ data });
  }

  async findById(id: string): Promise<Patient | null> {
    return this.prisma.patient.findUnique({
      where: { id },
    });
  }

  async findByPatientCode(patientCode: string): Promise<Patient | null> {
    return this.prisma.patient.findUnique({
      where: { patientCode },
    });
  }

  async findByNationalIdHash(hash: string): Promise<Patient | null> {
    return this.prisma.patient.findUnique({
      where: { nationalIdHash: hash },
    });
  }

  async findMany(filters: PatientFindManyFilters): Promise<Patient[]> {
    const where: Prisma.PatientWhereInput = {};
    if (filters.primaryClinicId) {
      where.primaryClinicId = filters.primaryClinicId;
    }
    if (filters.search || filters.phoneE164) {
      const orConditions: Prisma.PatientWhereInput[] = [];
      if (filters.search) {
        const s = filters.search.trim();
        orConditions.push(
          { firstName: { contains: s, mode: "insensitive" } },
          { lastName: { contains: s, mode: "insensitive" } },
          { patientCode: { contains: s, mode: "insensitive" } }
        );
        if (s.length === 4) {
          orConditions.push({ nationalIdLast4: s });
        }
      }
      if (filters.phoneE164) {
        orConditions.push({ phoneE164: filters.phoneE164 });
      }
      where.OR = orConditions;
    }
    return this.prisma.patient.findMany({
      where,
      skip: filters.skip,
      take: filters.take ?? 50,
      orderBy: { updatedAt: "desc" },
    });
  }
}
