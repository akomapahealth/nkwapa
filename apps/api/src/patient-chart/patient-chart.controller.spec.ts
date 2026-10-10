import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PatientChartController } from './patient-chart.controller';
import { PatientChartService } from './patient-chart.service';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';

type RequestShape = {
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  clinicId?: string;
  user: {
    user: { id: string };
    roles: Array<{ clinicId: string | null; role: UserRole }>;
  };
};

const CLINIC = 'clinic-1';
const PATIENT = 'patient-1';

function createExecutionContext(
  controller: PatientChartController,
  handlerName: keyof PatientChartController,
  request: RequestShape,
): ExecutionContext {
  return {
    getHandler: () => controller[handlerName] as unknown as (...args: unknown[]) => unknown,
    getClass: () => PatientChartController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const userWith = (id: string, roles: Array<{ clinicId: string | null; role: UserRole }>) => ({
  user: { id },
  roles,
});

const inClinic = (id: string, role: UserRole) => userWith(id, [{ clinicId: CLINIC, role }]);

const SYSTEM_ADMIN = userWith('sysadmin-1', [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }]);
const OUTSIDER = userWith('outsider-1', [{ clinicId: 'other-clinic', role: UserRole.DOCTOR }]);

const CLINICAL_ROLES: Array<[string, UserRole]> = [
  ['director', UserRole.DIRECTOR],
  ['manager', UserRole.MANAGER],
  ['doctor', UserRole.DOCTOR],
  ['volunteer', UserRole.VOLUNTEER],
];

const HANDLERS: Array<keyof PatientChartController> = ['summary', 'vitals', 'visits'];

describe('PatientChartController', () => {
  let controller: PatientChartController;
  let service: {
    getSummary: jest.Mock;
    listVitals: jest.Mock;
    listVisits: jest.Mock;
  };
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;

  beforeEach(async () => {
    service = {
      getSummary: jest.fn().mockResolvedValue({ patientId: PATIENT, sections: [] }),
      listVitals: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listVisits: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientChartController],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        { provide: PatientChartService, useValue: service },
      ],
    }).compile();

    controller = module.get(PatientChartController);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
  });

  const requestFor = (user: RequestShape['user']): RequestShape => ({
    params: { clinicId: CLINIC, patientId: PATIENT },
    query: {},
    headers: {},
    user,
  });

  describe('clinic scope', () => {
    it.each(HANDLERS)('denies a non-member of the clinic on %s', (handler) => {
      const context = createExecutionContext(controller, handler, requestFor(OUTSIDER));
      expect(() => clinicScopeGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it.each(HANDLERS)('lets a system admin bypass clinic membership on %s', (handler) => {
      const context = createExecutionContext(controller, handler, requestFor(SYSTEM_ADMIN));
      expect(clinicScopeGuard.canActivate(context)).toBe(true);
      expect(rbacGuard.canActivate(context)).toBe(true);
    });

    it('does not let a privileged role at another clinic authorize this clinic', () => {
      // Volunteer here, doctor elsewhere: the doctor role must not leak across clinics.
      const user = userWith('mixed-1', [
        { clinicId: CLINIC, role: UserRole.VOLUNTEER },
        { clinicId: 'other-clinic', role: UserRole.DIRECTOR },
      ]);
      const request = requestFor(user);
      const context = createExecutionContext(controller, 'summary', request);
      expect(clinicScopeGuard.canActivate(context)).toBe(true);
      expect(request.clinicId).toBe(CLINIC);
      expect(rbacGuard.canActivate(context)).toBe(true);
    });
  });

  describe('permissions per role', () => {
    it.each(CLINICAL_ROLES)('allows a %s through every chart route', (_name, role) => {
      for (const handler of HANDLERS) {
        const context = createExecutionContext(
          controller,
          handler,
          requestFor(inClinic(`${role}-1`, role)),
        );
        expect(clinicScopeGuard.canActivate(context)).toBe(true);
        expect(rbacGuard.canActivate(context)).toBe(true);
      }
    });

    it.each(HANDLERS)('denies a portal patient role on %s', (handler) => {
      const context = createExecutionContext(
        controller,
        handler,
        requestFor(inClinic('patient-user-1', UserRole.PATIENT)),
      );
      expect(() => rbacGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies a request carrying no roles at all', () => {
      const context = createExecutionContext(controller, 'summary', requestFor(userWith('x', [])));
      expect(() => rbacGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('delegation', () => {
    it('passes clinic, patient, and actor through to the summary service', async () => {
      const user = inClinic('doctor-1', UserRole.DOCTOR);
      await controller.summary({ clinicId: CLINIC, patientId: PATIENT }, { user } as never);
      expect(service.getSummary).toHaveBeenCalledWith(CLINIC, PATIENT, {
        userId: 'doctor-1',
        roles: user.roles,
      });
    });

    it('forwards cursor and limit to the vitals service', async () => {
      await controller.vitals({ clinicId: CLINIC, patientId: PATIENT }, { cursor: 'c', limit: 10 });
      expect(service.listVitals).toHaveBeenCalledWith(CLINIC, PATIENT, {
        cursor: 'c',
        limit: 10,
      });
    });

    it('forwards the actor to the visits service so note status can be gated', async () => {
      const user = inClinic('manager-1', UserRole.MANAGER);
      await controller.visits({ clinicId: CLINIC, patientId: PATIENT }, { limit: 5 }, {
        user,
      } as never);
      expect(service.listVisits).toHaveBeenCalledWith(
        CLINIC,
        PATIENT,
        { userId: 'manager-1', roles: user.roles },
        { limit: 5 },
      );
    });
  });
});
