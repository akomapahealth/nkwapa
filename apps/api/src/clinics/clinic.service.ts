import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Clinic, Prisma, UserRole } from '@prisma/client';
import {
  CLINIC_DEFAULT_COUNTRY_CODE,
  CLINIC_DEFAULT_ORGANIZATION_NAME,
  CLINIC_DEFAULT_ORGANIZATION_SLUG,
  CLINIC_DEFAULT_TIMEZONE,
  evaluateClinicMetadata,
  normalizeCountryCode,
  normalizeLocationCode,
  normalizeZoneCode,
  toLocationCode,
  type ClinicMetadataIssue,
} from '@nkwapa/db';
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

/** A clinic as the admin surface sees it: the row, its organization, and what is wrong with it. */
export interface AdminClinicView extends Clinic {
  organization: OrganizationSummary | null;
  metadataIssues: ClinicMetadataIssue[];
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  clinicCount: number;
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

  async findByIds(ids: string[]): Promise<{ id: string; name: string; region: string | null }[]> {
    if (ids.length === 0) return [];
    return this.prisma.clinic.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, region: true },
    });
  }

  async listActiveSwitchableClinics(
    ids?: string[],
  ): Promise<{ id: string; name: string; region: string | null }[]> {
    if (ids && ids.length === 0) return [];
    return this.prisma.clinic.findMany({
      where: {
        isActive: true,
        ...(ids ? { id: { in: ids } } : {}),
      },
      select: { id: true, name: true, region: true },
      orderBy: { name: 'asc' },
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

  /**
   * The admin clinic list, with each row's organization and its metadata problems attached.
   *
   * The issues are computed by the same `evaluateClinicMetadata` the repair CLI runs, so a
   * badge in the UI and a line of CLI output can never describe a clinic differently.
   */
  async listAllForAdmin(actor: AdminActor): Promise<AdminClinicView[]> {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );

    let clinics;
    if (isSystemAdmin) {
      clinics = await this.prisma.clinic.findMany({
        orderBy: { name: 'asc' },
        include: { organization: true },
      });
    } else {
      const directorClinicIds = actor.roles
        .filter((r) => r.role === UserRole.DIRECTOR && r.clinicId != null)
        .map((r) => r.clinicId as string);
      if (directorClinicIds.length === 0) return [];
      clinics = await this.prisma.clinic.findMany({
        where: { id: { in: directorClinicIds } },
        orderBy: { name: 'asc' },
        include: { organization: true },
      });
    }

    return clinics.map(({ organization, ...clinic }) => ({
      ...clinic,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            timezone: organization.timezone,
            clinicCount: 0,
          }
        : null,
      metadataIssues: evaluateClinicMetadata({
        name: clinic.name,
        organizationId: clinic.organizationId,
        organizationTimezone: organization?.timezone ?? null,
        timezone: clinic.timezone,
        locationCode: clinic.locationCode,
        zoneCode: clinic.zoneCode,
        countryCode: clinic.countryCode,
        isActive: clinic.isActive,
      }),
    }));
  }

  async create(dto: CreateClinicDto): Promise<Clinic> {
    const organizationId = dto.organizationId
      ? await this.requireOrganizationId(dto.organizationId)
      : await this.resolveDefaultOrganizationId();
    const locationCode = normalizeLocationCode(dto.locationCode) || toLocationCode(dto.name);

    await this.assertLocationCodeIsFree(organizationId, locationCode);

    return this.writeMappingConflicts(locationCode, () =>
      this.prisma.clinic.create({
        data: {
          organizationId,
          name: dto.name,
          region: dto.region ?? null,
          countryCode: normalizeCountryCode(dto.countryCode) || CLINIC_DEFAULT_COUNTRY_CODE,
          timezone: dto.timezone ?? CLINIC_DEFAULT_TIMEZONE,
          locationCode,
          zoneCode: normalizeZoneCode(dto.zoneCode),
        },
      }),
    );
  }

  async update(id: string, dto: UpdateClinicDto): Promise<Clinic> {
    const existing = await this.prisma.clinic.findUnique({
      where: { id },
      select: { organizationId: true, locationCode: true },
    });
    if (!existing) {
      throw new BadRequestException({
        code: 'CLINIC_NOT_FOUND',
        message: 'That clinic no longer exists.',
        recoveryAction: 'Refresh the clinic list and try again.',
      });
    }

    /*
      `!= null` was the old guard on locationCode, so an empty string trimmed to '' and was
      written -- leaving a clinic that organization reporting could not identify. An omitted
      code still means "leave it alone"; a blank one is now a validation failure.
    */
    let locationCode: string | undefined;
    if (dto.locationCode !== undefined) {
      locationCode = normalizeLocationCode(dto.locationCode);
      if (!locationCode) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          fieldErrors: [{ field: 'locationCode', message: 'A clinic must keep a location code.' }],
          recoveryAction: 'Give the clinic a location code, or leave the field unchanged.',
        });
      }
      if (locationCode !== existing.locationCode) {
        await this.assertLocationCodeIsFree(existing.organizationId, locationCode, id);
      }
    }

    return this.writeMappingConflicts(locationCode ?? existing.locationCode, () =>
      this.prisma.clinic.update({
        where: { id },
        data: {
          ...(dto.name != null && { name: dto.name }),
          ...(dto.region !== undefined && { region: dto.region }),
          ...(dto.countryCode != null && { countryCode: normalizeCountryCode(dto.countryCode) }),
          ...(dto.timezone != null && { timezone: dto.timezone }),
          ...(locationCode !== undefined && { locationCode }),
          ...(dto.zoneCode !== undefined && { zoneCode: normalizeZoneCode(dto.zoneCode) }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      }),
    );
  }

  /** Organizations an admin can file a clinic under. Read-only: this never creates one. */
  async listOrganizations(): Promise<OrganizationSummary[]> {
    const organizations = await this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        _count: { select: { clinics: true } },
      },
    });

    return organizations.map(({ _count, ...organization }) => ({
      ...organization,
      clinicCount: _count.clinics,
    }));
  }

  private async requireOrganizationId(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      // Without this the unknown id reaches Postgres and comes back as an unmapped foreign
      // key error, which tells the operator nothing about which field was wrong.
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        fieldErrors: [{ field: 'organizationId', message: 'That organization does not exist.' }],
        recoveryAction: 'Choose an organization from the list and try again.',
      });
    }
    return organization.id;
  }

  private async assertLocationCodeIsFree(
    organizationId: string,
    locationCode: string,
    exceptClinicId?: string,
  ) {
    const clash = await this.prisma.clinic.findFirst({
      where: {
        organizationId,
        locationCode,
        ...(exceptClinicId ? { id: { not: exceptClinicId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw this.locationCodeConflict(locationCode, clash.name);
    }
  }

  /**
   * Turns the unique-key violation into the same conflict the pre-check raises.
   *
   * The pre-check above is for the message, not for correctness -- two concurrent creates can
   * both pass it. `@@unique([organizationId, locationCode])` is what actually holds the line,
   * and this makes losing that race a 409 naming the field rather than an unmapped 500.
   */
  private async writeMappingConflicts<T>(locationCode: string, write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.locationCodeConflict(locationCode);
      }
      throw error;
    }
  }

  private locationCodeConflict(locationCode: string, clashingClinicName?: string) {
    return new ConflictException({
      code: 'CLINIC_LOCATION_CODE_CONFLICT',
      message: clashingClinicName
        ? `"${clashingClinicName}" already uses the location code "${locationCode}" in this organization.`
        : `The location code "${locationCode}" is already used in this organization.`,
      fieldErrors: [
        { field: 'locationCode', message: 'Location codes must be unique within an organization.' },
      ],
      recoveryAction: 'Choose a different location code.',
    });
  }

  async canManageClinic(actor: AdminActor, clinicId: string): Promise<boolean> {
    const isSystemAdmin = actor.roles.some(
      (r) => r.role === UserRole.SYSTEM_ADMIN && r.clinicId === null,
    );
    if (isSystemAdmin) return true;
    return actor.roles.some((r) => r.clinicId === clinicId && r.role === UserRole.DIRECTOR);
  }

  /**
   * The organization a clinic lands in when the caller did not name one.
   *
   * The create is an upsert on the unique slug rather than a read-then-create. The old shape
   * could mint a second "default" organization under concurrency, and two organizations that
   * both claim to be the default is exactly the metadata problem this work exists to stop.
   */
  private async resolveDefaultOrganizationId() {
    const existing = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const organization = await this.prisma.organization.upsert({
      where: { slug: CLINIC_DEFAULT_ORGANIZATION_SLUG },
      update: {},
      create: {
        name: CLINIC_DEFAULT_ORGANIZATION_NAME,
        slug: CLINIC_DEFAULT_ORGANIZATION_SLUG,
        timezone: CLINIC_DEFAULT_TIMEZONE,
      },
      select: { id: true },
    });

    return organization.id;
  }
}
