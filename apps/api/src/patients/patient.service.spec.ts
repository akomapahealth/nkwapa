import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Patient } from "@prisma/client";
import { PatientService } from "./patient.service";
import { PatientRepository } from "./patient.repository";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EncounterService } from "../encounters/encounter.service";
import { ConsentService } from "../consents/consent.service";

const mockPatient: Patient = {
  id: "patient-1",
  patientCode: "NKP-2025-000001",
  primaryClinicId: "clinic-1",
  firstName: "John",
  lastName: "Doe",
  dob: null,
  sex: "UNKNOWN",
  phoneE164: null,
  email: null,
  nationalIdType: "OTHER",
  nationalIdCiphertext: "encrypted",
  nationalIdHash: "hash123",
  nationalIdLast4: "1234",
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("PatientService - national_id dedup conflict", () => {
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
    jest
      .spyOn(patientRepository, "findByNationalIdHash")
      .mockResolvedValue(mockPatient);
  });

  it("throws ConflictException with existing patient summary when national ID already exists", async () => {
    const dto = {
      primaryClinicId: "clinic-1",
      firstName: "Jane",
      lastName: "Doe",
      nationalIdType: "OTHER" as const,
      nationalId: "same-national-id",
      createdByUserId: "user-1",
    };

    await expect(
      service.create(dto, {
        clinicId: "clinic-1",
        actorUserId: "user-1",
        requestId: "req-1",
      })
    ).rejects.toThrow(ConflictException);

    try {
      await service.create(dto, {
        clinicId: "clinic-1",
        actorUserId: "user-1",
        requestId: "req-1",
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
