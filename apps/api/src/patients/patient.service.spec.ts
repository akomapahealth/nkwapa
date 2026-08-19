import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Patient } from '@prisma/client';
import { PatientService } from './patient.service';
import { PatientRepository } from './patient.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncounterService } from '../encounters/encounter.service';
import { ConsentService } from '../consents/consent.service';

const mockPatient: Patient = {
  id: 'patient-1',
  patientCode: 'NKP-2025-000001',
  primaryClinicId: 'clinic-1',
  firstName: 'John',
  lastName: 'Doe',
  dob: null,
  sex: 'UNKNOWN',
  phoneE164: null,
  email: null,
  nationalIdType: 'OTHER',
  nationalIdCiphertext: 'encrypted',
  nationalIdHash: 'hash123',
  nationalIdLast4: '1234',
  createdByUserId: null,
  portalUserId: null,
  mergedIntoPatientId: null,
  mergedAt: null,
  mergedByUserId: null,
  residentialLocationStatus: 'NOT_RECORDED',
  residentialRegion: null,
  residentialDistrict: null,
  residentialCommunity: null,
  residentialAddressNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PatientService - national_id dedup conflict', () => {
  let service: PatientService;

  beforeEach(async () => {
    const mockFindByNationalIdHash = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        {
          provide: PatientRepository,
          useValue: {
            findByNationalIdHash: mockFindByNationalIdHash,
            create: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            patient: { create: jest.fn() },
            patientCodeSequence: {
              upsert: jest.fn().mockResolvedValue({ year: 2025, lastNumber: 1 }),
            },
            $transaction: jest.fn((cb) => {
              const tx = {
                patientCodeSequence: {
                  upsert: jest.fn().mockResolvedValue({
                    year: 2025,
                    lastNumber: 1,
                  }),
                },
                patient: { create: jest.fn().mockResolvedValue(mockPatient) },
              };
              return cb(tx);
            }),
          },
        },
        {
          provide: AuditService,
          useValue: { logWrite: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EncounterService,
          useValue: { listByPatient: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ConsentService,
          useValue: { getConsentStatusForClinic: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get(PatientService);
    const patientRepository = module.get(PatientRepository);
    jest.spyOn(patientRepository, 'findByNationalIdHash').mockResolvedValue(mockPatient);
  });

  it('throws ConflictException with existing patient summary when national ID already exists', async () => {
    const dto = {
      primaryClinicId: 'clinic-1',
      firstName: 'Jane',
      lastName: 'Doe',
      nationalIdType: 'OTHER' as const,
      nationalId: 'same-national-id',
      createdByUserId: 'user-1',
    };

    await expect(
      service.create(dto, {
        clinicId: 'clinic-1',
        actorUserId: 'user-1',
        requestId: 'req-1',
      }),
    ).rejects.toThrow(ConflictException);

    try {
      await service.create(dto, {
        clinicId: 'clinic-1',
        actorUserId: 'user-1',
        requestId: 'req-1',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const response = (err as ConflictException).getResponse() as {
        existingPatient?: {
          id: string;
          patientCode: string;
          firstName: string;
          lastName: string;
          nationalIdLast4: string | null;
        };
      };
      expect(response.existingPatient).toEqual({
        id: mockPatient.id,
        patientCode: mockPatient.patientCode,
        firstName: mockPatient.firstName,
        lastName: mockPatient.lastName,
        nationalIdLast4: mockPatient.nationalIdLast4,
      });
    }
  });
});

describe('PatientService - update', () => {
  let service: PatientService;
  let mockAuditLogWrite: jest.Mock;
  let mockRepoUpdate: jest.Mock;
  let mockRepoFindById: jest.Mock;

  const updatedPatient: Patient = {
    ...mockPatient,
    firstName: 'Jane',
    phoneE164: '+233241234567',
  };

  beforeEach(async () => {
    mockAuditLogWrite = jest.fn().mockResolvedValue(undefined);
    mockRepoUpdate = jest.fn().mockResolvedValue(updatedPatient);
    mockRepoFindById = jest.fn().mockResolvedValue(mockPatient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        {
          provide: PatientRepository,
          useValue: {
            findByNationalIdHash: jest.fn(),
            findById: mockRepoFindById,
            update: mockRepoUpdate,
            create: jest.fn(),
            findMany: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            patient: { create: jest.fn() },
            patientCodeSequence: {
              upsert: jest.fn().mockResolvedValue({ year: 2025, lastNumber: 1 }),
            },
            $transaction: jest.fn((cb) =>
              cb({
                patientCodeSequence: {
                  upsert: jest.fn().mockResolvedValue({ year: 2025, lastNumber: 1 }),
                },
                patient: { create: jest.fn().mockResolvedValue(mockPatient) },
              }),
            ),
          },
        },
        {
          provide: AuditService,
          useValue: { logWrite: mockAuditLogWrite },
        },
        {
          provide: EncounterService,
          useValue: { listByPatient: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ConsentService,
          useValue: { getConsentStatusForClinic: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get(PatientService);
  });

  it('updates patient and logs audit event', async () => {
    const result = await service.update(
      'patient-1',
      { firstName: 'Jane' },
      { clinicId: 'clinic-1', actorUserId: 'user-1', requestId: 'req-1' },
    );

    expect(result).toEqual(updatedPatient);
    expect(mockRepoUpdate).toHaveBeenCalledWith('patient-1', { firstName: 'Jane' });
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATIENT.UPDATE',
        entityType: 'Patient',
        entityId: 'patient-1',
        beforeJson: JSON.stringify(mockPatient),
        afterJson: JSON.stringify(updatedPatient),
      }),
    );
  });

  it('normalizes phone number on update', async () => {
    await service.update(
      'patient-1',
      { phoneE164: '0241234567' },
      { clinicId: 'clinic-1', actorUserId: 'user-1' },
    );

    expect(mockRepoUpdate).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({ phoneE164: '+233241234567' }),
    );
  });

  it('throws when patient not found', async () => {
    mockRepoFindById.mockResolvedValue(null);

    await expect(service.update('nonexistent', { firstName: 'Test' })).rejects.toThrow(
      'Patient not found',
    );
  });

  it('does not include nationalId fields in update', async () => {
    await service.update(
      'patient-1',
      { firstName: 'Updated' },
      { clinicId: 'clinic-1', actorUserId: 'user-1' },
    );

    const updateCall = mockRepoUpdate.mock.calls[0][1];
    expect(updateCall).not.toHaveProperty('nationalIdCiphertext');
    expect(updateCall).not.toHaveProperty('nationalIdHash');
    expect(updateCall).not.toHaveProperty('nationalIdLast4');
  });

  it('does not touch residential location when no location field is provided', async () => {
    await service.update(
      'patient-1',
      { firstName: 'Jane' },
      { clinicId: 'clinic-1', actorUserId: 'user-1' },
    );

    const updateCall = mockRepoUpdate.mock.calls[0][1];
    expect(updateCall).not.toHaveProperty('residentialRegion');
    expect(updateCall).not.toHaveProperty('residentialLocationStatus');
  });

  it('resolves a recorded location block on update', async () => {
    await service.update(
      'patient-1',
      {
        residentialRegion: 'GREATER_ACCRA',
        residentialDistrict: 'accra metropolitan',
        residentialCommunity: '  Osu  ',
      },
      { clinicId: 'clinic-1', actorUserId: 'user-1' },
    );

    expect(mockRepoUpdate).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({
        residentialLocationStatus: 'RECORDED',
        residentialRegion: 'GREATER_ACCRA',
        residentialDistrict: 'Accra Metropolitan',
        residentialCommunity: 'Osu',
      }),
    );
  });

  it('clears granular fields when location status is UNKNOWN', async () => {
    await service.update(
      'patient-1',
      {
        residentialLocationStatus: 'UNKNOWN',
        residentialRegion: 'ASHANTI',
        residentialCommunity: 'Bantama',
      },
      { clinicId: 'clinic-1', actorUserId: 'user-1' },
    );

    expect(mockRepoUpdate).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({
        residentialLocationStatus: 'UNKNOWN',
        residentialRegion: null,
        residentialDistrict: null,
        residentialCommunity: null,
        residentialAddressNote: null,
      }),
    );
  });
});

describe('PatientService - create persists resolved location', () => {
  let service: PatientService;
  let txCreate: jest.Mock;

  beforeAll(() => {
    // National ID encryption requires a 32-byte key; deterministic for tests.
    process.env.NATIONAL_ID_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  beforeEach(async () => {
    txCreate = jest.fn().mockResolvedValue(mockPatient);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        {
          provide: PatientRepository,
          useValue: { findByNationalIdHash: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((cb) =>
              cb({
                patientCodeSequence: {
                  upsert: jest.fn().mockResolvedValue({ year: 2025, lastNumber: 1 }),
                },
                patient: { create: txCreate },
              }),
            ),
          },
        },
        { provide: AuditService, useValue: { logWrite: jest.fn().mockResolvedValue(undefined) } },
        { provide: EncounterService, useValue: { listByPatient: jest.fn() } },
        { provide: ConsentService, useValue: { getConsentStatusForClinic: jest.fn() } },
      ],
    }).compile();
    service = module.get(PatientService);
  });

  it('writes a resolved RECORDED location with a canonical district', async () => {
    await service.create({
      primaryClinicId: 'clinic-1',
      firstName: 'Ama',
      lastName: 'Mensah',
      nationalIdType: 'NATIONAL_ID',
      nationalId: 'GHA-1',
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'accra metropolitan',
    });

    const data = txCreate.mock.calls[0][0].data;
    expect(data.residentialLocationStatus).toBe('RECORDED');
    expect(data.residentialRegion).toBe('GREATER_ACCRA');
    expect(data.residentialDistrict).toBe('Accra Metropolitan');
  });

  it('defaults to NOT_RECORDED with no fabricated location', async () => {
    await service.create({
      primaryClinicId: 'clinic-1',
      firstName: 'Kofi',
      lastName: 'Owusu',
      nationalIdType: 'NATIONAL_ID',
      nationalId: 'GHA-2',
    });

    const data = txCreate.mock.calls[0][0].data;
    expect(data.residentialLocationStatus).toBe('NOT_RECORDED');
    expect(data.residentialRegion).toBeNull();
  });
});

describe('PatientService - resolveResidentialLocation invariant', () => {
  const service = new PatientService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('infers NOT_RECORDED with null fields when nothing is supplied', () => {
    expect(service.resolveResidentialLocation({})).toEqual({
      residentialLocationStatus: 'NOT_RECORDED',
      residentialRegion: null,
      residentialDistrict: null,
      residentialCommunity: null,
      residentialAddressNote: null,
    });
  });

  it('infers RECORDED when a region is present', () => {
    const resolved = service.resolveResidentialLocation({ residentialRegion: 'VOLTA' });
    expect(resolved.residentialLocationStatus).toBe('RECORDED');
    expect(resolved.residentialRegion).toBe('VOLTA');
  });

  it('drops a district that does not belong to the region', () => {
    const resolved = service.resolveResidentialLocation({
      residentialRegion: 'GREATER_ACCRA',
      residentialDistrict: 'Kumasi Metropolitan',
    });
    expect(resolved.residentialDistrict).toBeNull();
  });

  it('rejects RECORDED without a region', () => {
    expect(() =>
      service.resolveResidentialLocation({ residentialLocationStatus: 'RECORDED' }),
    ).toThrow();
  });
});
