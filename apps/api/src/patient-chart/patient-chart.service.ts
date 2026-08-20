import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConsentStatus,
  EncounterStatus,
  MedicationReconciliationOutcome,
  PatientMedicationStatus,
  Prisma,
} from '@prisma/client';
import { resolveAccessiblePatientChartSections, type PatientChartFeatureFlag } from '@nkwapa/db';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalHistoryService } from '../medical-history/medical-history.service';
import { permissionsForClinic, type ScopedRole } from '../auth/clinic-roles';
import { PERMISSIONS } from '../auth/constants/permissions';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { buildKeysetWhere, decodeKeysetCursor, encodeKeysetCursor } from '../common/keyset-cursor';
import type {
  ChartPage,
  ChartPendingAction,
  ChartVisitRecord,
  ChartVitalsRecord,
  PatientChartSummary,
} from './dto/patient-chart.dto';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface ChartActor {
  userId: string;
  roles: ScopedRole[];
}

export interface ChartListParams {
  cursor?: string;
  limit?: number;
}

const ENCOUNTER_CONTEXT_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  clinic: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.EncounterSelect;

const VISIT_INCLUDE = {
  clinic: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true } },
  preceptorReviewedBy: { select: { id: true, displayName: true } },
  doctorFinalizedBy: { select: { id: true, displayName: true } },
  vitals: { select: { id: true } },
  diabetesScreening: { select: { id: true } },
  tobaccoScreening: { select: { id: true } },
  hypertensionAssessment: { select: { id: true } },
  carePlan: { select: { id: true } },
  clinicalNote: { select: { status: true } },
  _count: { select: { prescriptions: true } },
} satisfies Prisma.EncounterInclude;

type VisitWithContext = Prisma.EncounterGetPayload<{ include: typeof VISIT_INCLUDE }>;

const VITALS_INCLUDE = {
  encounter: { select: ENCOUNTER_CONTEXT_SELECT },
} satisfies Prisma.VitalsInclude;

type VitalsWithContext = Prisma.VitalsGetPayload<{ include: typeof VITALS_INCLUDE }>;

