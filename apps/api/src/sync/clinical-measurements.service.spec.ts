import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  BloodPressureSite,
  EncounterStatus,
  ReadinessToQuit,
  ScreeningAnswer,
  TemperatureSource,
  TobaccoUseStatus,
  UserRole,
} from '@prisma/client';
import { ClinicalMeasurementsService } from './clinical-measurements.service';

const IDS = {
  clinic: '00000000-0000-4000-8000-000000000001',
  encounter: '00000000-0000-4000-8000-000000000002',
  vitals: '00000000-0000-4000-8000-000000000003',
  tobacco: '00000000-0000-4000-8000-000000000004',
  user: '00000000-0000-4000-8000-000000000005',
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    encounterId: IDS.encounter,
    vitalsId: IDS.vitals,
    tobaccoScreeningId: IDS.tobacco,
    vitals: {
      systolicBp: 120,
      diastolicBp: 80,
      bpSite: BloodPressureSite.LEFT_ARM,
      pulseBpm: 72,
      temperatureValue: 98.6,
      temperatureUnit: 'FAHRENHEIT',
      temperatureSource: TemperatureSource.ORAL,
      respiratoryRate: 16,
      spo2Percent: 98,
      weightKg: 70,
      heightCm: 170,
      bmi: 999,
    },
    tobacco: {
      smokingStatus: TobaccoUseStatus.NEVER,
      smokelessTobaccoStatus: TobaccoUseStatus.NOT_ASSESSED,
      passiveExposure: ScreeningAnswer.NO,
      readinessToQuit: ReadinessToQuit.NOT_APPLICABLE,
      counselingGiven: ScreeningAnswer.NO,
    },
    ...overrides,
  };
}

function createHarness(options?: {
  encounter?: { clinicId: string; status: EncounterStatus } | null;
  existingTobacco?: Record<string, unknown> | null;
}) {
  const tx = {
    encounter: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options?.encounter === undefined
            ? { clinicId: IDS.clinic, status: EncounterStatus.DRAFT }
            : options.encounter,
        ),
    },
    vitals: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    },
    tobaccoScreening: {
      findUnique: jest.fn().mockResolvedValue(options?.existingTobacco ?? null),
      upsert: jest
        .fn()
        .mockImplementation(({ create, update }) =>
          Promise.resolve({ id: IDS.tobacco, ...(options?.existingTobacco ? update : create) }),
        ),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    syncMutation: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { tx, prisma, service: new ClinicalMeasurementsService(prisma as never) };
}

