import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MedicationAdherenceService } from './medication-adherence.service';

const volunteer = {
  userId: 'user-1',
  roles: [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }],
} as never;
const outsider = {
  userId: 'user-2',
  roles: [{ clinicId: 'clinic-2', role: 'VOLUNTEER' }],
} as never;

const RECORD_A = '11111111-1111-4111-8111-111111111111';
const REVISION_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const RECORD_B = '22222222-2222-4222-8222-222222222222';
const REVISION_B = 'bbbbbbbb-2222-4222-8222-222222222222';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    medicationRecordId: RECORD_A,
    observedRevisionId: REVISION_A,
    tookToday: 'YES',
    dosesMissed7d: 'ONE',
    takingAsPrescribed: 'NOT_ASSESSED',
    supplyRemaining: 'LESS_THAN_ONE_WEEK',
    problems: ['COST'],
    problemsOther: null,
    ...overrides,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adherence-1',
    clinicId: 'clinic-1',
    encounterId: 'encounter-1',
    context: 'HYPERTENSION',
    medicationRecordId: RECORD_A,
    observedRevisionId: REVISION_A,
    tookToday: 'YES',
    dosesMissed7d: 'ONE',
    takingAsPrescribed: 'NOT_ASSESSED',
    supplyRemaining: 'LESS_THAN_ONE_WEEK',
    problems: ['COST'],
    problemsOther: null,
    authoredBy: { id: 'user-1', displayName: 'A Volunteer' },
    observedRevision: {
      id: REVISION_A,
      revisionNumber: 2,
      medicationName: 'Amlodipine',
      strength: '10mg',
      dose: '1',
      doseUnit: 'tablet',
      route: 'ORAL',
      frequency: 'ONCE_DAILY',
      status: 'CURRENT',
      drug: { id: 'drug-1', name: 'Amlodipine', category: 'ANTIHYPERTENSIVE' },
    },
    createdAt: new Date('2026-09-13T12:00:00.000Z'),
    updatedAt: new Date('2026-09-13T12:00:00.000Z'),
    ...overrides,
  };
}

