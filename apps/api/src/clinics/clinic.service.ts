import { Injectable } from "@nestjs/common";
import { Clinic, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface ResearchSettingsDto {
  researchEnabled: boolean;
  requiresDirectorApprovalEachExport: boolean;
}

export interface CreateClinicDto {
  name: string;
  region?: string;
  countryCode?: string;
}

export interface UpdateClinicDto {
  name?: string;
  region?: string;
  countryCode?: string;
  isActive?: boolean;
}

export interface AdminActor {
  userId: string;
  roles: { clinicId: string | null; role: UserRole }[];
}

@Injectable()
export class ClinicService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Clinic | null> {
    return this.prisma.clinic.findUnique({
      where: { id, isActive: true },
    });
  }

  async findByIdForAdmin(id: string): Promise<Clinic | null> {
    return this.prisma.clinic.findUnique({
      where: { id },
    });
  }

  async findByIds(
    ids: string[]
  ): Promise<{ id: string; name: string; region: string | null }[]> {
    if (ids.length === 0) return [];
    return this.prisma.clinic.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, region: true },
    });
  }

  async getResearchSettings(clinicId: string) {
    const settings = await this.prisma.clinicResearchSettings.findUnique({
      where: { clinicId },
      include: { updatedBy: { select: { displayName: true } } },
    });
    if (!settings) {
      return {
        researchEnabled: false,
        requiresDirectorApprovalEachExport: true,
        updatedAt: null,
        updatedByDisplayName: null,
      };
    }
    return {
      researchEnabled: settings.researchEnabled,
      requiresDirectorApprovalEachExport: settings.requiresDirectorApprovalEachExport,
      updatedAt: settings.updatedAt,
      updatedByDisplayName: settings.updatedBy.displayName,
    };
  }

  async updateResearchSettings(
    clinicId: string,
    dto: ResearchSettingsDto,
    updatedByUserId: string
  ) {
    return this.prisma.clinicResearchSettings.upsert({
      where: { clinicId },
      create: {
        clinicId,
        researchEnabled: dto.researchEnabled,
        requiresDirectorApprovalEachExport: dto.requiresDirectorApprovalEachExport,
        updatedByUserId,
      },
      update: {
        researchEnabled: dto.researchEnabled,
        requiresDirectorApprovalEachExport: dto.requiresDirectorApprovalEachExport,
        updatedByUserId,
      },
    });
  }

  async listAllForAdmin(actor: AdminActor): Promise<Clinic[]> {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
    if (isSystemAdmin) {
      return this.prisma.clinic.findMany({
        orderBy: { name: "asc" },
      });
    }
    const directorClinicIds = actor.roles
      .filter((r) => r.role === UserRole.DIRECTOR && r.clinicId != null)
      .map((r) => r.clinicId as string);
    if (directorClinicIds.length === 0) return [];
    return this.prisma.clinic.findMany({
      where: { id: { in: directorClinicIds } },
      orderBy: { name: "asc" },
    });
  }

  async create(dto: CreateClinicDto): Promise<Clinic> {
    return this.prisma.clinic.create({
      data: {
        name: dto.name,
        region: dto.region ?? null,
        countryCode: dto.countryCode ?? "GH",
      },
    });
  }

  async update(id: string, dto: UpdateClinicDto): Promise<Clinic> {
    return this.prisma.clinic.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.countryCode != null && { countryCode: dto.countryCode }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async canManageClinic(
    actor: AdminActor,
    clinicId: string
  ): Promise<boolean> {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null
    );
    if (isSystemAdmin) return true;
    return actor.roles.some(
      (r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR
    );
  }
}
