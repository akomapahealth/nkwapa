import { NotFoundException } from '@nestjs/common';
import { MedicalHistoryController } from './medical-history.controller';

describe('MedicalHistoryController feature flag', () => {
  const original = process.env.FEATURE_MEDICAL_HISTORY_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
    else process.env.FEATURE_MEDICAL_HISTORY_ENABLED = original;
  });

  it('fails closed before invoking medical history logic', () => {
    delete process.env.FEATURE_MEDICAL_HISTORY_ENABLED;
    const service = { getAllergySummary: jest.fn() };
    const controller = new MedicalHistoryController(service as never);

    expect(() =>
      controller.allergySummary({
        clinicId: '00000000-0000-4000-8000-000000000001',
        patientId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toThrow(NotFoundException);
    expect(service.getAllergySummary).not.toHaveBeenCalled();
  });

  it('invokes the clinic-scoped service when enabled', () => {
    process.env.FEATURE_MEDICAL_HISTORY_ENABLED = 'true';
    const service = { getAllergySummary: jest.fn().mockReturnValue({ state: 'NOT_RECORDED' }) };
    const controller = new MedicalHistoryController(service as never);

    expect(
      controller.allergySummary({
        clinicId: '00000000-0000-4000-8000-000000000001',
        patientId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toEqual({ state: 'NOT_RECORDED' });
  });
});
