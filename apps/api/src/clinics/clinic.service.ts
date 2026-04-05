import { Injectable } from '@nestjs/common';
import { Clinic, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResearchSettingsDto {
  researchEnabled: boolean;
  requiresDirectorApprovalEachExport: boolean;
}

export interface CreateClinicDto {
  name: string;
  organizationId?: string;
  region?: string;
  countryCode?: string;
  timezone?: string;
  locationCode?: string;
  zoneCode?: string | null;
}

export interface UpdateClinicDto {
  name?: string;
  region?: string;
  countryCode?: string;
  timezone?: string;
  locationCode?: string;
  zoneCode?: string | null;
  isActive?: boolean;
}

export interface AdminActor {
  userId: string;
  roles: { clinicId: string | null; role: UserRole }[];
}

const DEFAULT_ORGANIZATION_NAME = 'Nkwapa Health';
const DEFAULT_ORGANIZATION_SLUG = 'default';
const DEFAULT_TIMEZONE = 'Africa/Accra';

function toLocationCode(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'clinic';
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

  async findByIds(ids: string[]): Promise<{ id: string; name: string; region: string | null }[]> {
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
    updatedByUserId: string,
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
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );
    if (isSystemAdmin) {
      return this.prisma.clinic.findMany({
        orderBy: { name: 'asc' },
      });
    }
    const directorClinicIds = actor.roles
      .filter((r) => r.role === UserRole.DIRECTOR && r.clinicId != null)
      .map((r) => r.clinicId as string);
    if (directorClinicIds.length === 0) return [];
    return this.prisma.clinic.findMany({
      where: { id: { in: directorClinicIds } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateClinicDto): Promise<Clinic> {
    const organizationId = dto.organizationId ?? (await this.resolveDefaultOrganizationId());
    return this.prisma.clinic.create({
      data: {
        organizationId,
        name: dto.name,
        region: dto.region ?? null,
        countryCode: dto.countryCode ?? 'GH',
        timezone: dto.timezone ?? DEFAULT_TIMEZONE,
        locationCode: dto.locationCode?.trim() || toLocationCode(dto.name),
        zoneCode: dto.zoneCode?.trim() || null,
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
        ...(dto.timezone != null && { timezone: dto.timezone }),
        ...(dto.locationCode != null && { locationCode: dto.locationCode.trim() }),
        ...(dto.zoneCode !== undefined && { zoneCode: dto.zoneCode?.trim() || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async canManageClinic(actor: AdminActor, clinicId: string): Promise<boolean> {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );
    if (isSystemAdmin) return true;
    return actor.roles.some((r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR);
  }

  private async resolveDefaultOrganizationId() {
    const existing = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: DEFAULT_ORGANIZATION_NAME,
        slug: DEFAULT_ORGANIZATION_SLUG,
        timezone: DEFAULT_TIMEZONE,
      },
      select: { id: true },
    });

    return organization.id;
  }
}
