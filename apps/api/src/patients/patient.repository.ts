import { Injectable } from '@nestjs/common';
import { GhanaRegion, Patient, PatientLocationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PatientFindManyFilters {
  primaryClinicId?: string;
  search?: string;
  /** When q matches phone pattern, service sets normalized E.164 for exact match. */
  phoneE164?: string;
  /** Residential location filters, AND-ed within the clinic scope. */
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialLocationStatus?: PatientLocationStatus;
  cursor?: string;
  skip?: number;
  take?: number;
  includeMerged?: boolean;
}

@Injectable()
export class PatientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PatientCreateInput): Promise<Patient> {
    return this.prisma.patient.create({ data });
  }

  /**
   * A chart by id, optionally following a merge to the record that survived it.
   *
   * Iterative, and it remembers where it has been. `mergedIntoPatientId` is a pointer read out
   * of a column rather than a value this process computed, and a restored backup, a hand-run
   * correction or a future merge path can leave a loop in it. Recursing a loop exhausts the heap
   * and takes the whole API process down with it, so a chart already seen ends the walk and is
   * returned as itself: one bad row then costs one odd answer instead of every request in flight.
   *
   * A pointer into a chart that no longer exists still resolves to null, as it always did.
   */
  async findById(id: string, options?: { resolveMerged?: boolean }): Promise<Patient | null> {
    const seen = new Set<string>();
    let current = await this.prisma.patient.findUnique({ where: { id } });

    while (current !== null && options?.resolveMerged === true && current.mergedIntoPatientId) {
      if (seen.has(current.id)) {
        return current;
      }
      seen.add(current.id);
      current = await this.prisma.patient.findUnique({
        where: { id: current.mergedIntoPatientId },
      });
    }

    return current;
  }

  /**
   * A chart by any code it has ever answered to, resolved to the record that survived.
   *
   * Two ways in: the code a chart still holds, and the alias a merge left behind for a code it
   * gave up. Both have to end at a live chart. The alias branch used to hand back whatever the
   * join found, so a code merged twice -- A into B, then B into C -- answered with B: a
   * tombstone carrying no history, indistinguishable to the caller from a live chart. Staff
   * searching an old card would land on an empty record and conclude the visit was never
   * written down.
   */
  async findByPatientCode(patientCode: string): Promise<Patient | null> {
    const direct = await this.prisma.patient.findUnique({
      where: { patientCode },
    });
    if (direct) {
      if (direct.mergedIntoPatientId) {
        return this.findById(direct.mergedIntoPatientId, { resolveMerged: true });
      }
      return direct;
    }

    const alias = await this.prisma.patientCodeAlias.findUnique({
      where: { code: patientCode },
      include: {
        patient: true,
      },
    });

    if (!alias) {
      return null;
    }

    return alias.patient.mergedIntoPatientId
      ? this.findById(alias.patient.mergedIntoPatientId, { resolveMerged: true })
      : alias.patient;
  }

  async findByNationalIdHash(hash: string): Promise<Patient | null> {
    return this.prisma.patient.findUnique({
      where: { nationalIdHash: hash },
    });
  }

  async update(id: string, data: Prisma.PatientUpdateInput): Promise<Patient> {
    return this.prisma.patient.update({ where: { id }, data });
  }

  async findMany(filters: PatientFindManyFilters): Promise<Patient[]> {
    const where = this.buildFindManyWhere(filters);
    return this.prisma.patient.findMany({
      where,
      ...(filters.cursor
        ? {
            cursor: { id: filters.cursor },
            skip: 1,
          }
        : {
            skip: filters.skip,
          }),
      take: filters.take ?? 50,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async count(filters: PatientFindManyFilters): Promise<number> {
    return this.prisma.patient.count({
      where: this.buildFindManyWhere(filters),
    });
  }

  private buildFindManyWhere(filters: PatientFindManyFilters): Prisma.PatientWhereInput {
    const where: Prisma.PatientWhereInput = {};
    if (filters.primaryClinicId) {
      where.primaryClinicId = filters.primaryClinicId;
    }
    if (!filters.includeMerged) {
      where.mergedIntoPatientId = null;
    }
    // Residential location filters are AND-ed with the clinic scope above so
    // they can only ever narrow results, never widen them across clinics.
    if (filters.residentialRegion) {
      where.residentialRegion = filters.residentialRegion;
    }
    if (filters.residentialLocationStatus) {
      where.residentialLocationStatus = filters.residentialLocationStatus;
    }
    if (filters.residentialDistrict) {
      where.residentialDistrict = {
        contains: filters.residentialDistrict.trim(),
        mode: 'insensitive',
      };
    }
    if (filters.residentialCommunity) {
      where.residentialCommunity = {
        contains: filters.residentialCommunity.trim(),
        mode: 'insensitive',
      };
    }
    if (filters.search || filters.phoneE164) {
      const orConditions: Prisma.PatientWhereInput[] = [];
      if (filters.search) {
        const s = filters.search.trim();
        orConditions.push(
          { firstName: { contains: s, mode: 'insensitive' } },
          { lastName: { contains: s, mode: 'insensitive' } },
          { patientCode: { contains: s, mode: 'insensitive' } },
          {
            codeAliases: {
              some: {
                code: { contains: s, mode: 'insensitive' },
              },
            },
          },
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
    return where;
  }
}
