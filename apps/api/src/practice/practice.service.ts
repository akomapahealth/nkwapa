import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { CheckInStatus, Sex } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientService } from '../patients/patient.service';
import { OpsService } from '../ops/ops.service';
import { StationService } from '../ops/station.service';
import { CLINICAL_NOTE_DELETE_ACTION, EncounterService } from '../encounters/encounter.service';

/** The reason on every check-in, station visit and draft a practice clear closes. */
export const PRACTICE_CLEARED_REASON = 'PRACTICE_CLEARED';

/** A second "Add" this soon after the last practice chart at the clinic is a double tap. */
export const PRACTICE_ADD_COOLDOWN_MS = 5_000;

const OPEN_CHECK_IN = { in: ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] as CheckInStatus[] };
const DEMO = { isDemo: true } as const;

/** Invented names. The last name always starts "Demo" so nobody mistakes the chart for a person. */
const PRACTICE_NAMES: Array<[string, Sex]> = [
  ['Kwabena', 'MALE'],
  ['Esi', 'FEMALE'],
  ['Kojo', 'MALE'],
  ['Adwoa', 'FEMALE'],
  ['Yaw', 'MALE'],
  ['Akosua', 'FEMALE'],
  ['Kwame', 'MALE'],
  ['Abena', 'FEMALE'],
  ['Kofi', 'MALE'],
  ['Ama', 'FEMALE'],
];
const PRACTICE_SURNAMES = ['Mensah', 'Boateng', 'Owusu', 'Asante', 'Appiah', 'Darko', 'Frimpong'];

export interface PracticeActor {
  userId: string;
  requestId?: string;
}

/** A practice chart's name and birth date, for patient number `index` of a batch. */
export function practicePatient(index: number, now: Date, random: () => number = Math.random) {
  const [firstName, sex] = PRACTICE_NAMES[index % PRACTICE_NAMES.length];
  const surname = PRACTICE_SURNAMES[Math.floor(random() * PRACTICE_SURNAMES.length)];
  const age = 25 + Math.floor(random() * 51); // 25 to 75
  const dob = new Date(now);
  dob.setUTCFullYear(dob.getUTCFullYear() - age);
  dob.setUTCDate(dob.getUTCDate() - Math.floor(random() * 365));
  dob.setUTCHours(0, 0, 0, 0);
  return { firstName, lastName: `Demo ${surname}`, sex, dob };
}

