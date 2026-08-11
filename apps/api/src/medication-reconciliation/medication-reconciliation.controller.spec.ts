import { NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '../auth/constants/permissions';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { MedicationReconciliationController } from './medication-reconciliation.controller';

describe('MedicationReconciliationController', () => {
  const original = process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;
    else process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED = original;
  });

  it('fails closed before invoking feature logic', () => {
    delete process.env.FEATURE_MEDICATION_RECONCILIATION_ENABLED;
    const service = { list: jest.fn() };
    const controller = new MedicationReconciliationController(service as never);

    expect(() =>
      controller.list({
        clinicId: '00000000-0000-4000-8000-000000000001',
        patientId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toThrow(NotFoundException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('keeps reconciliation writes and prescription reads separately permissioned', () => {
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        MedicationReconciliationController.prototype.createMedication,
      ),
    ).toBe(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE);
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        MedicationReconciliationController.prototype.prescriptionHistory,
      ),
    ).toBe(PERMISSIONS.PRESCRIPTION_READ);
    expect(PERMISSIONS.MEDICATION_RECONCILIATION_WRITE).not.toBe(PERMISSIONS.PRESCRIPTION_WRITE);
  });
});
