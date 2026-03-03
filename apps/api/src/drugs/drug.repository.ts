import { Injectable } from "@nestjs/common";
import { Drug, DrugCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DrugRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DrugCreateInput): Promise<Drug> {
    return this.prisma.drug.create({ data });
  }

  async findById(id: string): Promise<Drug | null> {
    return this.prisma.drug.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.DrugUpdateInput): Promise<Drug> {
    return this.prisma.drug.update({ where: { id }, data });
  }

  async search(
    clinicId: string,
    params: { q?: string; category?: DrugCategory; take?: number }
  ): Promise<Drug[]> {
    const where: Prisma.DrugWhereInput = {
      clinicId,
      isActive: true,
    };
    if (params.category) {
      where.category = params.category;
    }
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: "insensitive" } },
        { genericName: { contains: params.q, mode: "insensitive" } },
      ];
    }
    return this.prisma.drug.findMany({
      where,
      take: params.take ?? 50,
      orderBy: { name: "asc" },
    });
  }
}
