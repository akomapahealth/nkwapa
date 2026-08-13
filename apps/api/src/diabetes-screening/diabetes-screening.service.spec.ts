import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DiabetesScreeningService } from './diabetes-screening.service';

const doctor = { userId: 'user-1', roles: [{ role: 'DOCTOR' }] } as never;
const director = { userId: 'director-1', roles: [{ role: 'DIRECTOR' }] } as never;

const dto = {
  glucoseMgDl: 126,
  glucoseType: 'FASTING',
  hba1cPercent: 6.4,
  symptoms: ['POLYURIA'],
  notes: 'Clinical note',
  collectedAt: '2026-08-12T12:00:00.000Z',
};

function saved(overrides: Record<string, unknown> = {}) {
  return {
    id: 'screening-1',
    clinicId: 'clinic-1',
    encounterId: 'encounter-1',
    glucoseMgDl: 126,
    glucoseType: 'FASTING',
    hba1cPercent: 6.4,
    symptoms: ['POLYURIA'],
    symptomsJson: null,
    legacySymptomsUnmapped: false,
    notes: 'Clinical note',
    collectedAt: new Date('2026-08-12T12:00:00.000Z'),
    authoredByUserId: 'user-1',
    authoredBy: { id: 'user-1', displayName: 'Dr Example' },
    encounter: {
      id: 'encounter-1',
      patientId: 'patient-1',
      createdAt: new Date('2026-08-12T11:00:00.000Z'),
      status: 'DRAFT',
    },
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  };
}

describe('DiabetesScreeningService', () => {
  function setup(encounter = { clinicId: 'clinic-1', patientId: 'patient-1', status: 'DRAFT' }) {
    const tx = {
      encounter: { findUnique: jest.fn().mockResolvedValue(encounter) },
      diabetesScreening: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(saved()),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }) },
      diabetesScreening: { findMany: jest.fn().mockResolvedValue([saved()]) },
    };
    return { service: new DiabetesScreeningService(prisma as never), prisma, tx };
  }

  it('creates a scoped screening with server-controlled author and audit metadata', async () => {
    const { service, tx } = setup();
    const result = await service.upsert('clinic-1', 'encounter-1', doctor, dto as never, {
      requestId: 'request-1',
    });

    expect(tx.diabetesScreening.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clinicId: 'clinic-1',
          encounterId: 'encounter-1',
          authoredByUserId: 'user-1',
          symptoms: ['POLYURIA'],
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DIABETES_SCREENING.CREATE',
        requestId: 'request-1',
      }),
    });
    expect(result).toMatchObject({
      author: { id: 'user-1', displayName: 'Dr Example' },
      sourceEncounter: { id: 'encounter-1', status: 'DRAFT' },
      isEditable: true,
    });
  });

  it('preserves explicit nulls and the existing id on update', async () => {
    const { service, tx } = setup();
    tx.diabetesScreening.findUnique.mockResolvedValue(saved());
    await service.upsert(
      'clinic-1',
      'encounter-1',
      doctor,
      { ...dto, glucoseMgDl: null, hba1cPercent: null, notes: null, symptoms: [] } as never,
      {},
      'different-client-id',
    );

    expect(tx.diabetesScreening.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          glucoseMgDl: null,
          hba1cPercent: null,
          notes: null,
          symptoms: [],
          legacySymptomsUnmapped: false,
        }),
      }),
    );
  });

  it('rejects writes without screening permission', async () => {
    const { service, tx } = setup();
    await expect(
      service.upsert('clinic-1', 'encounter-1', director, dto as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.diabetesScreening.upsert).not.toHaveBeenCalled();
  });

  it('rejects cross-clinic and finalized encounter writes', async () => {
    const crossClinic = setup({ clinicId: 'clinic-2', patientId: 'patient-1', status: 'DRAFT' });
    await expect(
      crossClinic.service.upsert('clinic-1', 'encounter-1', doctor, dto as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    const finalized = setup({ clinicId: 'clinic-1', patientId: 'patient-1', status: 'FINALIZED' });
    await expect(
      finalized.service.upsert('clinic-1', 'encounter-1', doctor, dto as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects collection times more than five minutes in the future', async () => {
    const { service } = setup();
    await expect(
      service.upsert('clinic-1', 'encounter-1', doctor, {
        ...dto,
        collectedAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists newest records with source context and read-only status for directors', async () => {
    const { service, prisma } = setup();
    const response = await service.list('clinic-1', 'patient-1', director, { limit: 25 });

    expect(prisma.patient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ primaryClinicId: 'clinic-1' }) }),
    );
    expect(response.items[0]).toMatchObject({
      id: 'screening-1',
      patientId: 'patient-1',
      isEditable: false,
    });
  });
});
