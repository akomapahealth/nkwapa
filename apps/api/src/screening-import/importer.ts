import { randomUUID } from 'node:crypto';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { hashNationalId } from '@nkwapa/db';
import type { Prisma } from '@prisma/client';
import type { ScopedRole } from '../auth/clinic-roles';
import { AuditService } from '../audit/audit.service';
import { ConsentService } from '../consents/consent.service';
import { CounsellingService } from '../counselling/counselling.service';
import { UpsertCounsellingDto } from '../counselling/dto/counselling.dto';
import { DiabetesScreeningService } from '../diabetes-screening/diabetes-screening.service';
import { UpsertDiabetesScreeningDto } from '../diabetes-screening/dto/diabetes-screening.dto';
import { UpsertEyeScreeningDto } from '../eye-screening/dto/eye-screening.dto';
import { EyeScreeningService } from '../eye-screening/eye-screening.service';
import { UpsertHypertensionAssessmentDto } from '../hypertension-assessment/dto/hypertension-assessment.dto';
import { HypertensionAssessmentService } from '../hypertension-assessment/hypertension-assessment.service';
import { CreateMedicalHistoryDto } from '../medical-history/dto/medical-history.dto';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { CreatePatientMedicationDto } from '../medication-reconciliation/dto/medication-reconciliation.dto';
import { MedicationReconciliationService } from '../medication-reconciliation/medication-reconciliation.service';
import { createDraftEncounter } from '../ops/draft-encounter';
import { PatientService } from '../patients/patient.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalMeasurementsService } from '../sync/clinical-measurements.service';
import { importId, RowRejectedError, type PatientPlan } from './map-row';

/** What the patient heard: the script on the sheet's Start Here tab, not the app's consent text. */
export const SHEET_CONSENT_TEXT =
  '"Nkwapa may use your screening results for health research, with your name, phone number and ID removed. Saying no does not change your care today. You can change your mind later by telling the clinic. May we include your results?" (read aloud from the screening-day sheet)';

export interface ImportServices {
  prisma: PrismaService;
  audit: AuditService;
  patients: PatientService;
  consents: ConsentService;
  measurements: ClinicalMeasurementsService;
  hypertension: HypertensionAssessmentService;
  diabetes: DiabetesScreeningService;
  eye: EyeScreeningService;
  counselling: CounsellingService;
  history: MedicalHistoryService;
  medications: MedicationReconciliationService;
}

export interface ImportActor {
  userId: string;
  roles: ScopedRole[];
}

/**
 * The "Screening import" user every imported record is authored by. Volunteers did the screening,
 * so it holds the volunteer role at this clinic and nothing else. Its keycloakSub matches no
 * Keycloak identity, so nobody can sign in as it.
 */
export function importActor(
  clinicId: string,
  sessionDate: string,
): ImportActor & { keycloakSub: string; displayName: string } {
  const keycloakSub = `screening-import:${sessionDate}`;
  return {
    keycloakSub,
    displayName: `Screening import (${sessionDate})`,
    userId: importId(sessionDate, 'import-user', keycloakSub),
    roles: [{ clinicId, role: 'VOLUNTEER' }],
  };
}

async function ensureImportUser(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  clinicId: string,
  sessionDate: string,
  requestId: string,
): Promise<void> {
  const actor = importActor(clinicId, sessionDate);
  const existing = await tx.user.findUnique({ where: { keycloakSub: actor.keycloakSub } });
  if (existing && existing.id !== actor.userId) {
    throw new Error(`User ${actor.keycloakSub} exists with an unexpected id ${existing.id}`);
  }
  if (!existing) {
    const user = await tx.user.create({
      data: {
        id: actor.userId,
        keycloakSub: actor.keycloakSub,
        displayName: actor.displayName,
        firstName: 'Screening',
        lastName: `import ${sessionDate}`,
        isActive: true,
      },
    });
    await audit.logWrite(
      {
        clinicId,
        actorUserId: user.id,
        action: 'USER.CREATE',
        entityType: 'User',
        entityId: user.id,
        afterJson: JSON.stringify(user),
        requestId,
      },
      tx,
    );
  }
  await tx.userClinicRole.upsert({
    where: { userId_clinicId_role: { userId: actor.userId, clinicId, role: 'VOLUNTEER' } },
    update: {},
    create: { userId: actor.userId, clinicId, role: 'VOLUNTEER' },
  });
}

export type Outcome = 'created' | 'matched' | 'already-imported';

export interface PatientResult {
  visitId: string;
  outcome: Outcome;
  patientId: string;
  patientCode: string;
  /** Rows written, by table. */
  written: Record<string, number>;
  warnings: string[];
}

class DryRunRollback extends Error {
  constructor(readonly result: PatientResult) {
    super('dry run');
  }
}

/** The same validation the HTTP ValidationPipe applies (apps/api/src/main.ts). */
export async function validateDto<T extends object>(
  cls: ClassConstructor<T>,
  plain: object,
): Promise<T> {
  const dto = plainToInstance(cls, plain, { enableImplicitConversion: true });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const flat = (es: typeof errors, path = ''): string[] =>
      es.flatMap((e) => [
        ...Object.values(e.constraints ?? {}).map((m) => `${path}${e.property}: ${m}`),
        ...flat(e.children ?? [], `${path}${e.property}.`),
      ]);
    throw new Error(`${cls.name} is invalid: ${flat(errors).join('; ')}`);
  }
  return dto;
}

