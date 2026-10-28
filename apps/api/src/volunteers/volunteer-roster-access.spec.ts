import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS, rolesWithPermission } from '../auth/constants/permissions';
import {
  CLINIC_A1,
  CLINIC_B1,
  PORTAL_PATIENT,
  SYSTEM_ADMIN,
  buildRequest,
  createExecutionContext,
  inClinic,
  type TestActor,
} from '../testing/rbac-harness';
import { VolunteerController } from './volunteer.controller';
import { ScreeningEventController } from './screening-event.controller';
import { VolunteerService } from './volunteer.service';
import { ScreeningEventService } from './screening-event.service';

const ID = '00000000-0000-4000-8000-000000000001';
const VOLUNTEER_HANDLERS = [
  'list',
  'create',
  'update',
  'deactivate',
  'reactivate',
  'link',
  'unlink',
] as const;
const EVENT_HANDLERS = [
  'list',
  'create',
  'get',
  'update',
  'cancel',
  'addToRoster',
  'removeFromRoster',
  'notify',
  'resend',
] as const;

/** Who reaches the directory and roster routes (#226), decided by the real guard chain. */
describe('volunteer roster access', () => {
  let volunteers: VolunteerController;
  let events: ScreeningEventController;
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [VolunteerController, ScreeningEventController],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        { provide: VolunteerService, useValue: {} },
        { provide: ScreeningEventService, useValue: {} },
      ],
    }).compile();
    volunteers = module.get(VolunteerController);
    events = module.get(ScreeningEventController);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
  });

  const routes = () => [
    ...VOLUNTEER_HANDLERS.map((handler) => [volunteers, handler] as const),
    ...EVENT_HANDLERS.map((handler) => [events, handler] as const),
  ];

  const reaches = (
    controller: object,
    handler: string,
    who: TestActor,
    clinicId: string = CLINIC_A1,
  ) => {
    const context = createExecutionContext(
      controller as never,
      handler as never,
      buildRequest(who, {
        params: { clinicId, id: ID, eventId: ID, assignmentId: ID },
      }),
    );
    return clinicScopeGuard.canActivate(context) && rbacGuard.canActivate(context);
  };

  it('grants the permission to DIRECTOR, MANAGER and, through its wildcard, SYSTEM_ADMIN', () => {
    expect(rolesWithPermission(PERMISSIONS.VOLUNTEER_ROSTER_MANAGE).sort()).toEqual(
      [UserRole.DIRECTOR, UserRole.MANAGER, UserRole.SYSTEM_ADMIN].sort(),
    );
  });

  it.each([UserRole.DIRECTOR, UserRole.MANAGER])(
    'lets a %s of the clinic reach every route',
    (role) => {
      for (const [controller, handler] of routes()) {
        expect(reaches(controller, handler, inClinic(role, CLINIC_A1))).toBe(true);
      }
    },
  );

  it('lets a system admin reach every route at any clinic', () => {
    for (const [controller, handler] of routes()) {
      expect(reaches(controller, handler, SYSTEM_ADMIN, CLINIC_B1)).toBe(true);
    }
  });

  it.each([UserRole.DOCTOR, UserRole.VOLUNTEER])('refuses a %s on every route', (role) => {
    for (const [controller, handler] of routes()) {
      expect(() => reaches(controller, handler, inClinic(role, CLINIC_A1))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('refuses a patient on every route', () => {
    for (const [controller, handler] of routes()) {
      expect(() => reaches(controller, handler, PORTAL_PATIENT)).toThrow(ForbiddenException);
    }
  });

  // The path clinic is the caller's choice; changing it must not carry a manager's authority.
  it("refuses a manager of A on every route under clinic B's path", () => {
    for (const [controller, handler] of routes()) {
      expect(() =>
        reaches(controller, handler, inClinic(UserRole.MANAGER, CLINIC_A1), CLINIC_B1),
      ).toThrow(ForbiddenException);
    }
  });
});
