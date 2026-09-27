import { NotFoundException } from '@nestjs/common';
import { HypertensionAssessmentController } from './hypertension-assessment.controller';
import { DiabetesScreeningController } from '../diabetes-screening/diabetes-screening.controller';

/**
 * The guided interview's API surface disappears when the feature is off.
 *
 * The spec claimed this was already true and it was not: only the web flag existed, so the
 * interview routes were reachable in a deployment whose UI had never shown them.
 */
describe('guided chronic interview API gating', () => {
  const original = process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED;

  const request = {
    user: { user: { id: 'user-1' }, roles: [] },
    headers: {},
  } as never;
  const params = { clinicId: 'clinic-1', encounterId: 'encounter-1' } as never;

  afterEach(() => {
    if (original === undefined) delete process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED;
    else process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED = original;
  });

  describe('with the feature off', () => {
    beforeEach(() => {
      process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED = 'false';
    });

    it('refuses the hypertension writes, because the REST write surface is new', () => {
      const service = { list: jest.fn(), upsert: jest.fn(), upsertClinicianPlan: jest.fn() };
      const controller = new HypertensionAssessmentController(service as never);

      expect(() => controller.upsert(params, {} as never, request)).toThrow(NotFoundException);
      expect(() => controller.upsertClinicianPlan(params, {} as never, request)).toThrow(
        NotFoundException,
      );

      expect(service.upsert).not.toHaveBeenCalled();
      expect(service.upsertClinicianPlan).not.toHaveBeenCalled();
    });

    it('still serves hypertension history, which the patient chart shows either way', async () => {
      // The four-field form and the offline replay write this table with the flag off. Gating the
      // read hid those records: the chart had no Hypertension section to put them in.
      const service = { list: jest.fn() };
      const controller = new HypertensionAssessmentController(service as never);

      await controller.list(
        { clinicId: 'clinic-1', patientId: 'p1' } as never,
        {} as never,
        request,
      );

      expect(service.list).toHaveBeenCalled();
    });

    it('refuses the diabetes clinician plan, which the interview introduced', () => {
      const service = { upsertClinicianPlan: jest.fn() };
      const controller = new DiabetesScreeningController(service as never);

      expect(() => controller.upsertClinicianPlan(params, {} as never, request)).toThrow(
        NotFoundException,
      );
      expect(service.upsertClinicianPlan).not.toHaveBeenCalled();
    });

    it('leaves diabetes list and upsert working, because they predate the interview', async () => {
      // Gating the whole controller would withdraw behaviour that shipped with
      // 20260812000000_promote_diabetes_screening and is read and written outside the interview.
      const service = { list: jest.fn(), upsert: jest.fn() };
      const controller = new DiabetesScreeningController(service as never);

      await controller.list(
        { clinicId: 'clinic-1', patientId: 'p1' } as never,
        {} as never,
        request,
      );
      await controller.upsert(params, {} as never, request);

      expect(service.list).toHaveBeenCalled();
      expect(service.upsert).toHaveBeenCalled();
    });
  });

  it('lets the hypertension routes through once the feature is on', async () => {
    process.env.FEATURE_GUIDED_CHRONIC_TABS_ENABLED = 'true';
    const service = { list: jest.fn(), upsert: jest.fn(), upsertClinicianPlan: jest.fn() };
    const controller = new HypertensionAssessmentController(service as never);

    await controller.upsert(params, {} as never, request);
    await controller.upsertClinicianPlan(params, {} as never, request);

    expect(service.upsert).toHaveBeenCalled();
    expect(service.upsertClinicianPlan).toHaveBeenCalled();
  });
});
