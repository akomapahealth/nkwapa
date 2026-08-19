import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Encounter, GhanaRegion, Patient, PatientLocationStatus } from '@prisma/client';
import { EncounterService } from '../encounters/encounter.service';
import { ConsentService } from '../consents/consent.service';
import {
  encryptNationalId,
  hashNationalId,
  nationalIdLast4,
  normalizeDistrict,
  normalizePhoneToE164,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientRepository, PatientFindManyFilters } from './patient.repository';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientBodyDto } from './dto/update-patient-body.dto';

export interface AuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
}

/** Raw residential location fields as supplied by create/update DTOs. */
export interface ResidentialLocationInput {
  residentialLocationStatus?: PatientLocationStatus;
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialAddressNote?: string;
}

/** Resolved residential location, ready to persist. */
export interface ResolvedResidentialLocation {
  residentialLocationStatus: PatientLocationStatus;
  residentialRegion: GhanaRegion | null;
  residentialDistrict: string | null;
  residentialCommunity: string | null;
  residentialAddressNote: string | null;
}

/** Optional residential location filters for the registry, within clinic scope. */
export interface ResidentialLocationFilters {
  residentialRegion?: GhanaRegion;
  residentialDistrict?: string;
  residentialCommunity?: string;
  residentialLocationStatus?: PatientLocationStatus;
}

export interface ExistingPatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  nationalIdLast4: string | null;
}

export interface PatientRegistryItem {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  email: string | null;
  nationalIdLast4: string | null;
}

export interface PatientRegistryPage {
  items: PatientRegistryItem[];
  total?: number;
  page?: number;
  pageSize: number;
  nextCursor: string | null;
}

export interface PatientPortalAccessSummary {
  status: 'LINKED' | 'INVITED' | 'UNLINKED' | 'MERGED';
  linkedUserId: string | null;
  linkedKeycloakSub: string | null;
  mergedIntoPatientId: string | null;
  invites: Array<{
    id: string;
    status: string;
    email: string | null;
    phoneE164: string | null;
    createdAt: string;
    expiresAt: string | null;
  }>;
}

/** Ghana phone patterns: 024..., 24..., +233..., 00233... */
function looksLikeGhanaPhone(q: string): boolean {
  const s = q.trim().replace(/\s/g, '');
  return /^0?24\d{7}$/.test(s) || /^\+?23324\d{7}$/.test(s) || /^0023324\d{7}$/.test(s);
}

@Injectable()
export class PatientService {
  constructor(
    private readonly patientRepository: PatientRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly encounterService: EncounterService,
    private readonly consentService: ConsentService,
  ) {}

  async create(dto: CreatePatientDto, auditContext?: AuditContext): Promise<Patient> {
    const hash = hashNationalId(dto.nationalId);
    const existing = await this.patientRepository.findByNationalIdHash(hash);
    if (existing) {
      throw new ConflictException({
        message: 'Patient with this national ID already exists',
        existingPatient: this.toPatientSummary(existing),
      });
    }

    const phoneE164 = dto.phoneE164
      ? (normalizePhoneToE164(dto.phoneE164, 'GH') ?? dto.phoneE164)
      : null;
    const location = this.resolveResidentialLocation(dto);

    const year = new Date().getFullYear();
    const patient = await this.prisma.$transaction(async (tx) => {
      const row = await tx.patientCodeSequence.upsert({
        where: { year },
        create: { year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const patientCode = `NKP-${year}-${String(row.lastNumber).padStart(6, '0')}`;
      return tx.patient.create({
        data: {
          patientCode,
          primaryClinicId: dto.primaryClinicId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          dob: dto.dob,
          sex: dto.sex ?? 'UNKNOWN',
          phoneE164,
          email: dto.email,
          nationalIdType: dto.nationalIdType,
          nationalIdCiphertext: encryptNationalId(dto.nationalId),
          nationalIdHash: hash,
          nationalIdLast4: nationalIdLast4(dto.nationalId),
          createdByUserId: dto.createdByUserId,
          ...location,
        },
      });
    });

    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: 'PATIENT.CREATE',
        entityType: 'Patient',
        entityId: patient.id,
        afterJson: JSON.stringify(patient),
        requestId: auditContext.requestId,
      });
    }

    return patient;
  }

  private toPatientSummary(p: Patient): ExistingPatientSummary {
    return {
      id: p.id,
      patientCode: p.patientCode,
      firstName: p.firstName,
      lastName: p.lastName,
      nationalIdLast4: p.nationalIdLast4,
    };
  }