describe('MedicationAdherenceService', () => {
  function setup(
    options: { encounter?: Record<string, unknown> | null; records?: unknown[] } = {},
  ) {
    const encounter =
      options.encounter === undefined
        ? { clinicId: 'clinic-1', patientId: 'patient-1', status: 'DRAFT' }
        : options.encounter;
    const records = options.records ?? [
      { id: RECORD_A, revisions: [{ id: REVISION_A }] },
      { id: RECORD_B, revisions: [{ id: REVISION_B }] },
    ];

    const tx = {
      encounter: { findUnique: jest.fn().mockResolvedValue(encounter) },
      patientMedicationRecord: { findMany: jest.fn().mockResolvedValue(records) },
      encounterMedicationAdherence: {
        findMany: jest.fn().mockResolvedValue([storedRow()]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue(storedRow()),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      syncMutation: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      encounter: tx.encounter,
      encounterMedicationAdherence: {
        findMany: jest.fn().mockResolvedValue([storedRow()]),
      },
    };
    return { service: new MedicationAdherenceService(prisma as never), prisma, tx };
  }

  describe('access', () => {
    it('refuses a write from outside the clinic', async () => {
      const { service, tx } = setup();
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', outsider, {
          context: 'HYPERTENSION',
          entries: [entry()],
        } as never),
      ).rejects.toThrow();
      expect(tx.encounterMedicationAdherence.upsert).not.toHaveBeenCalled();
    });

    it('refuses an encounter that belongs to another clinic', async () => {
      const { service } = setup({
        encounter: { clinicId: 'clinic-2', patientId: 'patient-1', status: 'DRAFT' },
      });
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry()],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /*
      A finalized encounter is closed to this record as it is to the rest of the interview.

      That is the reason adherence is gated on SCREENING.WRITE rather than on medication
      reconciliation's permission: the reconciled list stays editable after a visit is finalized,
      and an observation made during that visit does not.
    */
    it('refuses a finalized encounter', async () => {
      const { service, tx } = setup({
        encounter: { clinicId: 'clinic-1', patientId: 'patient-1', status: 'FINALIZED' },
      });
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry()],
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.encounterMedicationAdherence.upsert).not.toHaveBeenCalled();
    });
  });

  describe("the medication has to be this patient's", () => {
    /*
      Row level security scopes this to the clinic and nothing below scopes it to the patient.
      Without the check, a payload could attach one patient's medication to another patient's
      encounter inside the same clinic, and the row would read as an observation about a drug that
      patient was never on.
    */
    it('refuses a medication that is not on this patient record', async () => {
      const { service, tx } = setup({ records: [] });
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry()],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.encounterMedicationAdherence.upsert).not.toHaveBeenCalled();
    });

    it('refuses a revision that belongs to a different medication', async () => {
      // The column exists to pin the dose that was on screen. Pointing it elsewhere would be
      // worse than not recording it, because it reads as provenance.
      const { service, tx } = setup();
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry({ observedRevisionId: REVISION_B })],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.encounterMedicationAdherence.upsert).not.toHaveBeenCalled();
    });

    it('scopes the medication lookup to the encounter patient', async () => {
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'HYPERTENSION',
        entries: [entry()],
      } as never);
      expect(tx.patientMedicationRecord.findMany.mock.calls[0][0].where).toMatchObject({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
      });
    });
  });

  describe('replacing the set', () => {
    it('removes the observations for medications no longer in the payload', async () => {
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'HYPERTENSION',
        entries: [entry()],
      } as never);

      expect(tx.encounterMedicationAdherence.deleteMany.mock.calls[0][0].where).toMatchObject({
        encounterId: 'encounter-1',
        context: 'HYPERTENSION',
        medicationRecordId: { notIn: [RECORD_A] },
      });
    });

    it('clears the condition entirely when the payload is empty', async () => {
      // `notIn: []` matches nothing in Postgres, so an empty set has to omit the filter rather
      // than pass an empty list -- otherwise removing the last medication would silently keep it.
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'HYPERTENSION',
        entries: [],
      } as never);

      const where = tx.encounterMedicationAdherence.deleteMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ encounterId: 'encounter-1', context: 'HYPERTENSION' });
      expect(where).not.toHaveProperty('medicationRecordId');
    });

    it('never touches the other condition', async () => {
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'DIABETES',
        entries: [],
      } as never);
      expect(tx.encounterMedicationAdherence.deleteMany.mock.calls[0][0].where.context).toBe(
        'DIABETES',
      );
    });

    it('records the actor on every row it writes', async () => {
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'HYPERTENSION',
        entries: [entry()],
      } as never);
      expect(tx.encounterMedicationAdherence.upsert.mock.calls[0][0].create).toMatchObject({
        authoredByUserId: 'user-1',
      });
    });

    it('audits the encounter rather than each row', async () => {
      // One set replacement can create, update and delete rows in a single act; auditing per row
      // would record several unrelated events for one thing the volunteer did.
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'HYPERTENSION',
        entries: [entry()],
      } as never);
      expect(tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({
        entityType: 'EncounterMedicationAdherence',
        entityId: 'encounter-1',
      });
    });
  });

  describe('the context rules are applied before the write', () => {
    /*
      The database says the same thing in a CHECK constraint. Applying it here means the constraint
      is a backstop rather than the thing that reports the bug, which would reach a volunteer as an
      unexplained 500.
    */
    it('holds the diabetes answer at NOT_ASSESSED on a hypertension row', async () => {
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'HYPERTENSION',
        entries: [entry({ takingAsPrescribed: 'ALWAYS' })],
      } as never);
      expect(tx.encounterMedicationAdherence.upsert.mock.calls[0][0].create).toMatchObject({
        takingAsPrescribed: 'NOT_ASSESSED',
        tookToday: 'YES',
      });
    });

    it('holds both hypertension answers at NOT_ASSESSED on a diabetes row', async () => {
      const { service, tx } = setup();
      await service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
        context: 'DIABETES',
        entries: [entry({ takingAsPrescribed: 'SOMETIMES' })],
      } as never);
      expect(tx.encounterMedicationAdherence.upsert.mock.calls[0][0].create).toMatchObject({
        tookToday: 'NOT_ASSESSED',
        dosesMissed7d: 'NOT_ASSESSED',
        takingAsPrescribed: 'SOMETIMES',
      });
    });
  });

  describe('set-level validation', () => {
    it('refuses a medication that appears twice', async () => {
      const { service, tx } = setup();
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry(), entry()],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.encounterMedicationAdherence.upsert).not.toHaveBeenCalled();
    });

    it('refuses an "other" barrier with nothing written in it', async () => {
      const { service } = setup();
      await expect(
        service.replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry({ problems: ['OTHER'], problemsOther: null })],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports the failing field by its payload path', async () => {
      const { service } = setup();
      await service
        .replaceForEncounter('clinic-1', 'encounter-1', volunteer, {
          context: 'HYPERTENSION',
          entries: [entry({ problems: ['OTHER'], problemsOther: null })],
        } as never)
        .catch((error: BadRequestException) => {
          expect(error.getResponse()).toMatchObject({
            fieldErrors: [{ field: 'entries[0].problemsOther' }],
          });
        });
    });
  });

  describe('replaying an offline mutation', () => {
    /*
      The offline path and the REST path validate identically by construction: both run the DTO
      and then `replaceForEncounter`. Hypertension spent a release without this and accepted a
      classification outside its enum over sync.
    */
    it('rejects a value outside the vocabulary', async () => {
      const { service } = setup();
      await expect(
        service.validateSyncPayload({
          context: 'HYPERTENSION',
          entries: [entry({ supplyRemaining: 'BOGUS' })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a context outside the enum', async () => {
      const { service } = setup();
      await expect(
        service.validateSyncPayload({ context: 'CHOLESTEROL', entries: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('drops the outbox routing keys rather than rejecting the mutation for carrying them', async () => {
      // The outbox stores the clinic and encounter inside the payload, and the DTO runs with
      // `forbidNonWhitelisted`. Leaving them in refuses a replay whose local save had succeeded.
      const { service } = setup();
      const { dto } = await service.validateSyncPayload({
        clinicId: 'clinic-1',
        encounterId: 'encounter-1',
        id: 'local-1',
        updatedAt: '2026-09-13T12:00:00.000Z',
        context: 'HYPERTENSION',
        entries: [entry()],
      });
      expect(dto.context).toBe('HYPERTENSION');
      expect(dto.entries).toHaveLength(1);
    });

    it('rejects an unknown key rather than dropping it', async () => {
      const { service } = setup();
      await expect(
        service.validateSyncPayload({
          context: 'HYPERTENSION',
          entries: [],
          classification: 'STAGE2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reading back', () => {
    it('echoes the medication the observation was made about', async () => {
      const { service } = setup();
      const result = await service.list('clinic-1', 'encounter-1', volunteer);
      expect(result.items[0]).toMatchObject({
        medicationRecordId: RECORD_A,
        observedMedication: { medicationName: 'Amlodipine', revisionNumber: 2 },
      });
    });

    it('filters by condition when one is asked for', async () => {
      const { service, prisma } = setup();
      await service.list('clinic-1', 'encounter-1', volunteer, 'DIABETES' as never);
      expect(prisma.encounterMedicationAdherence.findMany.mock.calls[0][0].where).toMatchObject({
        context: 'DIABETES',
      });
    });

    it('refuses a reader from another clinic', async () => {
      const { service } = setup();
      await expect(service.list('clinic-1', 'encounter-1', outsider)).rejects.toThrow();
    });
  });
});