describe('ClinicalMeasurementsService', () => {
  it('converts temperature and derives authoritative BMI', async () => {
    const { service } = createHarness();
    const normalized = await service.validateAndNormalize(payload());

    expect(normalized.vitals.temperatureCelsius).toBe(37);
    expect(normalized.vitals.bmi).toBe(24.2);
    expect(normalized.vitals.pulseBpm).toBe(72);
  });

  it.each([
    ['partial blood pressure', { vitals: { systolicBp: 120, bpSite: BloodPressureSite.LEFT_ARM } }],
    [
      'impossible blood pressure ordering',
      {
        vitals: {
          systolicBp: 80,
          diastolicBp: 120,
          bpSite: BloodPressureSite.LEFT_ARM,
        },
      },
    ],
    [
      'missing temperature source',
      { vitals: { temperatureValue: 37, temperatureUnit: 'CELSIUS' } },
    ],
    [
      'invalid enum',
      {
        vitals: {
          systolicBp: 120,
          diastolicBp: 80,
          bpSite: 'MIDDLE_ARM',
        },
      },
    ],
  ])('rejects %s with field errors', async (_label, overrides) => {
    const { service } = createHarness();
    await expect(service.validateAndNormalize(payload(overrides))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // The web client builds this payload in apps/web/lib/clinical-measurements.ts. It used to
  // send the form's default temperature unit alongside an empty temperature, which this
  // validator rejects; because a rejected sync mutation is retried rather than dropped, one
  // such save left the outbox permanently undrainable. Both shapes are pinned here.
  describe('optional temperature pairing', () => {
    it('accepts a vitals bundle with no temperature recorded at all', async () => {
      const { service } = createHarness();
      const normalized = await service.validateAndNormalize(
        payload({
          vitals: {
            systolicBp: 120,
            diastolicBp: 80,
            bpSite: BloodPressureSite.LEFT_ARM,
            temperatureValue: null,
            temperatureUnit: null,
            temperatureSource: null,
          },
        }),
      );

      expect(normalized.vitals.temperatureCelsius).toBeNull();
    });

    it('accepts an otherwise empty vitals bundle', async () => {
      const { service } = createHarness();
      const normalized = await service.validateAndNormalize(payload({ vitals: {} }));

      expect(normalized.vitals.temperatureCelsius).toBeNull();
      expect(normalized.vitals.systolicBp).toBeNull();
    });

    it('rejects a unit sent without a temperature value', async () => {
      const { service } = createHarness();
      await expect(
        service.validateAndNormalize(
          payload({ vitals: { temperatureValue: null, temperatureUnit: 'CELSIUS' } }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('requires screening write permission', async () => {
    const { service } = createHarness();
    await expect(
      service.applyBundle({
        clinicId: IDS.clinic,
        actorUserId: IDS.user,
        user: {
          user: { id: IDS.user },
          roles: [{ clinicId: IDS.clinic, role: UserRole.DIRECTOR }],
        },
        mutation: {
          id: 'mutation-1',
          entityType: 'encounter_vitals_bundle',
          entityId: IDS.vitals,
          clinicId: IDS.clinic,
          operation: 'UPSERT',
          idempotencyKey: 'idempotency-1',
          payloadJson: payload(),
        },
        payload: payload(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects cross-clinic and finalized encounters', async () => {
    const user = {
      user: { id: IDS.user },
      roles: [{ clinicId: IDS.clinic, role: UserRole.VOLUNTEER }],
    };
    const mutation = {
      id: 'mutation-1',
      entityType: 'encounter_vitals_bundle',
      entityId: IDS.vitals,
      clinicId: IDS.clinic,
      operation: 'UPSERT' as const,
      idempotencyKey: 'idempotency-1',
      payloadJson: payload(),
    };
    const crossClinic = createHarness({
      encounter: {
        clinicId: '00000000-0000-4000-8000-000000000099',
        status: EncounterStatus.DRAFT,
      },
    });
    await expect(
      crossClinic.service.applyBundle({
        clinicId: IDS.clinic,
        actorUserId: IDS.user,
        user,
        mutation,
        payload: payload(),
      }),
    ).rejects.toThrow('active clinic');

    const finalized = createHarness({
      encounter: { clinicId: IDS.clinic, status: EncounterStatus.FINALIZED },
    });
    await expect(
      finalized.service.applyBundle({
        clinicId: IDS.clinic,
        actorUserId: IDS.user,
        user,
        mutation,
        payload: payload(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes both records, audits, and idempotency state in one transaction', async () => {
    const { service, prisma, tx } = createHarness();
    await service.applyBundle({
      clinicId: IDS.clinic,
      actorUserId: IDS.user,
      user: { user: { id: IDS.user }, roles: [{ clinicId: IDS.clinic, role: UserRole.VOLUNTEER }] },
      mutation: {
        id: 'mutation-1',
        entityType: 'encounter_vitals_bundle',
        entityId: IDS.vitals,
        clinicId: IDS.clinic,
        operation: 'UPSERT',
        idempotencyKey: 'idempotency-1',
        payloadJson: payload(),
      },
      payload: payload({ markTobaccoReviewed: true }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.vitals.upsert).toHaveBeenCalledTimes(1);
    expect(tx.tobaccoScreening.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reviewedByUserId: IDS.user }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.syncMutation.create).toHaveBeenCalledTimes(1);
  });

  it('clears stale review metadata when tobacco answers change', async () => {
    const { service, tx } = createHarness({
      existingTobacco: {
        smokingStatus: TobaccoUseStatus.CURRENT,
        smokelessTobaccoStatus: TobaccoUseStatus.NOT_ASSESSED,
        passiveExposure: ScreeningAnswer.NO,
        readinessToQuit: ReadinessToQuit.NOT_READY,
        counselingGiven: ScreeningAnswer.NO,
        reviewedByUserId: IDS.user,
        reviewedAt: new Date(),
      },
    });
    await service.applyBundle({
      clinicId: IDS.clinic,
      actorUserId: IDS.user,
      user: { user: { id: IDS.user }, roles: [{ clinicId: IDS.clinic, role: UserRole.DOCTOR }] },
      mutation: {
        id: 'mutation-1',
        entityType: 'encounter_vitals_bundle',
        entityId: IDS.vitals,
        clinicId: IDS.clinic,
        operation: 'UPSERT',
        idempotencyKey: 'idempotency-1',
        payloadJson: payload(),
      },
      payload: payload(),
    });

    expect(tx.tobaccoScreening.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ reviewedByUserId: null, reviewedAt: null }),
      }),
    );
  });
});