/**
 * Write one patient's screening day through the API's own services, as the import user, inside one
 * clinic-scoped transaction. All of it lands or none of it does; a dry run does every write and then
 * rolls the transaction back, so it fails exactly where an apply would.
 */
export async function importPatient(
  s: ImportServices,
  plan: PatientPlan,
  opts: { clinicId: string; sessionDate: string; actor: ImportActor; apply: boolean },
): Promise<PatientResult> {
  const { clinicId, actor, sessionDate } = opts;
  const requestId = plan.requestId;
  const written: Record<string, number> = {};
  const count = (table: string, n = 1) => (written[table] = (written[table] ?? 0) + n);
  const warnings = [...plan.warnings];
  const reject = (reason: string): never => {
    throw new RowRejectedError(plan.visitId, [reason]);
  };

  const run = () =>
    s.prisma.withClinicContext(
      clinicId,
      { userId: actor.userId, requestId },
      async (tx) => {
        await ensureImportUser(tx, s.audit, clinicId, sessionDate, requestId);

        // The check-in's deterministic id is the import's external key: it is written in the same
        // transaction as everything else, so finding it means this visit is already fully imported.
        const done = await tx.patientCheckIn.findUnique({
          where: { id: plan.checkIn.id },
          include: { patient: { select: { id: true, patientCode: true } } },
        });
        if (done) {
          return {
            visitId: plan.visitId,
            outcome: 'already-imported' as const,
            patientId: done.patient.id,
            patientCode: done.patient.patientCode,
            written,
            warnings: [],
          };
        }

        // ---- Patient: returning code, then national ID, then a new chart. Never merged here.
        const select = {
          id: true,
          patientCode: true,
          primaryClinicId: true,
          mergedIntoPatientId: true,
          firstName: true,
          lastName: true,
        };
        const byCode = plan.returningCode
          ? await tx.patient.findUnique({ where: { patientCode: plan.returningCode }, select })
          : null;
        if (plan.returningCode && !byCode)
          reject(`No patient ${plan.returningCode} at this clinic`);
        const byId =
          plan.patient.nationalIdType !== 'NONE'
            ? await tx.patient.findUnique({
                where: { nationalIdHash: hashNationalId(plan.patient.nationalId) },
                select,
              })
            : null;
        if (byCode && byId && byCode.id !== byId.id) {
          reject(
            `${plan.returningCode} and the national ID belong to two different patients (${byId.patientCode})`,
          );
        }
        let patient = byCode ?? byId;
        let outcome: Outcome = 'matched';
        if (patient) {
          if (patient.mergedIntoPatientId)
            reject(`${patient.patientCode} was merged into another chart`);
          if (patient.primaryClinicId !== clinicId)
            reject(`${patient.patientCode} belongs to another clinic`);
          const sameName =
            patient.firstName.toLowerCase() === plan.patient.firstName.toLowerCase() &&
            patient.lastName.toLowerCase() === plan.patient.lastName.toLowerCase();
          if (!sameName) {
            warnings.push(
              `Matched ${patient.patientCode} (${patient.firstName} ${patient.lastName}) by ${byCode ? 'code' : 'national ID'}; the sheet says ${plan.patient.firstName} ${plan.patient.lastName}`,
            );
          }
        } else {
          patient = await s.patients.create(
            { ...plan.patient, primaryClinicId: clinicId, createdByUserId: actor.userId },
            { clinicId, actorUserId: actor.userId, requestId },
          );
          outcome = 'created';
          count('Patient');
        }
        const patientId = patient.id;

        // ---- Consent, dated the screening day. ConsentService.grant stamps "now" and re-grants,
        // so this writes the row and its CONSENT.GRANT event itself.
        if (plan.consent) {
          const granted = await tx.patientConsent.findFirst({
            where: { patientId, clinicId, consentType: 'RESEARCH_DEIDENTIFIED', status: 'GRANTED' },
          });
          if (granted) {
            warnings.push('Research consent already on file; not recorded again');
          } else {
            const consent = await tx.patientConsent.create({
              data: {
                id: importId(sessionDate, plan.visitId, 'consent'),
                patientId,
                clinicId,
                consentType: 'RESEARCH_DEIDENTIFIED',
                status: 'GRANTED',
                consentVersion: `screening-sheet-${sessionDate}`,
                consentTextSnapshot: SHEET_CONSENT_TEXT,
                grantedAt: plan.checkIn.checkedInAt,
                recordedByUserId: actor.userId,
              },
            });
            await s.audit.logWrite(
              {
                clinicId,
                actorUserId: actor.userId,
                action: 'CONSENT.GRANT',
                entityType: 'PatientConsent',
                entityId: consent.id,
                afterJson: JSON.stringify(consent),
                requestId,
              },
              tx,
            );
            count('PatientConsent');
          }
        }

        // ---- Encounter (DRAFT, for a clinician to review), dated the visit.
        let encounterId: string | null = null;
        if (plan.encounter) {
          const created = await createDraftEncounter(tx, {
            clinicId,
            patientId,
            createdByUserId: actor.userId,
          });
          const encounter = await tx.encounter.update({
            where: { id: created.id },
            data: { createdAt: plan.checkIn.checkedInAt },
          });
          await s.audit.logWrite(
            {
              clinicId,
              actorUserId: actor.userId,
              action: 'ENCOUNTER.CREATE',
              entityType: 'Encounter',
              entityId: encounter.id,
              afterJson: JSON.stringify(encounter),
              requestId,
            },
            tx,
          );
          encounterId = encounter.id;
          count('Encounter');
        }

        // ---- Check-in. OpsService.createCheckIn refuses a past clinic day (ops-replay.ts), so the
        // row and its CHECKIN.CREATE event are written here, closed, and never queued.
        const sameDay = await tx.patientCheckIn.count({
          where: {
            clinicId,
            patientId,
            checkedInAt: {
              gte: new Date(`${sessionDate}T00:00:00Z`),
              lt: new Date(new Date(`${sessionDate}T00:00:00Z`).getTime() + 86_400_000),
            },
          },
        });
        if (sameDay > 0)
          warnings.push(
            'Already has a check-in in Nkwapa on the screening day; check for a double visit',
          );
        const checkIn = await tx.patientCheckIn.create({
          data: {
            id: plan.checkIn.id,
            clinicId,
            patientId,
            checkedInAt: plan.checkIn.checkedInAt,
            source: 'STAFF',
            status: plan.checkIn.status,
            encounterId,
            notes: plan.checkIn.notes,
          },
        });
        await s.audit.logWrite(
          {
            clinicId,
            actorUserId: actor.userId,
            action: 'CHECKIN.CREATE',
            entityType: 'PatientCheckIn',
            entityId: checkIn.id,
            afterJson: JSON.stringify(checkIn),
            requestId,
          },
          tx,
        );
        count('PatientCheckIn');

        if (plan.encounter && encounterId) {
          const e = plan.encounter;
          // Vitals first: the hypertension assessment derives its classification from them.
          if (e.vitals) {
            const payload = { ...e.vitals, encounterId };
            await s.measurements.applyBundle({
              clinicId,
              actorUserId: actor.userId,
              user: { user: { id: actor.userId }, roles: actor.roles },
              mutation: {
                id: randomUUID(),
                entityType: 'Vitals',
                entityId: String(e.vitals.vitalsId),
                operation: 'UPSERT',
                clinicId,
                idempotencyKey: `${requestId}:vitals`,
              },
              payload,
            });
            count('Vitals');
            if ('tobacco' in e.vitals) count('TobaccoScreening');
          }
          if (e.hypertension) {
            const dto = await validateDto(UpsertHypertensionAssessmentDto, e.hypertension);
            await s.hypertension.upsert(
              clinicId,
              encounterId,
              actor,
              dto,
              { requestId },
              importId(sessionDate, plan.visitId, 'hypertension'),
            );
            count('HypertensionAssessment');
          }
          if (e.diabetes) {
            const dto = await validateDto(UpsertDiabetesScreeningDto, e.diabetes);
            await s.diabetes.upsert(
              clinicId,
              encounterId,
              actor,
              dto,
              { requestId },
              importId(sessionDate, plan.visitId, 'diabetes'),
            );
            count('DiabetesScreening');
          }
          if (e.eye) {
            const dto = await validateDto(UpsertEyeScreeningDto, e.eye);
            await s.eye.upsert(clinicId, encounterId, actor.userId, dto, requestId);
            count('EyeScreening');
          }
          if (e.counselling) {
            const dto = await validateDto(UpsertCounsellingDto, e.counselling);
            await s.counselling.upsert(clinicId, encounterId, actor.userId, dto, requestId);
            count('CounsellingRecord');
          }
          for (const record of e.history) {
            const dto = await validateDto(CreateMedicalHistoryDto, {
              ...record,
              sourceEncounterId: encounterId,
            });
            await s.history.create(clinicId, patientId, actor.userId, dto, requestId);
            count('MedicalHistoryRecord');
          }
          for (const record of e.medications) {
            const dto = await validateDto(CreatePatientMedicationDto, {
              ...record,
              sourceEncounterId: encounterId,
            });
            await s.medications.createMedication(clinicId, patientId, actor.userId, dto, {
              requestId,
            });
            count('PatientMedicationRecord');
          }
        }

        const result: PatientResult = {
          visitId: plan.visitId,
          outcome,
          patientId,
          patientCode: patient.patientCode,
          written,
          warnings,
        };
        if (!opts.apply) throw new DryRunRollback(result);
        return result;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

  try {
    return await run();
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    if (error instanceof RowRejectedError) throw error;
    throw new RowRejectedError(plan.visitId, [describe(error)]);
  }
}

/** A service exception's body says what was wrong; its message alone often does not. */
function describe(error: unknown): string {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  if (response && typeof response === 'object') return JSON.stringify(response);
  return error instanceof Error ? error.message : String(error);
}
