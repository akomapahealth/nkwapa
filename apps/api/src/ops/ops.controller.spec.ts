import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';

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
  controller: OpsController,
  handlerName: keyof OpsController,
  request: RequestShape,
): ExecutionContext {
  return {
    getHandler: () => controller[handlerName] as unknown as (...args: unknown[]) => unknown,
    getClass: () => OpsController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const managerUser = {
  user: { id: 'manager-1' },
  roles: [{ clinicId: 'clinic-1', role: UserRole.MANAGER }],
};

const directorUser = {
  user: { id: 'director-1' },
  roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }],
};

const systemAdminUser = {
  user: { id: 'sysadmin-1' },
  roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
};

const volunteerUser = {
  user: { id: 'volunteer-1' },
  roles: [{ clinicId: 'clinic-1', role: UserRole.VOLUNTEER }],
};

const doctorUser = {
  user: { id: 'doctor-1' },
  roles: [{ clinicId: 'clinic-1', role: UserRole.DOCTOR }],
};

const outsiderUser = {
  user: { id: 'outsider-1' },
  roles: [{ clinicId: 'other-clinic', role: UserRole.VOLUNTEER }],
};

describe('OpsController', () => {
  let controller: OpsController;
  let opsService: {
    createAssignment: jest.Mock;
    listMyAssignments: jest.Mock;
    checkOut: jest.Mock;
  };
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;

  beforeEach(async () => {
    opsService = {
      createAssignment: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
      listMyAssignments: jest.fn().mockResolvedValue({ items: [] }),
      checkOut: jest.fn().mockResolvedValue({ id: 'shift-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpsController],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        { provide: OpsService, useValue: opsService },
      ],
    }).compile();

    controller = module.get(OpsController);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
  });

  it('denies non-members from clinic-scoped endpoints', () => {
    const request: RequestShape = {
      params: { clinicId: 'clinic-1' },
      query: {},
      user: outsiderUser,
    };
    const context = createExecutionContext(controller, 'listCheckIns', request);

    expect(() => clinicScopeGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a manager to pass guards and create assignments', async () => {
    const request: RequestShape = {
      params: { clinicId: 'clinic-1' },
      body: {
        patientCheckInId: 'checkin-1',
        assignedVolunteerId: 'volunteer-1',
        assignedDoctorId: 'doctor-1',
      },
      headers: {},
      user: managerUser,
    };
    const context = createExecutionContext(controller, 'createAssignment', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);

    await controller.createAssignment('clinic-1', request.body as never, {
      user: request.user,
      headers: request.headers,
    });

    expect(opsService.createAssignment).toHaveBeenCalled();
  });

  it('allows a director to pass guards and create assignments', () => {
    const request: RequestShape = {
      params: { clinicId: 'clinic-1' },
      body: {},
      user: directorUser,
    };
    const context = createExecutionContext(controller, 'createAssignment', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);
  });

  it('allows a system admin to pass guards and create assignments', () => {
    const request: RequestShape = {
      params: { clinicId: 'clinic-1' },
      body: {},
      user: systemAdminUser,
    };
    const context = createExecutionContext(controller, 'createAssignment', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);
  });

  it('allows a volunteer to read my assignments', async () => {
    const request: RequestShape = {
      params: { clinicId: 'clinic-1' },
      query: { date: '2026-03-21' },
      user: volunteerUser,
    };
    const context = createExecutionContext(controller, 'listMyAssignments', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);

    await controller.listMyAssignments(
      'clinic-1',
      { date: '2026-03-21' },
      {
        user: volunteerUser,
      },
    );

    expect(opsService.listMyAssignments).toHaveBeenCalledWith(
      'clinic-1',
      'volunteer-1',
      '2026-03-21',
    );
  });

  it('allows a doctor to read my assignments', () => {
    const request: RequestShape = {
      params: { clinicId: 'clinic-1' },
      query: {},
      user: doctorUser,
    };
    const context = createExecutionContext(controller, 'listMyAssignments', request);

    expect(clinicScopeGuard.canActivate(context)).toBe(true);
    expect(rbacGuard.canActivate(context)).toBe(true);
  });

  it('propagates 409 conflicts from assignment creation', async () => {
    opsService.createAssignment.mockRejectedValueOnce(new ConflictException('Already assigned'));

    await expect(
      controller.createAssignment(
        'clinic-1',
        {
          patientCheckInId: 'checkin-1',
          assignedVolunteerId: 'volunteer-1',
          assignedDoctorId: 'doctor-1',
        },
        {
          user: managerUser,
          headers: {},
        },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('propagates 404 errors from shift checkout', async () => {
    opsService.checkOut.mockRejectedValueOnce(new NotFoundException('Shift not found'));

    await expect(
      controller.checkOut('clinic-1', 'shift-missing', {
        user: managerUser,
        headers: {},
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
