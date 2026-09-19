import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, MedicationAdherenceContext, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { parseAdherenceEntries } from '@nkwapa/db';
import { PERMISSIONS } from '../auth/constants/permissions';
import { assertPermissionAtClinic, type ScopedRole } from '../auth/clinic-roles';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertMedicationAdherenceDto } from './dto/medication-adherence.dto';

export interface MedicationAdherenceActor {
  userId: string;
  roles: ScopedRole[];
}

export interface MedicationAdherenceRequestMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  syncMutation?: { entityType: string; entityId: string; idempotencyKey: string };
}

type AdherenceWithContext = Prisma.EncounterMedicationAdherenceGetPayload<{
  include: {
    authoredBy: { select: { id: true; displayName: true } };
    observedRevision: {
      select: {
        id: true;
        revisionNumber: true;
        medicationName: true;
        strength: true;
        dose: true;
        doseUnit: true;
        route: true;
        frequency: true;
        status: true;
        drug: { select: { id: true; name: true; category: true } };
      };
    };
  };
}>;

/**
 * Per-encounter medication adherence.
 *
 * The medications themselves are the reconciled patient list -- `PatientMedicationRecord` /
 * `PatientMedicationRevision` -- and this module never writes to it. What it owns is the
 * observation a volunteer makes at one visit about one of those medications. Recording these as a
 * medication revision would fill the medication history with non-changes and corrupt
 * `lastReconciledAt`; see `docs/specs/14_CHRONIC_DISEASE_INTERVIEWS.md`.
 *
 * Permissions are the interview's, not medication reconciliation's. The row is an encounter
 * observation saved with the rest of the interview and must be refused on a finalized encounter
 * along with it, so `SCREENING.READ` / `SCREENING.WRITE` are what decide. Reading the medication
 * list itself stays on its own route behind `MEDICATION_RECONCILIATION.READ`.
 */
