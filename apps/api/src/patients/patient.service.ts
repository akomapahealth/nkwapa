import { ConflictException, Injectable } from '@nestjs/common';
import { Encounter, Patient } from '@prisma/client';
import { EncounterService } from '../encounters/encounter.service';
import { ConsentService } from '../consents/consent.service';
import {
  encryptNationalId,
  hashNationalId,
  nationalIdLast4,
  normalizePhoneToE164,
} from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailStatusService } from '../notifications/email/email-status.service';
import { resolveAppPublicUrl } from '../notifications/email/email-config';
import { effectivePortalInviteStatus } from '../common/portal-invite-lifecycle';
import { PatientRepository, PatientFindManyFilters } from './patient.repository';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientBodyDto } from './dto/update-patient-body.dto';
import {
  hasResidentialLocationInput,
  ResidentialLocationFilters,
  ResidentialLocationInput,
  ResolvedResidentialLocation,
  resolveResidentialLocation,
} from './residential-location.util';

export interface AuditContext {
  clinicId: string;
  actorUserId: string;
  requestId?: string;
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

/** Newest invite email attempt, or null when the invite is phone-only or predates a send. */
export interface PatientPortalInviteDelivery {
  status: string;
  failureReason: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface PatientPortalInviteSummary {
  id: string;
  /**
   * What the invite actually is right now, not what the column says.
   *
   * The expiry sweep runs hourly, so a lapsed row still reads PENDING for up to an hour.
   * Showing that would promise staff a live invite the claim endpoint already refuses.
   */
  status: string;
  email: string | null;
  phoneE164: string | null;
  createdAt: string;
  expiresAt: string | null;
  claimedAt: string | null;
  cancelledAt: string | null;
  /** Who issued it. Staff chasing a wrong-chart invite need to know who to ask. */
  createdByName: string | null;
  emailDelivery: PatientPortalInviteDelivery | null;
}

/**
 * How many settled invites the chart carries.
 *
 * Five is enough to show a pattern — a mistyped address corrected twice, an invite
 * cancelled and reissued — without turning a chart response into an audit log. The full
 * record is in AuditEvent for anyone who needs it.
 */
export const PORTAL_INVITE_HISTORY_LIMIT = 5;

export interface PatientPortalAccessSummary {
  status: 'LINKED' | 'INVITED' | 'UNLINKED' | 'MERGED';
  linkedUserId: string | null;
  linkedKeycloakSub: string | null;
  mergedIntoPatientId: string | null;
  /** The one invite staff can act on, or null when there is none. */
  currentInvite: PatientPortalInviteSummary | null;
  /**
   * Recently settled invites — claimed, cancelled, expired.
   *
   * The chart used to be shown only pending and expired rows, so an invite cancelled
   * last week was invisible and staff had no way to tell "nobody ever invited them" from
   * "someone cancelled it". Both are answers; only one of them was reachable.
   */
  history: PatientPortalInviteSummary[];
  /**
   * Whether an invitation email can currently reach an inbox.
   *
   * Carried here so the chart can tell staff which of two true things is happening —
   * the email is on its way, or nothing was sent and here is what to read out instead —
   * without a second request that can fail on its own.
   */
  emailChannel: {
    available: boolean;
    readiness: string;
    reason: string | null;
  };
  /** Where a patient goes to claim, when a public origin is configured. */
  claimUrl: string | null;
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
    // From the global NotificationModule. The chart needs it so it can tell staff which
    // of two true things is happening — the invitation email is on its way, or nothing
    // was sent and here is what to read out instead.
    private readonly emailStatus: EmailStatusService,
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
    if (hasResidentialLocationInput(dto)) {
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

  /** Enforce the deliberate residential-location invariant. See the util. */
  resolveResidentialLocation(input: ResidentialLocationInput): ResolvedResidentialLocation {
    return resolveResidentialLocation(input);
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

  private buildEmailChannelSummary(): PatientPortalAccessSummary['emailChannel'] {
    const status = this.emailStatus.getStatus();
    return {
      available: status.available,
      readiness: status.readiness,
      reason: status.reason,
    };
  }

  private async getPortalAccessSummary(
    patient: Patient,
    clinicId?: string,
  ): Promise<PatientPortalAccessSummary> {
    const emailChannel = this.buildEmailChannelSummary();
    const claimUrl = resolveAppPublicUrl();

    if (patient.mergedIntoPatientId) {
      return {
        status: 'MERGED',
        linkedUserId: patient.portalUserId ?? null,
        linkedKeycloakSub: null,
        mergedIntoPatientId: patient.mergedIntoPatientId,
        currentInvite: null,
        history: [],
        emailChannel,
        claimUrl,
      };
    }

    const [accountLink, invites] = await Promise.all([
      this.prisma.patientAccountLink.findUnique({
        where: { patientId: patient.id },
      }),
      // Every status, not just PENDING and EXPIRED. Filtering cancelled and claimed rows
      // out is what left staff unable to tell "nobody ever invited them" from "someone
      // cancelled it", which are different answers to the question they are asking.
      this.prisma.patientPortalInvite.findMany({
        where: {
          patientId: patient.id,
          ...(clinicId ? { clinicId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: PORTAL_INVITE_HISTORY_LIMIT + 1,
        include: {
          createdBy: { select: { displayName: true } },
          // Only the newest attempt. Staff want to know whether the invite reached the
          // patient right now, not the full resend history.
          reminders: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, failureReason: true, sentAt: true, createdAt: true },
          },
        },
      }),
    ]);

    const now = new Date();
    const summaries = invites.map((invite) => this.toPortalInviteSummary(invite, now));
    // At most one invite is live at a time: creating one cancels any predecessor, and so
    // does a claim. Anything else is history.
    const currentInvite = summaries.find((invite) => invite.status === 'PENDING') ?? null;
    const history = summaries
      .filter((invite) => invite.id !== currentInvite?.id)
      .slice(0, PORTAL_INVITE_HISTORY_LIMIT);

    // Derived from a claimable invite rather than from "any invite exists". A chart whose
    // only invite expired last month is not invited; it is unlinked, and the action staff
    // need offered is a new invite.
    const status =
      accountLink || patient.portalUserId ? 'LINKED' : currentInvite ? 'INVITED' : 'UNLINKED';

    return {
      status,
      linkedUserId: patient.portalUserId ?? null,
      linkedKeycloakSub: accountLink?.keycloakSub ?? null,
      mergedIntoPatientId: null,
      currentInvite,
      history,
      emailChannel,
      claimUrl,
    };
  }

  private toPortalInviteSummary(
    invite: {
      id: string;
      status: string;
      email: string | null;
      phoneE164: string | null;
      createdAt: Date;
      expiresAt: Date | null;
      claimedAt: Date | null;
      cancelledAt: Date | null;
      createdBy?: { displayName: string } | null;
      reminders: Array<{
        status: string;
        failureReason: string | null;
        sentAt: Date | null;
        createdAt: Date;
      }>;
    },
    now: Date,
  ): PatientPortalInviteSummary {
    const delivery = invite.reminders[0] ?? null;
    return {
      id: invite.id,
      status: effectivePortalInviteStatus(invite, now),
      email: invite.email,
      phoneE164: invite.phoneE164,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      claimedAt: invite.claimedAt?.toISOString() ?? null,
      cancelledAt: invite.cancelledAt?.toISOString() ?? null,
      createdByName: invite.createdBy?.displayName ?? null,
      emailDelivery: delivery
        ? {
            status: delivery.status,
            failureReason: delivery.failureReason,
            sentAt: delivery.sentAt?.toISOString() ?? null,
            createdAt: delivery.createdAt.toISOString(),
          }
        : null,
    };
  }
}
