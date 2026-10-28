import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PatientDuplicateService } from '../patients/patient-duplicate.service';
import { PatientMergeService } from '../patients/patient-merge.service';
import {
  SYSTEM_ADMIN,
  buildRequest,
  createExecutionContext,
  inClinic,
} from '../testing/rbac-harness';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Who reaches `PATCH /admin/users/:userId/name`, decided by the real guard. Which staff a
 * manager may correct is the service's call (a 404 elsewhere), tested in admin.service.spec.
 */
describe('admin name correction access (#225)', () => {
  let controller: AdminController;
  let rbacGuard: RbacGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        Reflector,
        RbacGuard,
        { provide: AdminService, useValue: {} },
        { provide: PatientDuplicateService, useValue: {} },
        { provide: PatientMergeService, useValue: {} },
      ],
    }).compile();
    controller = module.get(AdminController);
    rbacGuard = module.get(RbacGuard);
  });

  const reaches = (actor: Parameters<typeof buildRequest>[0]) =>
    rbacGuard.canActivate(
      createExecutionContext(controller, 'updateUserName', buildRequest(actor, { params: {} })),
    );

  it.each([UserRole.DIRECTOR, UserRole.MANAGER])('lets a %s through', (role) => {
    expect(reaches(inClinic(role))).toBe(true);
  });

  it('lets a system admin through', () => {
    expect(reaches(SYSTEM_ADMIN)).toBe(true);
  });

  it.each([UserRole.VOLUNTEER, UserRole.DOCTOR, UserRole.PATIENT])('refuses a %s', (role) => {
    expect(() => reaches(inClinic(role))).toThrow(ForbiddenException);
  });
});