@Injectable()
export class PatientChartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalHistoryService: MedicalHistoryService,
  ) {}

  /**
   * Sections the caller may read at this clinic. Every payload decision below is driven from
   * this list, so the API can never return a block the chart would not render.
   */
  private accessibleSections(clinicId: string, actor: ChartActor) {
    return resolveAccessiblePatientChartSections({
      permissions: permissionsForClinic(actor.roles, clinicId),
      enabledFeatureFlags: enabledChartFeatureFlags(),
    });
  }

  private can(clinicId: string, actor: ChartActor, permission: string): boolean {
    const permissions = permissionsForClinic(actor.roles, clinicId);
    return permissions.includes('*') || permissions.includes(permission);
  }

  /**
   * Page size is bounded here as well as in the DTO, so a caller reaching the service
   * directly still cannot request an unbounded scan. Anything non-positive or non-finite
   * is treated as "unspecified" and uses the default.
   */
  private boundedLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
    return Math.min(Math.trunc(limit), MAX_PAGE_SIZE);
  }

  private async assertPatientScope(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, primaryClinicId: clinicId, mergedIntoPatientId: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found in the active clinic');
  }

  async getSummary(
    clinicId: string,
    patientId: string,
    actor: ChartActor,
  ): Promise<PatientChartSummary> {
    await this.assertPatientScope(clinicId, patientId);

    const sections = this.accessibleSections(clinicId, actor);
    const has = (id: string) => sections.some((section) => section.id === id);
    const pendingActions: ChartPendingAction[] = [];

    const summary: PatientChartSummary = {
      patientId,
      clinicId,
      sections: sections.map(({ id, label, description }) => ({ id, label, description })),
      vitals: null,
      diabetes: null,
      allergies: null,
      medications: null,
      noteActivity: null,
      visits: null,
      consent: null,
      pendingActions,
    };

    if (has('vitals')) {
      const latest = await this.prisma.vitals.findFirst({
        where: { clinicId, encounter: { patientId } },
        include: VITALS_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      summary.vitals = { latest: latest ? toVitalsRecord(latest) : null };
    }

    if (has('diabetes')) {
      const latest = await this.prisma.diabetesScreening.findFirst({
        where: { clinicId, encounter: { patientId } },
        include: { encounter: { select: ENCOUNTER_CONTEXT_SELECT } },
        orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
      });
      summary.diabetes = {
        latest: latest
          ? {
              id: latest.id,
              collectedAt: latest.collectedAt,
              glucoseMgDl: latest.glucoseMgDl,
              glucoseType: latest.glucoseType,
              hba1cPercent: latest.hba1cPercent,
              symptoms: latest.symptoms,
              notes: latest.notes,
              ...toRecordSource(latest.encounter),
            }
          : null,
      };
    }

    if (has('medical-history')) {
      const allergies = await this.medicalHistoryService.getAllergySummary(clinicId, patientId);
      summary.allergies = allergies;
      if (allergies.state === 'NOT_RECORDED') {
        pendingActions.push({
          kind: 'ALLERGIES_NOT_RECORDED',
          label: 'Allergy status not recorded',
          description: 'Record an allergy status, or attest that there are no known allergies.',
          section: 'medical-history',
          encounterId: null,
          count: 1,
        });
      }
    }

    if (has('medications')) {
      const [currentCount, lastReconciliation] = await Promise.all([
        this.prisma.patientMedicationRecord.count({
          where: {
            clinicId,
            patientId,
            currentRevision: { status: PatientMedicationStatus.CURRENT },
          },
        }),
        this.prisma.medicationReconciliationEvent.findFirst({
          where: { clinicId, patientId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true, outcome: true },
        }),
      ]);
      summary.medications = {
        currentCount,
        noKnownCurrentMedications:
          lastReconciliation?.outcome ===
          MedicationReconciliationOutcome.NO_KNOWN_CURRENT_MEDICATIONS,
        lastReconciledAt: lastReconciliation?.createdAt ?? null,
      };
      if (currentCount === 0 && !lastReconciliation) {
        pendingActions.push({
          kind: 'MEDICATIONS_NOT_RECORDED',
          label: 'Medications not reconciled',
          description: 'No medication list or no-known-medications attestation exists yet.',
          section: 'medications',
          encounterId: null,
          count: 1,
        });
      }
    }

    // Note *status* counts go to status readers; note *content* never does.
    if (this.can(clinicId, actor, PERMISSIONS.CLINICAL_NOTE_STATUS_READ) && hasNotesFeature()) {
      const [pendingCosign, total] = await Promise.all([
        this.prisma.clinicalNote.count({
          where: { clinicId, encounter: { patientId }, status: 'PENDING_COSIGN' },
        }),
        this.prisma.clinicalNote.count({ where: { clinicId, encounter: { patientId } } }),
      ]);
      summary.noteActivity = { pendingCosign, total };
      if (pendingCosign > 0) {
        pendingActions.push({
          kind: 'NOTE_PENDING_COSIGN',
          label: pendingCosign === 1 ? 'Note awaiting cosign' : 'Notes awaiting cosign',
          description: 'A submitted clinical note is waiting for the assigned doctor to cosign.',
          section: has('notes') ? 'notes' : 'visits',
          encounterId: null,
          count: pendingCosign,
        });
      }
    }

    if (has('visits')) {
      const [total, openEncounters, lastVisit] = await Promise.all([
        this.prisma.encounter.count({ where: { clinicId, patientId } }),
        this.prisma.encounter.findMany({
          where: { clinicId, patientId, status: { not: EncounterStatus.FINALIZED } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, status: true },
          take: MAX_PAGE_SIZE,
        }),
        this.prisma.encounter.findFirst({
          where: { clinicId, patientId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true },
        }),
      ]);
      summary.visits = {
        total,
        open: openEncounters.length,
        lastVisitAt: lastVisit?.createdAt ?? null,
      };

      const drafts = openEncounters.filter((e) => e.status === EncounterStatus.DRAFT);
      const inReview = openEncounters.filter((e) => e.status === EncounterStatus.IN_REVIEW);
      if (drafts.length > 0) {
        pendingActions.push({
          kind: 'OPEN_VISIT',
          label: drafts.length === 1 ? 'Open visit in progress' : 'Open visits in progress',
          description: 'A draft encounter has not been submitted for review yet.',
          section: 'visits',
          encounterId: drafts[0].id,
          count: drafts.length,
        });
      }
      if (inReview.length > 0) {
        pendingActions.push({
          kind: 'AWAITING_REVIEW',
          label: 'Visit awaiting review',
          description: 'An encounter has been submitted and is waiting for clinical review.',
          section: 'visits',
          encounterId: inReview[0].id,
          count: inReview.length,
        });
      }
    }

    if (has('consent')) {
      const consent = await this.prisma.patientConsent.findFirst({
        where: { patientId, clinicId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { status: true, grantedAt: true, revokedAt: true },
      });
      summary.consent = {
        status: consent?.status ?? null,
        grantedAt: consent?.grantedAt ?? null,
        revokedAt: consent?.revokedAt ?? null,
      };
      if (consent?.status !== ConsentStatus.GRANTED) {
        pendingActions.push({
          kind: 'RESEARCH_CONSENT_NOT_RECORDED',
          label: 'Research consent not granted',
          description: 'De-identified research consent has not been recorded for this patient.',
          section: 'consent',
          encounterId: null,
          count: 1,
        });
      }
    }

    return summary;
  }

  async listVitals(
    clinicId: string,
    patientId: string,
    params: ChartListParams = {},
  ): Promise<ChartPage<ChartVitalsRecord>> {
    await this.assertPatientScope(clinicId, patientId);
    const limit = this.boundedLimit(params.limit);
    const cursor = params.cursor
      ? decodeKeysetCursor(params.cursor, 'The vitals history cursor is invalid.')
      : null;

    const records = await this.prisma.vitals.findMany({
      where: { clinicId, encounter: { patientId }, ...buildKeysetWhere('createdAt', cursor) },
      include: VITALS_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map(toVitalsRecord);
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeKeysetCursor(last.recordedAt, last.id) : null,
    };
  }

  async listVisits(
    clinicId: string,
    patientId: string,
    actor: ChartActor,
    params: ChartListParams = {},
  ): Promise<ChartPage<ChartVisitRecord>> {
    await this.assertPatientScope(clinicId, patientId);
    const limit = this.boundedLimit(params.limit);
    const cursor = params.cursor
      ? decodeKeysetCursor(params.cursor, 'The visit history cursor is invalid.')
      : null;
    const includeNoteStatus =
      this.can(clinicId, actor, PERMISSIONS.CLINICAL_NOTE_STATUS_READ) && hasNotesFeature();

    const records = await this.prisma.encounter.findMany({
      where: { clinicId, patientId, ...buildKeysetWhere('createdAt', cursor) },
      include: VISIT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((record) => toVisitRecord(record, includeNoteStatus));
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }
}

function enabledChartFeatureFlags(): PatientChartFeatureFlag[] {
  const flags: PatientChartFeatureFlag[] = [];
  if (isApiFeatureEnabled('medicalHistory')) flags.push('medicalHistory');
  if (isApiFeatureEnabled('medicationReconciliation')) flags.push('medicationReconciliation');
  if (isApiFeatureEnabled('clinicalNotes')) flags.push('clinicalNotes');
  return flags;
}

function hasNotesFeature(): boolean {
  return isApiFeatureEnabled('clinicalNotes');
}

function toRecordSource(encounter: {
  id: string;
  status: EncounterStatus;
  createdAt: Date;
  clinic: { id: string; name: string };
  createdBy: { id: string; displayName: string } | null;
}) {
  return {
    encounterId: encounter.id,
    encounterStatus: encounter.status,
    encounterCreatedAt: encounter.createdAt,
    recordedBy: encounter.createdBy,
    clinic: encounter.clinic,
    locked: encounter.status === EncounterStatus.FINALIZED,
  };
}

function toVitalsRecord(record: VitalsWithContext): ChartVitalsRecord {
  return {
    id: record.id,
    recordedAt: record.createdAt,
    updatedAt: record.updatedAt,
    systolicBp: record.systolicBp,
    diastolicBp: record.diastolicBp,
    pulseBpm: record.pulseBpm,
    temperatureCelsius: record.temperatureCelsius,
    respiratoryRate: record.respiratoryRate,
    spo2Percent: record.spo2Percent,
    weightKg: record.weightKg,
    heightCm: record.heightCm,
    bmi: record.bmi,
    notes: record.notes,
    ...toRecordSource(record.encounter),
  };
}

function toVisitRecord(record: VisitWithContext, includeNoteStatus: boolean): ChartVisitRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    locked: record.status === EncounterStatus.FINALIZED,
    createdBy: record.createdBy,
    reviewedBy: record.preceptorReviewedBy,
    finalizedBy: record.doctorFinalizedBy,
    clinic: record.clinic,
    recorded: {
      vitals: record.vitals !== null,
      diabetesScreening: record.diabetesScreening !== null,
      tobaccoScreening: record.tobaccoScreening !== null,
      hypertensionAssessment: record.hypertensionAssessment !== null,
      carePlan: record.carePlan !== null,
      prescriptions: record._count.prescriptions,
      // Key omitted entirely, not blanked, for roles without note status access.
      ...(includeNoteStatus ? { noteStatus: record.clinicalNote?.status ?? null } : {}),
    },
  };
}
