import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertDiabetesScreeningDto } from './diabetes-screening.dto';

function validPayload() {
  return {
    glucoseMgDl: 126,
    glucoseType: 'FASTING',
    hba1cPercent: 6.4,
    symptoms: ['POLYURIA', 'FATIGUE'],
    notes: 'Reports symptoms',
    collectedAt: '2026-08-12T12:00:00.000Z',
  };
}

describe('UpsertDiabetesScreeningDto', () => {
  it.each(['FASTING', 'RANDOM', 'UNKNOWN'])('accepts %s glucose context', async (glucoseType) => {
    const dto = plainToInstance(UpsertDiabetesScreeningDto, { ...validPayload(), glucoseType });
    expect(await validate(dto)).toEqual([]);
  });

  it('accepts explicit null measurements and notes', async () => {
    const dto = plainToInstance(UpsertDiabetesScreeningDto, {
      ...validPayload(),
      glucoseMgDl: null,
      hba1cPercent: null,
      notes: null,
    });
    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    ['glucoseMgDl', -1],
    ['glucoseMgDl', 601],
    ['hba1cPercent', -0.1],
    ['hba1cPercent', 100.1],
    ['glucoseType', 'OTHER'],
    ['symptoms', ['OTHER']],
    ['symptoms', ['FATIGUE', 'FATIGUE']],
    ['collectedAt', 'not-a-date'],
  ])('rejects invalid %s', async (field, value) => {
    const dto = plainToInstance(UpsertDiabetesScreeningDto, {
      ...validPayload(),
      [field]: value,
    });
    expect(await validate(dto)).not.toEqual([]);
  });

  it.each(['glucoseMgDl', 'hba1cPercent', 'notes'])('requires nullable field %s', async (field) => {
    const payload = validPayload() as Record<string, unknown>;
    delete payload[field];
    expect(await validate(plainToInstance(UpsertDiabetesScreeningDto, payload))).not.toEqual([]);
  });
});