  /** Search patients by clinic; q can match patient_code, name, phone, national_id_last4. */
  async search(primaryClinicId: string, q: string, take = 50): Promise<PatientRegistryItem[]> {
    const trimmed = q?.trim() ?? '';
    const filters: PatientFindManyFilters = {
      primaryClinicId,
      take,
    };
    if (trimmed) {
      filters.search = trimmed;
      if (looksLikeGhanaPhone(trimmed)) {
        const normalized = normalizePhoneToE164(trimmed, 'GH');
        if (normalized) filters.phoneE164 = normalized;
      }
    }
    const items = await this.patientRepository.findMany(filters);
    return items.map((item) => this.toRegistryItem(item));
  }

  async listRegistry(
    primaryClinicId: string,
    q = '',
    page = 1,
    pageSize = 25,
    options?: { cursor?: string; limit?: number; location?: ResidentialLocationFilters },
  ): Promise<PatientRegistryPage> {
    const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize = Math.min(
      100,
      Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 25),
    );
    const normalizedLimit = Math.min(
      100,
      Math.max(
        1,
        Number.isFinite(options?.limit)
          ? Math.floor(options?.limit ?? normalizedPageSize)
          : normalizedPageSize,
      ),
    );
    const trimmed = q.trim();

    const filters: PatientFindManyFilters = {
      primaryClinicId,
      cursor: options?.cursor,
      skip: options?.cursor ? undefined : (normalizedPage - 1) * normalizedPageSize,
      take: options?.cursor ? normalizedLimit : normalizedPageSize,
      residentialRegion: options?.location?.residentialRegion,
      residentialDistrict: options?.location?.residentialDistrict,
      residentialCommunity: options?.location?.residentialCommunity,
      residentialLocationStatus: options?.location?.residentialLocationStatus,
    };

    if (trimmed) {
      filters.search = trimmed;
      if (looksLikeGhanaPhone(trimmed)) {
        const normalized = normalizePhoneToE164(trimmed, 'GH');
        if (normalized) {
          filters.phoneE164 = normalized;
        }
      }
    }

    const items = await this.patientRepository.findMany(filters);
    const total = options?.cursor
      ? undefined
      : await this.patientRepository.count({
          ...filters,
          cursor: undefined,
          skip: undefined,
          take: undefined,
        });

    const mappedItems = items.map((item) => this.toRegistryItem(item));
    const effectivePageSize = options?.cursor ? normalizedLimit : normalizedPageSize;

