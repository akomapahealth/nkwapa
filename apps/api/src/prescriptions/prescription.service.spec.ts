import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrescriptionService } from './prescription.service';
import { PrescriptionRepository } from './prescription.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalHistoryService } from '../medical-history/medical-history.service';

const mockPrescription = {
  id: 'rx-1',
  encounterId: 'enc-1',
  clinicId: 'clinic-1',
  drugId: 'drug-1',
  dosage: '10mg',
  frequency: 'twice daily',
  duration: '30 days',
  quantity: 60,
  instructions: 'Take with food',
  prescribedByUserId: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DOCTOR_ROLES = [{ clinicId: 'clinic-1', role: 'DOCTOR' }] as never;
const VOLUNTEER_ROLES = [{ clinicId: 'clinic-1', role: 'VOLUNTEER' }] as never;
const DIRECTOR_ROLES = [{ clinicId: 'clinic-1', role: 'DIRECTOR' }] as never;
const DOCTOR_ELSEWHERE = [{ clinicId: 'another-clinic', role: 'DOCTOR' }] as never;

describe('PrescriptionService', () => {
  const originalMedicalHistoryFlag = process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
  let service: PrescriptionService;
  let mockRepoCreate: jest.Mock;
  let mockRepoFindById: jest.Mock;
  let mockRepoUpdate: jest.Mock;
  let mockRepoDelete: jest.Mock;
  let mockAuditLogWrite: jest.Mock;
  let mockEncounterFind: jest.Mock;
  let mockDrugFind: jest.Mock;
  let mockAllergySummary: jest.Mock;

  beforeEach(async () => {
    mockRepoCreate = jest.fn().mockResolvedValue(mockPrescription);
    mockRepoFindById = jest.fn().mockResolvedValue(mockPrescription);
    mockRepoUpdate = jest.fn().mockResolvedValue({ ...mockPrescription, dosage: '20mg' });
    mockRepoDelete = jest.fn().mockResolvedValue(undefined);
    mockAuditLogWrite = jest.fn().mockResolvedValue(undefined);
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'false';
    mockEncounterFind = jest.fn().mockResolvedValue({
      status: 'DRAFT',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
    });
    mockDrugFind = jest.fn().mockResolvedValue({ id: 'drug-1', clinicId: 'clinic-1' });
    mockAllergySummary = jest
      .fn()
      .mockResolvedValue({ state: 'NO_KNOWN_ALLERGIES', activeAllergies: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionService,
        {
          provide: PrescriptionRepository,
          useValue: {
            create: mockRepoCreate,
            findById: mockRepoFindById,
            update: mockRepoUpdate,
            delete: mockRepoDelete,
            listByEncounter: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            encounter: { findUnique: mockEncounterFind },
            drug: { findUnique: mockDrugFind },
          },
        },
        {
          provide: AuditService,
          useValue: { logWrite: mockAuditLogWrite },
        },
        {
          provide: MedicalHistoryService,
          useValue: { getAllergySummary: mockAllergySummary },
        },
      ],
    }).compile();

    service = module.get(PrescriptionService);
  });

  afterAll(() => {
    if (originalMedicalHistoryFlag === undefined) {
      delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
    } else {
      process.env.FEATURE_MEDICAL_HISTORY_ENABLED = originalMedicalHistoryFlag;
    }
  });

  it('creates prescription and logs audit', async () => {
    const result = await service.create(
      'clinic-1',
      'enc-1',
      {
        drugId: 'drug-1',
        dosage: '10mg',
        frequency: 'twice daily',
      },
      {
        clinicId: 'clinic-1',
        actorUserId: 'user-1',
        roles: DOCTOR_ROLES,
        requestId: 'req-1',
      },
    );

    expect(result).toEqual(mockPrescription);
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRESCRIPTION.CREATE' }),
    );
  });

  it('rejects creation on finalized encounter', async () => {
    mockEncounterFind.mockResolvedValue({
      status: 'FINALIZED',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
    });

    await expect(
      service.create(
        'clinic-1',
        'enc-1',
        {
          drugId: 'drug-1',
          dosage: '10mg',
          frequency: 'daily',
        },
        { clinicId: 'clinic-1', actorUserId: 'user-1', roles: DOCTOR_ROLES },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires allergy review acknowledgement when active allergies exist', async () => {
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    mockAllergySummary.mockResolvedValue({
      state: 'ACTIVE_ALLERGIES',
      activeAllergies: [{ substance: 'Penicillin' }],
    });

    await expect(
      service.create(
        'clinic-1',
        'enc-1',
        {
          drugId: 'drug-1',
          dosage: '10mg',
          frequency: 'daily',
        },
        { clinicId: 'clinic-1', actorUserId: 'user-1', roles: DOCTOR_ROLES },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALLERGY_REVIEW_REQUIRED' }),
    });
  });

  it('updates prescription and logs audit', async () => {
    const result = await service.update(
      'rx-1',
      { dosage: '20mg' },
      {
        clinicId: 'clinic-1',
        actorUserId: 'user-1',
        roles: DOCTOR_ROLES,
      },
    );

    expect(result.dosage).toBe('20mg');
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRESCRIPTION.UPDATE' }),
    );
  });

  it('deletes prescription and logs audit', async () => {
    await service.remove('rx-1', {
      clinicId: 'clinic-1',
      actorUserId: 'user-1',
      roles: DOCTOR_ROLES,
    });

    expect(mockRepoDelete).toHaveBeenCalledWith('rx-1');
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRESCRIPTION.DELETE' }),
    );
  });

  it('throws NotFoundException for non-existent prescription', async () => {
    mockRepoFindById.mockResolvedValue(null);

    await expect(
      service.update(
        'nonexistent',
        { dosage: '5mg' },
        { clinicId: 'clinic-1', actorUserId: 'u', roles: DOCTOR_ROLES },
      ),
    ).rejects.toThrow(NotFoundException);
  });
  /*
    The offline replay and the REST route now run one DTO.

    Before this, `SyncService` wrote prescriptions with an inline Prisma upsert that validated
    almost nothing. Each case below is a payload the online route has always refused and the
    offline path accepted. See #134.
  */
  describe('validating an offline replay', () => {
    const valid = {
      encounterId: 'encounter-1',
      clinicId: 'clinic-1',
      drugId: '11111111-1111-4111-8111-111111111111',
      dosage: '10 mg',
      frequency: 'Once daily',
    };

    it('accepts what the REST route would accept', async () => {
      const { dto } = await service.validateSyncPayload({ ...valid });
      expect(dto).toMatchObject({ dosage: '10 mg', frequency: 'Once daily' });
    });

    it('drops the outbox routing keys rather than rejecting the mutation for carrying them', async () => {
      // The DTO runs with `forbidNonWhitelisted`; leaving them in would refuse a replay whose
      // local save had already succeeded.
      await expect(service.validateSyncPayload({ ...valid })).resolves.toBeDefined();
    });

    /*
      The prescriber is the replaying actor, never the payload.

      `prescribedByUserId` has always been part of the outbox payload -- `PrescriptionForm` sends
      it -- and the old handler trusted it, so a replay could attribute a prescription to a
      clinician who did not write it. It is dropped rather than refused, so a mutation queued
      before this change still replays.
    */
    it('ignores a prescriber named by the payload', async () => {
      const { dto } = await service.validateSyncPayload({
        ...valid,
        prescribedByUserId: 'someone-else',
      });
      expect(dto).not.toHaveProperty('prescribedByUserId');
    });

    it.each([
      ['a quantity below one', { quantity: 0 }],
      ['a negative quantity', { quantity: -5 }],
      ['a drug id that is not a uuid', { drugId: 'not-a-uuid' }],
    ])('refuses %s', async (_label, override) => {
      await expect(service.validateSyncPayload({ ...valid, ...override })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    /*
      Free text is truncated to its column, not refused.

      `ToSanitizedString` transforms before `@MaxLength` runs, so an over-length value is cut to
      size and then passes. That is the REST route's behaviour too, and the point here is that the
      replay now gets it: the old handler stored the raw string, uncapped and with control
      characters intact.
    */
    it('truncates free text to the width of its column', async () => {
      const { dto } = await service.validateSyncPayload({
        ...valid,
        dosage: 'x'.repeat(200),
        instructions: 'y'.repeat(2500),
      });
      expect(dto.dosage).toHaveLength(120);
      expect(dto.instructions).toHaveLength(2000);
    });

    it('strips control characters the replay used to store raw', async () => {
      const { dto } = await service.validateSyncPayload({ ...valid, dosage: '10\u0000 mg' });
      expect(dto.dosage).not.toContain('\u0000');
    });

    /*
      An empty dosage is accepted, by this path and by the REST route alike.

      `CreatePrescriptionDto` has no `@IsNotEmpty` on either required field, so "" survives
      `@IsString()` and `@MaxLength()`. This records that rather than asserting a refusal that does
      not happen. Whether a prescription should be allowed to carry no dose at all is a separate
      question from making the two paths agree; it is noted on #134.
    */
    it('accepts an empty dosage, as the REST route does, and does not pretend otherwise', async () => {
      await expect(
        service.validateSyncPayload({ ...valid, dosage: '', frequency: '' }),
      ).resolves.toBeDefined();
    });

    it('refuses a key the contract does not declare', async () => {
      await expect(
        service.validateSyncPayload({ ...valid, prescribedAt: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports the failing field so a rejected mutation can say which', async () => {
      await service.validateSyncPayload({ ...valid, quantity: 0 }).catch((error) => {
        expect(error.getResponse()).toMatchObject({
          code: 'VALIDATION_ERROR',
          fieldErrors: expect.arrayContaining([expect.objectContaining({ field: 'quantity' })]),
        });
      });
    });
  });

  describe('applying an offline replay', () => {
    const dto = {
      drugId: 'drug-1',
      dosage: '10 mg',
      frequency: 'Once daily',
    } as never;

    it('writes under the id the device queued, so a second delivery is not a second prescription', async () => {
      mockRepoFindById.mockResolvedValueOnce(null);
      await service.upsertFromSync('clinic-1', 'encounter-1', 'queued-id', dto, {
        clinicId: 'clinic-1',
        actorUserId: 'doctor-1',
        roles: DOCTOR_ROLES,
      });
      expect(mockRepoCreate.mock.calls[0][0]).toMatchObject({ id: 'queued-id' });
    });

    it('updates rather than duplicating when the mutation is redelivered', async () => {
      await service.upsertFromSync('clinic-1', 'encounter-1', 'prescription-1', dto, {
        clinicId: 'clinic-1',
        actorUserId: 'doctor-1',
        roles: DOCTOR_ROLES,
      });
      expect(mockRepoCreate).not.toHaveBeenCalled();
      expect(mockRepoUpdate).toHaveBeenCalled();
    });

    it('takes the prescriber from the replaying actor', async () => {
      mockRepoFindById.mockResolvedValueOnce(null);
      await service.upsertFromSync('clinic-1', 'encounter-1', 'queued-id', dto, {
        clinicId: 'clinic-1',
        actorUserId: 'doctor-1',
        roles: DOCTOR_ROLES,
      });
      expect(mockRepoCreate.mock.calls[0][0].prescribedBy).toEqual({ connect: { id: 'doctor-1' } });
    });

    it('refuses a drug that belongs to another clinic', async () => {
      // The inline handler never checked this, so a replay could attach another clinic's drug.
      mockRepoFindById.mockResolvedValueOnce(null);
      mockDrugFind.mockResolvedValueOnce({ id: 'drug-1', clinicId: 'another-clinic' });
      await expect(
        service.upsertFromSync('clinic-1', 'encounter-1', 'queued-id', dto, {
          clinicId: 'clinic-1',
          actorUserId: 'doctor-1',
          roles: DOCTOR_ROLES,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepoCreate).not.toHaveBeenCalled();
    });

    it('refuses a replay onto a finalized encounter', async () => {
      mockRepoFindById.mockResolvedValueOnce(null);
      mockEncounterFind.mockResolvedValueOnce({
        status: 'FINALIZED',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
      });
      await expect(
        service.upsertFromSync('clinic-1', 'encounter-1', 'queued-id', dto, {
          clinicId: 'clinic-1',
          actorUserId: 'doctor-1',
          roles: DOCTOR_ROLES,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to touch a prescription held by another clinic', async () => {
      mockRepoFindById.mockResolvedValueOnce({ ...mockPrescription, clinicId: 'another-clinic' });
      await expect(
        service.upsertFromSync('clinic-1', 'encounter-1', 'prescription-1', dto, {
          clinicId: 'clinic-1',
          actorUserId: 'doctor-1',
          roles: DOCTOR_ROLES,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepoUpdate).not.toHaveBeenCalled();
    });
  });
  /*
    The service decides for itself who may write, below the controller's guard.

    The guided interviews established this and gave the reason: a boundary that depends on one
    layer is one refactor from not being a boundary. It matters more here since #134, because this
    service now has two callers -- the REST controller and the offline replay -- and a service
    reachable from two places that trusts both to have checked is exactly that shape.
  */
  describe('permission, checked here and not only at the controller', () => {
    const dto = { drugId: 'drug-1', dosage: '10 mg', frequency: 'Once daily' } as never;
    const context = (roles: never) => ({ clinicId: 'clinic-1', actorUserId: 'user-1', roles });

    it('refuses a create from a role without the write', async () => {
      await expect(
        service.create('clinic-1', 'encounter-1', dto, context(VOLUNTEER_ROLES)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepoCreate).not.toHaveBeenCalled();
    });

    it('refuses a create from a director, who may read but not prescribe', async () => {
      await expect(
        service.create('clinic-1', 'encounter-1', dto, context(DIRECTOR_ROLES)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a create from a doctor', async () => {
      await expect(
        service.create('clinic-1', 'encounter-1', dto, context(DOCTOR_ROLES)),
      ).resolves.toBeDefined();
    });

    /*
      A seat elsewhere does not authorize a write here.

      `assertPermissionAtClinic` scopes to the clinic rather than scanning the raw role array,
      which is the difference between "is a doctor somewhere" and "is a doctor at this clinic".
    */
    it('refuses a doctor whose seat is at another clinic', async () => {
      await expect(
        service.create('clinic-1', 'encounter-1', dto, context(DOCTOR_ELSEWHERE)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an update and a delete from a role without the write', async () => {
      await expect(
        service.update('prescription-1', { dosage: '20mg' } as never, context(VOLUNTEER_ROLES)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.remove('prescription-1', context(VOLUNTEER_ROLES)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepoUpdate).not.toHaveBeenCalled();
      expect(mockRepoDelete).not.toHaveBeenCalled();
    });

    it('refuses a read from a role that holds neither permission', async () => {
      await expect(
        service.listByEncounter('clinic-1', 'encounter-1', VOLUNTEER_ROLES),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a read from a director, who supervises without prescribing', async () => {
      await expect(
        service.listByEncounter('clinic-1', 'encounter-1', DIRECTOR_ROLES),
      ).resolves.toBeDefined();
    });

    it('refuses a replay whose actor may not prescribe', async () => {
      // The sync permission table refuses this first; the service refuses it again rather than
      // trusting that it did.
      mockRepoFindById.mockResolvedValueOnce(null);
      await expect(
        service.upsertFromSync(
          'clinic-1',
          'encounter-1',
          'queued-id',
          dto,
          context(VOLUNTEER_ROLES),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepoCreate).not.toHaveBeenCalled();
    });
  });
});
