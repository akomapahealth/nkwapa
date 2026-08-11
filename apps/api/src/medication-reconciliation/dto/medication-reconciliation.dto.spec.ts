import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MedicationSourceType, PatientMedicationStatus } from '@prisma/client';
import {
  CreatePatientMedicationDto,
  CreatePatientPharmacyDto,
} from './medication-reconciliation.dto';

describe('medication reconciliation DTOs', () => {
  it('accepts an uncatalogued medication with a required name and source', async () => {
    const dto = plainToInstance(CreatePatientMedicationDto, {
      medicationName: '  External medicine  ',
      status: PatientMedicationStatus.CURRENT,
      sourceType: MedicationSourceType.PATIENT_REPORTED,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.medicationName).toBe('External medicine');
    expect(dto.drugId).toBeUndefined();
  });

  it('rejects missing medication identity and an unknown source type', async () => {
    const dto = plainToInstance(CreatePatientMedicationDto, {
      medicationName: '',
      status: PatientMedicationStatus.CURRENT,
      sourceType: 'PRESCRIPTION',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a pharmacy name', async () => {
    const dto = plainToInstance(CreatePatientPharmacyDto, { name: '   ' });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