/**
 * Practice sessions before a screening day (#410): a director fills the station line with demo
 * charts, volunteers press every button once, and the director clears them again. Demo charts are
 * kept out of every report by `isDemo`; this only creates and tidies them.
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patients: PatientService,
    private readonly ops: OpsService,
    private readonly stations: StationService,
    private readonly encounters: EncounterService,
  ) {}

  /** What a clear would close, for the confirm dialog. */
  async summary(clinicId: string) {
    const ofDemo = { clinicId, patient: DEMO };
    const [charts, openCheckIns, withVolunteer, drafts, kept] = await Promise.all([
      this.prisma.patient.count({
        where: { primaryClinicId: clinicId, ...DEMO, demoClearedAt: null },
      }),
      this.prisma.patientCheckIn.count({ where: { ...ofDemo, status: OPEN_CHECK_IN } }),
      // Held at a station now: a check-in stays IN_PROGRESS while it waits between stations.
      this.prisma.patientStationVisit.count({
        where: { clinicId, status: 'IN_PROGRESS', patientCheckIn: { patient: DEMO } },
      }),
      this.prisma.encounter.count({ where: { ...ofDemo, status: 'DRAFT' } }),
      this.keptDraftVisits(clinicId),
    ]);
    return { charts, openCheckIns, withVolunteer, draftVisits: drafts - kept.size };
  }

  /** Draft demo visits a submitted note keeps (RLS hides notes from directors; ids only). */
  private async keptDraftVisits(clinicId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT app.practice_kept_draft_visits(${clinicId}::uuid) AS id
    `;
    return new Set(rows.map((row) => row.id));
  }

  async addPatients(
    clinicId: string,
    actor: PracticeActor,
    body: { count: number; checkIn?: boolean },
    now: Date = new Date(),
  ) {
    // shortcut: two requests in the same instant can both pass this check; the route's per-user
    // rate limit catches that while Redis is up. Upgrade to a clinic lock if it is ever seen.
    const recent = await this.prisma.patient.findFirst({
      where: {
        primaryClinicId: clinicId,
        ...DEMO,
        createdAt: { gt: new Date(now.getTime() - PRACTICE_ADD_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      throw new HttpException(
        {
          code: 'PRACTICE_TOO_SOON',
          message: 'Demo patients were just added. Check the station line before adding more.',
          recoveryAction: 'Wait a few seconds and try again if you need more.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Refuse before creating anything when the check-ins would fail: a half-done add tempts a retry.
    if (body.checkIn) {
      const active = await this.prisma.clinic.findFirst({
        where: { id: clinicId, isActive: true },
        select: { id: true },
      });
      if (!active) throw new ConflictException('This clinic is not active, so no one can check in');
    }

    const audit = { clinicId, actorUserId: actor.userId, requestId: actor.requestId };
    const ids: string[] = [];
    let checkedIn = 0;
    let queuedAtStation: string | null = null;
    try {
      for (let index = 0; index < body.count; index++) {
        const patient = await this.patients.create(
          {
            ...practicePatient(index, now),
            primaryClinicId: clinicId,
            nationalIdType: 'NONE',
            createdByUserId: actor.userId,
            isDemo: true,
          },
          audit,
        );
        ids.push(patient.id);
      }

      if (body.checkIn) {
        for (const patientId of ids) {
          const checkIn = await this.ops.createCheckIn(
            clinicId,
            actor.userId,
            { patientId },
            {
              requestId: actor.requestId,
            },
          );
          checkedIn++;
          if ('queuedAtStation' in checkIn) queuedAtStation ??= checkIn.queuedAtStation;
        }
      }
    } finally {
      // Also when cut short, so the log says how many charts exist. Counts only, never a name.
      if (ids.length > 0) {
        await this.audit.logWrite({
          ...audit,
          action: 'PRACTICE.CREATE',
          entityType: 'Clinic',
          entityId: clinicId,
          afterJson: JSON.stringify({ created: ids.length, checkedIn }),
        });
      }
    }
    return { created: ids.length, checkedIn, queuedAtStation };
  }

  /**
   * Close every open practice check-in, delete practice drafts, and mark the charts cleared.
   * Finalized or submitted practice work is never deleted: audit history stays whole, and
   * `isDemo` keeps it out of reports. Each step commits on its own, so a clear cut short is
   * finished by clearing again.
   */
  async clear(clinicId: string, actor: PracticeActor) {
    const context = { requestId: actor.requestId };

    const open = await this.prisma.patientCheckIn.findMany({
      where: { clinicId, patient: DEMO, status: OPEN_CHECK_IN },
      select: { id: true },
    });
    let cancelledCheckIns = 0;
    for (const checkIn of open) {
      try {
        // The patient route permission stands in for OPS.STATION.MANAGE: these are demo charts.
        await this.stations.cancelCheckIn(
          clinicId,
          checkIn.id,
          { userId: actor.userId, canManage: true },
          PRACTICE_CLEARED_REASON,
          context,
        );
        cancelledCheckIns++;
      } catch (error) {
        // Closed by a volunteer between the list and here: nothing left to do.
        if (!(error instanceof ConflictException)) throw error;
      }
    }

    const notes = await this.prisma.$transaction(async (tx) => {
      // RLS hides notes from directors; this definer function deletes demo drafts only.
      const rows = await tx.$queryRaw<Array<{ note_id: string; encounter_id: string }>>`
        SELECT * FROM app.practice_clear_draft_notes(${clinicId}::uuid)
      `;
      for (const row of rows) {
        await this.audit.logWrite(
          {
            clinicId,
            actorUserId: actor.userId,
            action: CLINICAL_NOTE_DELETE_ACTION,
            entityType: 'ClinicalNote',
            entityId: row.note_id,
            beforeJson: JSON.stringify({ id: row.note_id, encounterId: row.encounter_id }),
            afterJson: JSON.stringify({ deleted: true, reason: PRACTICE_CLEARED_REASON }),
            requestId: actor.requestId,
          },
          tx,
        );
      }
      return rows;
    });
    const kept = await this.keptDraftVisits(clinicId);

    const drafts = await this.prisma.encounter.findMany({
      where: { clinicId, patient: DEMO, status: 'DRAFT' },
      select: { id: true },
    });
    let deletedDrafts = 0;
    for (const draft of drafts) {
      if (kept.has(draft.id)) continue;
      try {
        const patientId = await this.prisma.$transaction((tx) =>
          this.encounters.deleteDraftInTx(tx, clinicId, draft.id, PRACTICE_CLEARED_REASON, actor),
        );
        await this.encounters.recomputeRiskAfterDelete(patientId, actor.userId);
        deletedDrafts++;
      } catch (error) {
        // Submitted, or given a note, since the list: it is no longer a draft to delete.
        if (!(error instanceof ConflictException)) throw error;
      }
    }

    const { count: charts } = await this.prisma.patient.updateMany({
      where: { primaryClinicId: clinicId, ...DEMO, demoClearedAt: null },
      data: { demoClearedAt: new Date() },
    });

    const result = {
      charts,
      cancelledCheckIns,
      deletedDrafts,
      deletedNotes: notes.length,
    };
    await this.audit.logWrite({
      clinicId,
      actorUserId: actor.userId,
      action: 'PRACTICE.CLEAR',
      entityType: 'Clinic',
      entityId: clinicId,
      afterJson: JSON.stringify(result),
      requestId: actor.requestId,
    });
    return result;
  }
}