    return {
      items: mappedItems,
      total,
      page: options?.cursor ? undefined : normalizedPage,
      pageSize: effectivePageSize,
      nextCursor:
        mappedItems.length === effectivePageSize && mappedItems.length > 0
          ? (mappedItems[mappedItems.length - 1]?.id ?? null)
          : null,
    };
  }

  async findById(id: string): Promise<Patient | null> {
    return this.patientRepository.findById(id, { resolveMerged: true });
  }

  async findByIdWithRecentEncounters(
    patientId: string,
    take = 10,
    clinicId?: string,
  ): Promise<{
    patient: Patient;
    recentEncounters: Encounter[];
    consentStatus?: Array<{ consentType: string; status: string; grantedAt?: Date }>;
    portalAccess: PatientPortalAccessSummary;
    resolvedFromPatientId: string | null;
  } | null> {
    const requestedPatient = await this.patientRepository.findById(patientId);
    const patient = await this.patientRepository.findById(patientId, { resolveMerged: true });
    if (!patient) return null;
    const recentEncounters = await this.encounterService.listByPatient(patient.id, { take });
    const portalAccess = await this.getPortalAccessSummary(patient, clinicId);
    const result: {
      patient: Patient;
      recentEncounters: Encounter[];
      consentStatus?: Array<{ consentType: string; status: string; grantedAt?: Date }>;
      portalAccess: PatientPortalAccessSummary;
      resolvedFromPatientId: string | null;
    } = {
      patient,
      recentEncounters,
      portalAccess,
      resolvedFromPatientId:
        requestedPatient && requestedPatient.id !== patient.id ? requestedPatient.id : null,
    };
    if (clinicId) {
      result.consentStatus = await this.consentService.getConsentStatusForClinic(
        patient.id,
        clinicId,
      );
    }
    return result;
  }

  async findByPatientCode(patientCode: string): Promise<Patient | null> {
    return this.patientRepository.findByPatientCode(patientCode);
  }

  async checkDuplicateNationalId(plaintext: string): Promise<boolean> {
    const hash = hashNationalId(plaintext);
    const existing = await this.patientRepository.findByNationalIdHash(hash);
    return existing !== null;
  }

  async update(
    id: string,
    dto: UpdatePatientBodyDto,
    auditContext?: AuditContext,
  ): Promise<Patient> {
    const existing = await this.patientRepository.findById(id);
    if (!existing) throw new Error('Patient not found');

    const data: Record<string, unknown> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.dob !== undefined) data.dob = new Date(dto.dob);
    if (dto.sex !== undefined) data.sex = dto.sex;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phoneE164 !== undefined) {
      data.phoneE164 = dto.phoneE164
        ? (normalizePhoneToE164(dto.phoneE164, 'GH') ?? dto.phoneE164)
        : null;
    }

    // Residential location is resolved as a coherent block: when any location
    // field is supplied, re-apply the status invariant across all of them so a
    // partial edit can never leave region/status inconsistent.
    const hasLocationInput =
      dto.residentialLocationStatus !== undefined ||
      dto.residentialRegion !== undefined ||
      dto.residentialDistrict !== undefined ||
      dto.residentialCommunity !== undefined ||
      dto.residentialAddressNote !== undefined;
    if (hasLocationInput) {
      Object.assign(data, this.resolveResidentialLocation(dto));
    }

    const updated = await this.patientRepository.update(id, data);

    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: 'PATIENT.UPDATE',
        entityType: 'Patient',
        entityId: id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
        requestId: auditContext.requestId,
      });
    }

    return updated;
  }

  async findMany(filters: PatientFindManyFilters): Promise<Patient[]> {
    return this.patientRepository.findMany(filters);
  }

  /**
   * Enforce the deliberate residential-location invariant so a missing location
   * is never ambiguous blank text:
   * - RECORDED requires a region (district is normalized to its canonical name);
   * - UNKNOWN / NOT_RECORDED clear every granular field;
   * - an omitted status is inferred: RECORDED when a region is present,
   *   otherwise NOT_RECORDED.
   */
  resolveResidentialLocation(input: ResidentialLocationInput): ResolvedResidentialLocation {
    const region = input.residentialRegion ?? null;
    const status: PatientLocationStatus =
      input.residentialLocationStatus ?? (region ? 'RECORDED' : 'NOT_RECORDED');

    if (status !== 'RECORDED') {
      return {
        residentialLocationStatus: status,
        residentialRegion: null,
        residentialDistrict: null,
        residentialCommunity: null,
        residentialAddressNote: null,
      };
    }

    if (!region) {
      throw new BadRequestException(
        'residentialRegion is required when residentialLocationStatus is RECORDED',
      );
    }

    return {
      residentialLocationStatus: 'RECORDED',
      residentialRegion: region,
      residentialDistrict: normalizeDistrict(region, input.residentialDistrict),
      residentialCommunity: input.residentialCommunity?.trim() || null,
      residentialAddressNote: input.residentialAddressNote?.trim() || null,
    };
  }

  private toRegistryItem(patient: Patient): PatientRegistryItem {
    return {
      id: patient.id,
      patientCode: patient.patientCode,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phoneE164: patient.phoneE164,
      email: patient.email,
      nationalIdLast4: patient.nationalIdLast4,
    };
  }

  private async getPortalAccessSummary(
    patient: Patient,
    clinicId?: string,
  ): Promise<PatientPortalAccessSummary> {
    if (patient.mergedIntoPatientId) {
      return {
        status: 'MERGED',
        linkedUserId: patient.portalUserId ?? null,
        linkedKeycloakSub: null,
        mergedIntoPatientId: patient.mergedIntoPatientId,
        invites: [],
      };
    }

    const [accountLink, invites] = await Promise.all([
      this.prisma.patientAccountLink.findUnique({
        where: { patientId: patient.id },
      }),
      this.prisma.patientPortalInvite.findMany({
        where: {
          patientId: patient.id,
          ...(clinicId ? { clinicId } : {}),
          status: {
            in: ['PENDING', 'EXPIRED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const status =
      accountLink || patient.portalUserId ? 'LINKED' : invites.length > 0 ? 'INVITED' : 'UNLINKED';

    return {
      status,
      linkedUserId: patient.portalUserId ?? null,
      linkedKeycloakSub: accountLink?.keycloakSub ?? null,
      mergedIntoPatientId: null,
      invites: invites.map((invite) => ({
        id: invite.id,
        status: invite.status,
        email: invite.email,
        phoneE164: invite.phoneE164,
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt?.toISOString() ?? null,
      })),
    };
  }
}