@Injectable()
export class MedicationAdherenceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    clinicId: string,
    encounterId: string,
    actor: MedicationAdherenceActor,
    context?: MedicationAdherenceContext,
  ) {
    this.assertReadPermission(actor.roles, clinicId);
    await this.findEncounterOrThrow(this.prisma, clinicId, encounterId);

    const records = await this.prisma.encounterMedicationAdherence.findMany({
      where: { clinicId, encounterId, ...(context ? { context } : {}) },
      include: this.contextInclude(),
      /*
        Ordered by the medication's own creation, not by the observation's.

        A volunteer sees the list in the order the Medications tab shows it; ordering by when each
        answer happened to be saved would reshuffle the cards under them between visits.
      */
      orderBy: [{ context: 'asc' }, { medicationRecord: { createdAt: 'asc' } }, { id: 'asc' }],
    });

    return { items: records.map((record) => this.toResponse(record)) };
  }

  /**
   * Replace the whole set for one encounter and one condition.
   *
   * Set replacement rather than per-row upsert: a medication the volunteer removed from the
   * reconciled list must not leave behind an observation asserting the patient is still on it, and
   * nothing else in the request would say to delete it.
   */
  async replaceForEncounter(
    clinicId: string,
    encounterId: string,
    actor: MedicationAdherenceActor,
    dto: UpsertMedicationAdherenceDto,
    metadata: MedicationAdherenceRequestMetadata = {},
  ) {
    this.assertWritePermission(actor.roles, clinicId);

    /*
      Re-run the shared parser over the DTO.

      class-validator has checked each field's type and vocabulary; this checks the things that are
      properties of the set rather than of a field -- a duplicate medication, an "other" barrier
      with nothing written in it -- and applies the context rules, so the database CHECK constraint
      stays a backstop rather than becoming the thing that reports the bug.
    */
    const parsed = parseAdherenceEntries(dto.context, dto.entries);
    if (parsed.issues.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Medication adherence validation failed.',
        fieldErrors: parsed.issues.map((issue) => ({
          field: issue.path,
          message: issue.message,
        })),
      });
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const encounter = await this.findEncounterOrThrow(tx, clinicId, encounterId);
      if (encounter.status === EncounterStatus.FINALIZED) {
        throw new ConflictException({
          code: 'CONFLICT_FINALIZED',
          message: 'Cannot modify medication adherence for a finalized encounter',
          existingStatus: encounter.status,
        });
      }

      await this.assertMedicationsBelongToPatient(
        tx,
        clinicId,
        encounter.patientId,
        parsed.entries,
      );

      const before = await tx.encounterMedicationAdherence.findMany({
        where: { clinicId, encounterId, context: dto.context },
        orderBy: [{ id: 'asc' }],
      });

      const keptRecordIds = parsed.entries.map((entry) => entry.medicationRecordId);
      await tx.encounterMedicationAdherence.deleteMany({
        where: {
          clinicId,
          encounterId,
          context: dto.context,
          ...(keptRecordIds.length ? { medicationRecordId: { notIn: keptRecordIds } } : {}),
        },
      });

      for (const entry of parsed.entries) {
        const writable = {
          observedRevisionId: entry.observedRevisionId,
          tookToday: entry.tookToday,
          dosesMissed7d: entry.dosesMissed7d,
          takingAsPrescribed: entry.takingAsPrescribed,
          supplyRemaining: entry.supplyRemaining,
          problems: entry.problems,
          problemsOther: entry.problemsOther,
          authoredByUserId: actor.userId,
        };
        await tx.encounterMedicationAdherence.upsert({
          where: {
            encounterId_context_medicationRecordId: {
              encounterId,
              context: dto.context,
              medicationRecordId: entry.medicationRecordId,
            },
          },
          create: {
            id: randomUUID(),
            clinicId,
            encounterId,
            context: dto.context,
            medicationRecordId: entry.medicationRecordId,
            ...writable,
          },
          update: writable,
        });
      }

      const after = await tx.encounterMedicationAdherence.findMany({
        where: { clinicId, encounterId, context: dto.context },
        include: this.contextInclude(),
        orderBy: [{ medicationRecord: { createdAt: 'asc' } }, { id: 'asc' }],
      });

      await this.writeAudit(tx, {
        clinicId,
        actorUserId: actor.userId,
        action: before.length ? 'MEDICATION_ADHERENCE.UPSERT' : 'MEDICATION_ADHERENCE.CREATE',
        /*
          The encounter, not a row.

          A set replacement can create, update and delete rows in one act; auditing per row would
          record three unrelated events for one thing the volunteer did, and there would be no id
          to attach a deletion to.
        */
        entityId: encounterId,
        before: before.length ? before : null,
        after,
        metadata,
      });

      return after;
    });

    return { items: saved.map((record) => this.toResponse(record)) };
  }

  /**
   * Validate an offline replay through the same DTO the REST route uses.
   *
   * The hypertension record spent a release being written by an inline, unvalidated upsert in the
   * sync handler, which accepted a classification outside the enum. This entity is replayable from
   * the day it exists, so it gets the same hook from the start: `SyncService` calls this and then
   * `replaceForEncounter`, and there is no second code path that could diverge.
   */
  async validateSyncPayload(payload: Record<string, unknown>) {
    const candidate: Record<string, unknown> = { ...payload };
    /*
      Routing information, not record fields.

      The outbox stores which encounter and clinic a mutation belongs to inside the payload, and
      the sync handler addresses the write from there. The DTO runs with `forbidNonWhitelisted`, so
      leaving them in would reject the whole mutation.
    */
    delete candidate.encounterId;
    delete candidate.clinicId;
    delete candidate.updatedAt;
    delete candidate.id;

    const dto = plainToInstance(UpsertMedicationAdherenceDto, candidate);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Medication adherence validation failed.',
        fieldErrors: this.flattenValidationErrors(errors),
      });
    }
    return { dto };
  }

  toResponse(record: AdherenceWithContext) {
    const revision = record.observedRevision;
    return {
      id: record.id,
      clinicId: record.clinicId,
      encounterId: record.encounterId,
      context: record.context,
      medicationRecordId: record.medicationRecordId,
      observedRevisionId: record.observedRevisionId,
      tookToday: record.tookToday,
      dosesMissed7d: record.dosesMissed7d,
      takingAsPrescribed: record.takingAsPrescribed,
      supplyRemaining: record.supplyRemaining,
      problems: record.problems,
      problemsOther: record.problemsOther,
      /*
        The medication is echoed back read-only, so the interview can label a card without a second
        request and an offline device can render the answer it saved.
      */
      observedMedication: {
        revisionNumber: revision.revisionNumber,
        medicationName: revision.medicationName,
        strength: revision.strength,
        dose: revision.dose,
        doseUnit: revision.doseUnit,
        route: revision.route,
        frequency: revision.frequency,
        status: revision.status,
        drug: revision.drug,
      },
      author: record.authoredBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Every medication named in the payload belongs to this encounter's patient, in this clinic.
   *
   * Row level security scopes the write to the clinic, and nothing below this scopes it to the
   * patient. Without this check a payload could attach one patient's medication to another
   * patient's encounter inside the same clinic, and the resulting row would read as a clinical
   * observation about a drug that patient was never on.
   */
  private async assertMedicationsBelongToPatient(
    tx: Prisma.TransactionClient,
    clinicId: string,
    patientId: string,
    entries: readonly { medicationRecordId: string; observedRevisionId: string }[],
  ): Promise<void> {
    if (!entries.length) return;

    const records = await tx.patientMedicationRecord.findMany({
      where: {
        id: { in: entries.map((entry) => entry.medicationRecordId) },
        clinicId,
        patientId,
      },
      select: { id: true, revisions: { select: { id: true } } },
    });

    const revisionsByRecord = new Map(
      records.map((record) => [record.id, new Set(record.revisions.map((r) => r.id))]),
    );

    for (const entry of entries) {
      const revisions = revisionsByRecord.get(entry.medicationRecordId);
      if (!revisions) {
        throw new NotFoundException(
          'A medication in this list is not on the patient record for this encounter',
        );
      }
      /*
        The revision must belong to its own record.

        Otherwise the column meant to pin "the dose that was on screen" could point at a different
        medication's revision entirely, which is worse than not recording it -- it would read as
        provenance.
      */
      if (!revisions.has(entry.observedRevisionId)) {
        throw new NotFoundException(
          'A medication revision in this list does not belong to its medication',
        );
      }
    }
  }

  private async findEncounterOrThrow(
    client: Pick<Prisma.TransactionClient, 'encounter'>,
    clinicId: string,
    encounterId: string,
  ) {
    const encounter = await client.encounter.findUnique({
      where: { id: encounterId },
      select: { clinicId: true, patientId: true, status: true },
    });
    if (!encounter || encounter.clinicId !== clinicId) {
      throw new NotFoundException('Encounter not found in the active clinic');
    }
    return encounter;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    params: {
      clinicId: string;
      actorUserId: string;
      action: string;
      entityId: string;
      before: unknown;
      after: unknown;
      metadata: MedicationAdherenceRequestMetadata;
    },
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        clinicId: params.clinicId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: 'EncounterMedicationAdherence',
        entityId: params.entityId,
        beforeJson: params.before ? JSON.stringify(params.before) : undefined,
        afterJson: JSON.stringify(params.after),
        requestId: params.metadata.requestId ?? randomUUID(),
        ipAddress: params.metadata.ipAddress,
        userAgent: params.metadata.userAgent,
      },
    });
    if (params.metadata.syncMutation) {
      await tx.syncMutation.create({
        data: {
          clinicId: params.clinicId,
          entityType: params.metadata.syncMutation.entityType,
          entityId: params.metadata.syncMutation.entityId,
          operation: 'UPSERT',
          idempotencyKey: params.metadata.syncMutation.idempotencyKey,
          status: 'APPLIED',
        },
      });
    }
  }

  private flattenValidationErrors(
    errors: ValidationError[],
    parentPath?: string,
  ): Array<{ field: string; message: string }> {
    return errors.flatMap((error) => {
      const field = parentPath ? `${parentPath}.${error.property}` : error.property;
      const own = error.constraints
        ? Object.values(error.constraints).map((message) => ({ field, message }))
        : [];
      return [...own, ...this.flattenValidationErrors(error.children ?? [], field)];
    });
  }

  private assertReadPermission(roles: ScopedRole[], clinicId: string): void {
    assertPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.SCREENING_READ,
      'SCREENING.READ permission is required',
    );
  }

  private assertWritePermission(roles: ScopedRole[], clinicId: string): void {
    assertPermissionAtClinic(
      roles,
      clinicId,
      PERMISSIONS.SCREENING_WRITE,
      'SCREENING.WRITE permission is required',
    );
  }

  private contextInclude() {
    return {
      authoredBy: { select: { id: true, displayName: true } },
      observedRevision: {
        select: {
          id: true,
          revisionNumber: true,
          medicationName: true,
          strength: true,
          dose: true,
          doseUnit: true,
          route: true,
          frequency: true,
          status: true,
          drug: { select: { id: true, name: true, category: true } },
        },
      },
    } satisfies Prisma.EncounterMedicationAdherenceInclude;
  }
}
