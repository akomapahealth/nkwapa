import { Test, TestingModule } from '@nestjs/testing';
import { DeIdentificationService } from './de-identification.service';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { createHmac } from 'crypto';

describe('DeIdentificationService', () => {
  let service: DeIdentificationService;
  let prisma: {
    patientConsent: { findMany: jest.Mock };
    patient: { findMany: jest.Mock };
  };

  const clinicId = 'clinic-1';
  const exportId = 'export-1';

  beforeEach(async () => {
    prisma = {
      patientConsent: { findMany: jest.fn() },
      patient: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeIdentificationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DeIdentificationService);

    // Set a temporary export dir
    process.env.EXPORT_DIR = path.join(__dirname, '__test_exports__');
  });

  afterEach(() => {
    // Clean up export files
    const dir = process.env.EXPORT_DIR!;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.EXPORT_DIR;
  });

  it('returns empty dataset when no consented patients', async () => {
    prisma.patientConsent.findMany.mockResolvedValue([]);

    const result = await service.generateDataset(clinicId, exportId, 'csv');

    expect(result.recordCount).toBe(0);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('generates de-identified CSV with PII stripped', async () => {
    prisma.patientConsent.findMany.mockResolvedValue([{ patientId: 'p1' }]);
    prisma.patient.findMany.mockResolvedValue([
      {
        id: 'p1',
        firstName: 'John',
        lastName: 'Doe',
        dob: new Date('1990-05-15'),
        sex: 'MALE',
        phoneE164: '+233201234567',
        email: 'john@test.com',
        nationalIdCiphertext: 'encrypted',
        nationalIdHash: 'hashed',
        nationalIdLast4: '6789',
        primaryClinicId: clinicId,
        encounters: [
          {
            id: 'enc-1',
            clinicId,
            status: 'FINALIZED',
            createdAt: new Date('2025-06-01'),
            vitals: { systolicBp: 120, diastolicBp: 80, heartRate: 72, weightKg: 70, heightCm: 175, bmi: 22.9 },
            diabetesScreening: { glucoseMgDl: 95, glucoseType: 'FASTING', hba1cPercent: 5.4 },
            hypertensionAssessment: { classification: 'NORMAL', suspected: false, confirmed: false },
            carePlan: { counselingGiven: true, medicationPrescribed: false, followUpDate: new Date('2025-07-01') },
          },
        ],
      },
    ]);

    const result = await service.generateDataset(clinicId, exportId, 'csv');

    expect(result.recordCount).toBe(1);
    const csv = fs.readFileSync(result.filePath, 'utf-8');

    // PII should NOT be present
    expect(csv).not.toContain('John');
    expect(csv).not.toContain('Doe');
    expect(csv).not.toContain('+233201234567');
    expect(csv).not.toContain('john@test.com');
    expect(csv).not.toContain('encrypted');
    expect(csv).not.toContain('hashed');
    expect(csv).not.toContain('6789');

    // Clinical data should be present
    expect(csv).toContain('120');
    expect(csv).toContain('MALE');
    expect(csv).toContain('1990'); // only year from DOB
  });

  it('generates deterministic researchSubjectId via HMAC', async () => {
    // The ID should be deterministic: same patient + same export = same ID
    const hmac1 = createHmac('sha256', exportId).update('p1').digest('hex').substring(0, 16);

    prisma.patientConsent.findMany.mockResolvedValue([{ patientId: 'p1' }]);
    prisma.patient.findMany.mockResolvedValue([
      {
        id: 'p1',
        dob: null,
        sex: 'FEMALE',
        encounters: [],
        primaryClinicId: clinicId,
      },
    ]);

    const result = await service.generateDataset(clinicId, exportId, 'json');
    const data = JSON.parse(fs.readFileSync(result.filePath, 'utf-8'));

    // No encounters → no records in flat structure
    expect(data).toEqual([]);
  });

  it('only includes consented patients', async () => {
    // Only p1 consented, p2 did not
    prisma.patientConsent.findMany.mockResolvedValue([{ patientId: 'p1' }]);
    prisma.patient.findMany.mockResolvedValue([
      {
        id: 'p1',
        dob: new Date('1985-01-01'),
        sex: 'MALE',
        primaryClinicId: clinicId,
        encounters: [
          {
            id: 'enc-1',
            clinicId,
            status: 'FINALIZED',
            createdAt: new Date(),
            vitals: null,
            diabetesScreening: null,
            hypertensionAssessment: null,
            carePlan: null,
          },
        ],
      },
    ]);

    const result = await service.generateDataset(clinicId, exportId, 'json');
    const data = JSON.parse(fs.readFileSync(result.filePath, 'utf-8'));

    expect(result.recordCount).toBe(1);
    // The patient.findMany was called with only consented patient IDs
    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['p1'] } }),
      }),
    );
  });
});
