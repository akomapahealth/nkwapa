import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PatientApiController } from './patient-api.controller';
import { PatientPortalService } from './patient-portal.service';

type RequestShape = {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  clinicId?: string;
  user: {
    user: { id: string };
    roles: Array<{ clinicId: string | null; role: UserRole }>;
  };
};

function createExecutionContext(
  controller: PatientApiController,
  handlerName: keyof PatientApiController,
  request: RequestShape,
): ExecutionContext {
  return {
    getHandler: () => controller[handlerName] as unknown as (...args: unknown[]) => unknown,
    getClass: () => PatientApiController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const patientUser = {
  user: { id: 'patient-user-1' },
  roles: [{ clinicId: 'clinic-1', role: UserRole.PATIENT }],
};

const outsiderUser = {
  user: { id: 'patient-user-2' },
  roles: [{ clinicId: 'other-clinic', role: UserRole.PATIENT }],
};

const doctorUser = {
  user: { id: 'doctor-user-1' },
  roles: [{ clinicId: 'clinic-1', role: UserRole.DOCTOR }],
};

describe('PatientApiController', () => {
  let controller: PatientApiController;
  let patientPortalService: {
    listMeasurementsForAuthenticatedPatient: jest.Mock;
    listAppointmentsForAuthenticatedPatient: jest.Mock;
    createCancelAppointmentRequestForAuthenticatedPatient: jest.Mock;
    createRescheduleAppointmentRequestForAuthenticatedPatient: jest.Mock;
    listTrendsForAuthenticatedPatient: jest.Mock;
    listTrendsForStaff: jest.Mock;
  };
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;

  beforeEach(async () => {
    patientPortalService = {
      listMeasurementsForAuthenticatedPatient: jest.fn().mockResolvedValue([]),
      listAppointmentsForAuthenticatedPatient: jest.fn().mockResolvedValue({
        range: { from: '2026-03-01', to: '2026-03-31' },
        timezone: 'Africa/Accra',
        summary: { total: 0, confirmed: 0, cancelled: 0, completed: 0, noShow: 0 },
        items: [],
      }),
      createCancelAppointmentRequestForAuthenticatedPatient: jest.fn().mockResolvedValue({
        id: 'cancel-request-1',
      }),
      createRescheduleAppointmentRequestForAuthenticatedPatient: jest.fn().mockResolvedValue({
        id: 'reschedule-request-1',
      }),
      listTrendsForAuthenticatedPatient: jest.fn().mockResolvedValue({
        bp: [],
        glucose: [],
        followUp: { requested: 0, confirmed: 0, completed: 0, noShow: 0, closed: 0 },
      }),
      listTrendsForStaff: jest.fn().mockResolvedValue({
        bp: [],
        glucose: [],
        followUp: { requested: 0, confirmed: 0, completed: 0, noShow: 0, closed: 0 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientApiController],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        { provide: PatientPortalService, useValue: patientPortalService },
      ],
    }).compile();

    controller = module.get(PatientApiController);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
  });

  it('allows patient me routes to use X-Clinic-Id for clinic scoping', async () => {
    const request: RequestShape = {
      headers: { 'x-clinic-id': 'clinic-1' },
      query: {},
      user: patientUser,
    };
    const context = createExecutionContext(controller, 'listMeasurements', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(request.clinicId).toBe('clinic-1');
    expect(rbacGuard.canActivate(context)).toBe(true);

    await controller.listMeasurements(
      {},
      {
        clinicId: request.clinicId,
        headers: {},
        user: request.user,
      },
    );

    expect(patientPortalService.listMeasurementsForAuthenticatedPatient).toHaveBeenCalledWith(
      'clinic-1',
      'patient-user-1',
      {},
    );
  });

  it('lists patient appointments through the authenticated patient route', async () => {
    const request: RequestShape = {
      headers: { 'x-clinic-id': 'clinic-1' },
      query: { from: '2026-03-01', to: '2026-03-31' },
      user: patientUser,
    };
    const context = createExecutionContext(controller, 'listAppointments', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(request.clinicId).toBe('clinic-1');
    expect(rbacGuard.canActivate(context)).toBe(true);

    await controller.listAppointments(
      { from: '2026-03-01', to: '2026-03-31' },
      {
        clinicId: request.clinicId,
        headers: {},
        user: request.user,
      },
    );

    expect(patientPortalService.listAppointmentsForAuthenticatedPatient).toHaveBeenCalledWith(
      'clinic-1',
      'patient-user-1',
      { from: '2026-03-01', to: '2026-03-31' },
    );
  });

  it('creates patient appointment change requests with authenticated user ownership', async () => {
    const request: RequestShape = {
      headers: { 'x-clinic-id': 'clinic-1', 'x-request-id': 'req-1' },
      params: { appointmentId: 'appointment-1' },
      user: patientUser,
    };
    const cancelContext = createExecutionContext(
      controller,
      'createCancelAppointmentRequest',
      request,
    );
    const rescheduleContext = createExecutionContext(
      controller,
      'createRescheduleAppointmentRequest',
      request,
    );

    expect(clinicScopeGuard.canActivate(cancelContext)).toBe(true);
    expect(rbacGuard.canActivate(cancelContext)).toBe(true);
    expect(clinicScopeGuard.canActivate(rescheduleContext)).toBe(true);
    expect(rbacGuard.canActivate(rescheduleContext)).toBe(true);

    await controller.createCancelAppointmentRequest(
      'appointment-1',
      { reason: 'Cannot make it' },
      {
        clinicId: request.clinicId,
        headers: { 'x-request-id': 'req-1' },
        user: request.user,
      },
    );
    await controller.createRescheduleAppointmentRequest(
      'appointment-1',
      { preferredStartDate: '2026-04-01', preferredEndDate: '2026-04-03' },
      {
        clinicId: request.clinicId,
        headers: { 'x-request-id': 'req-1' },
        user: request.user,
      },
    );

    expect(
      patientPortalService.createCancelAppointmentRequestForAuthenticatedPatient,
    ).toHaveBeenCalledWith(
      'clinic-1',
      'patient-user-1',
      'appointment-1',
      { reason: 'Cannot make it' },
      'req-1',
    );
    expect(
      patientPortalService.createRescheduleAppointmentRequestForAuthenticatedPatient,
    ).toHaveBeenCalledWith(
      'clinic-1',
      'patient-user-1',
      'appointment-1',
      { preferredStartDate: '2026-04-01', preferredEndDate: '2026-04-03' },
      'req-1',
    );
  });

  it('denies patient me routes when the user lacks clinic membership for the header clinic', () => {
    const request: RequestShape = {
      headers: { 'x-clinic-id': 'clinic-1' },
      query: {},
      user: outsiderUser,
    };
    const context = createExecutionContext(controller, 'listMeasurements', request);

    expect(() => clinicScopeGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows patient me trend routes to use X-Clinic-Id for clinic scoping', async () => {
    const request: RequestShape = {
      headers: { 'x-clinic-id': 'clinic-1' },
      query: { from: '2026-03-01', to: '2026-03-31' },
      user: patientUser,
    };
    const context = createExecutionContext(controller, 'listTrends', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(request.clinicId).toBe('clinic-1');
    expect(rbacGuard.canActivate(context)).toBe(true);

    await controller.listTrends(
      { from: '2026-03-01', to: '2026-03-31' },
      {
        clinicId: request.clinicId,
        headers: {},
        user: request.user,
      },
    );

    expect(patientPortalService.listTrendsForAuthenticatedPatient).toHaveBeenCalledWith(
      'clinic-1',
      'patient-user-1',
      { from: '2026-03-01', to: '2026-03-31' },
    );
  });

  it('allows staff trend routes when the user has PATIENT.READ for the clinic', async () => {
    const request: RequestShape = {
      params: { patientId: 'patient-1' },
      query: { clinicId: 'clinic-1', from: '2026-03-01' },
      user: doctorUser,
    };
    const context = createExecutionContext(controller, 'listTrendsForStaff', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(request.clinicId).toBe('clinic-1');
    expect(rbacGuard.canActivate(context)).toBe(true);

    await controller.listTrendsForStaff(
      { patientId: 'patient-1' },
      { clinicId: 'clinic-1', from: '2026-03-01' },
    );

    expect(patientPortalService.listTrendsForStaff).toHaveBeenCalledWith('patient-1', 'clinic-1', {
      clinicId: 'clinic-1',
      from: '2026-03-01',
    });
  });
});
