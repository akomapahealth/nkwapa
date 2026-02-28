import { ConflictException, Injectable } from "@nestjs/common";
import { Encounter, Patient } from "@prisma/client";
import { EncounterService } from "../encounters/encounter.service";
import { ConsentService } from "../consents/consent.service";
import {
  encryptNationalId,
  hashNationalId,
  nationalIdLast4,
  normalizePhoneToE164,
} from "@nkwapa/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PatientRepository, PatientFindManyFilters } from "./patient.repository";
import { CreatePatientDto } from "./dto/create-patient.dto";

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

/** Ghana phone patterns: 024..., 24..., +233..., 00233... */
function looksLikeGhanaPhone(q: string): boolean {
  const s = q.trim().replace(/\s/g, "");
  return /^0?24\d{7}$/.test(s) || /^\+?23324\d{7}$/.test(s) || /^0023324\d{7}$/.test(s);
}

@Injectable()
export class PatientService {
  constructor(
    private readonly patientRepository: PatientRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly encounterService: EncounterService,
    private readonly consentService: ConsentService
  ) {}

  async create(
    dto: CreatePatientDto,
    auditContext?: AuditContext
  ): Promise<Patient> {
    const hash = hashNationalId(dto.nationalId);
    const existing = await this.patientRepository.findByNationalIdHash(hash);
    if (existing) {
      throw new ConflictException({
        message: "Patient with this national ID already exists",
        existingPatient: this.toPatientSummary(existing),
      });
    }

    const phoneE164 = dto.phoneE164
      ? normalizePhoneToE164(dto.phoneE164, "GH") ?? dto.phoneE164
      : null;

    const year = new Date().getFullYear();
    const patient = await this.prisma.$transaction(async (tx) => {
      const row = await tx.patientCodeSequence.upsert({
        where: { year },
        create: { year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const patientCode = `NKP-${year}-${String(row.lastNumber).padStart(6, "0")}`;
      return tx.patient.create({
        data: {
          patientCode,
          primaryClinicId: dto.primaryClinicId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          dob: dto.dob,
          sex: dto.sex ?? "UNKNOWN",
          phoneE164,
          email: dto.email,
          nationalIdType: dto.nationalIdType,
          nationalIdCiphertext: encryptNationalId(dto.nationalId),
          nationalIdHash: hash,
          nationalIdLast4: nationalIdLast4(dto.nationalId),
          createdByUserId: dto.createdByUserId,
        },
      });
    });

    if (auditContext) {
      await this.auditService.logWrite({
        clinicId: auditContext.clinicId,
        actorUserId: auditContext.actorUserId,
        action: "PATIENT.CREATE",
        entityType: "Patient",
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
  async search(primaryClinicId: string, q: string, take = 50): Promise<Patient[]> {
    const trimmed = q?.trim() ?? "";
    const filters: PatientFindManyFilters = {
      primaryClinicId,
      take,
    };
    if (trimmed) {
      filters.search = trimmed;
      if (looksLikeGhanaPhone(trimmed)) {
        const normalized = normalizePhoneToE164(trimmed, "GH");
        if (normalized) filters.phoneE164 = normalized;
      }
    }
    return this.patientRepository.findMany(filters);
  }

  async findById(id: string): Promise<Patient | null> {
    return this.patientRepository.findById(id);
  }

  async findByIdWithRecentEncounters(
    patientId: string,
    take = 10,
    clinicId?: string
  ): Promise<{
    patient: Patient;
    recentEncounters: Encounter[];
    consentStatus?: Array<{ consentType: string; status: string; grantedAt?: Date }>;
  } | null> {
    const patient = await this.patientRepository.findById(patientId);
    if (!patient) return null;
    const recentEncounters = await this.encounterService.listByPatient(patientId, { take });
    const result: {
      patient: Patient;
      recentEncounters: Encounter[];
      consentStatus?: Array<{ consentType: string; status: string; grantedAt?: Date }>;
    } = { patient, recentEncounters };
    if (clinicId) {
      result.consentStatus = await this.consentService.getConsentStatusForClinic(
        patientId,
        clinicId
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

  async findMany(filters: PatientFindManyFilters): Promise<Patient[]> {
    return this.patientRepository.findMany(filters);
  }
}
