import { Reflector } from '@nestjs/core';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CLINIC_ID_SOURCE_KEY,
  CLINIC_SCOPED_KEY,
} from '../auth/decorators/clinic-scoped.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { PatientService } from './patient.service';
import { PatientsController } from './patients.controller';
import {
  FIXTURE_CLINIC_ID,
  FIXTURE_OTHER_CLINIC_ID,
  FIXTURE_PATIENT_ID,
  FIXTURE_SOURCE_PATIENT_ID,
  identityChartFixture,
} from '../testing/patient-identity-fixtures';

/*
  The route that resolves a chart, including one a merge retired.

  This controller had no spec at all, and it is where the canonical redirect becomes visible to a
  user: the clinic check runs against the chart that *survived*, not the one the URL named. That
  is the correct behaviour and also the subtle one -- read quickly, the code looks like it is
  authorising the requested id.
*/
describe('PatientsController', () => {
  const reflector = new Reflector();

  function createController(result: unknown) {
    const findByIdWithRecentEncounters = jest.fn().mockResolvedValue(result);
    const controller = new PatientsController({
      findByIdWithRecentEncounters,
    } as unknown as PatientService);
    return { controller, findByIdWithRecentEncounters };
  }

  const found = (overrides: Record<string, unknown> = {}) => ({
    patient: identityChartFixture(),
    recentEncounters: [],
    portalAccess: {},
    resolvedFromPatientId: null,
    ...overrides,
  });

  it('reads a chart under the patient read permission, scoped by the clinic query', () => {
    expect(reflector.get('requirePermission', PatientsController.prototype.findOne)).toBe(
      PERMISSIONS.PATIENT_READ,
    );
    expect(reflector.get(CLINIC_SCOPED_KEY, PatientsController.prototype.findOne)).toBe(true);
    expect(reflector.get(CLINIC_ID_SOURCE_KEY, PatientsController.prototype.findOne)).toEqual({
      type: 'query',
      queryKey: 'clinicId',
    });
  });

  /*
    Without a clinic the route cannot be scoped at all, and `ClinicScopeGuard` reads the same
    query parameter. Refusing here rather than defaulting is what keeps a missing clinic from
    silently widening the read.
  */
  it('refuses a request that names no clinic', async () => {
    const { controller, findByIdWithRecentEncounters } = createController(found());

    await expect(controller.findOne(FIXTURE_PATIENT_ID, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByIdWithRecentEncounters).not.toHaveBeenCalled();
  });

  it('reports an unknown chart as not found', async () => {
    const { controller } = createController(null);

    await expect(controller.findOne('patient-missing', FIXTURE_CLINIC_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a chart belonging to another clinic', async () => {
    const { controller } = createController(
      found({ patient: identityChartFixture({ primaryClinicId: FIXTURE_OTHER_CLINIC_ID }) }),
    );

    await expect(controller.findOne(FIXTURE_PATIENT_ID, FIXTURE_CLINIC_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns a live chart in its own clinic', async () => {
    const { controller } = createController(found());

    await expect(controller.findOne(FIXTURE_PATIENT_ID, FIXTURE_CLINIC_ID)).resolves.toMatchObject({
      resolvedFromPatientId: null,
    });
  });

  /*
    Opening a retired chart's id lands on the survivor, and says which id the reader came from.
    Without `resolvedFromPatientId` the redirect is silent: staff who followed a link from an old
    appointment card would see a different patient code than the one they clicked and have no way
    to tell a merge from a mistake.
  */
  it('resolves a retired chart to the survivor and says where the reader came from', async () => {
    const { controller } = createController(
      found({ resolvedFromPatientId: FIXTURE_SOURCE_PATIENT_ID }),
    );

    const result = await controller.findOne(FIXTURE_SOURCE_PATIENT_ID, FIXTURE_CLINIC_ID);

    expect(result.patient.id).toBe(FIXTURE_PATIENT_ID);
    expect(result.resolvedFromPatientId).toBe(FIXTURE_SOURCE_PATIENT_ID);
  });

  /*
    The clinic check runs against the surviving chart, not the requested one. That is deliberate:
    a chart merged into another clinic's record is no longer this clinic's to read, and checking
    the retired chart's stale `primaryClinicId` would keep serving it after the record moved.
  */
  it('authorises the surviving chart, not the id that was asked for', async () => {
    const { controller } = createController(
      found({
        patient: identityChartFixture({ primaryClinicId: FIXTURE_OTHER_CLINIC_ID }),
        resolvedFromPatientId: FIXTURE_SOURCE_PATIENT_ID,
      }),
    );

    await expect(
      controller.findOne(FIXTURE_SOURCE_PATIENT_ID, FIXTURE_CLINIC_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
