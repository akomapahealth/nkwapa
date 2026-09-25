import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PERMISSIONS, rolesWithPermission } from '../auth/constants/permissions';
import {
  CLINIC_A1,
  CLINIC_B1,
  SYSTEM_ADMIN,
  buildRequest,
  createExecutionContext,
  inClinic,
} from '../testing/rbac-harness';
import { ClinicStaffInvitesController } from './clinic-staff-invites.controller';
import { StaffInviteAcceptanceController } from './staff-invite-acceptance.controller';
import { StaffInviteService } from './staff-invite.service';
import { STAFF_INVITE_SCOPE_KEY } from './staff-invite-scope.decorator';

const ISSUING_HANDLERS: Array<keyof ClinicStaffInvitesController> = [
  'list',
  'create',
  'resend',
  'cancel',
];

/**
 * Who reaches the staff invitation routes, decided by the real guard chain.
 *
 * The service applies the role ceiling again, and has its own tests. These prove the outer
 * layer: a caller the guards let through here is a caller a real request would let through.
 */
describe('staff invitation access', () => {
  let controller: ClinicStaffInvitesController;
  let clinicScopeGuard: ClinicScopeGuard;
  let rbacGuard: RbacGuard;
  const reflector = new Reflector();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicStaffInvitesController],
      providers: [
        Reflector,
        ClinicScopeGuard,
        RbacGuard,
        { provide: StaffInviteService, useValue: {} },
      ],
    }).compile();

    controller = module.get(ClinicStaffInvitesController);
    clinicScopeGuard = module.get(ClinicScopeGuard);
    rbacGuard = module.get(RbacGuard);
  });

  const reaches = (
    handler: keyof ClinicStaffInvitesController,
    actor = SYSTEM_ADMIN,
    clinicId: string = CLINIC_A1,
  ) => {
    const context = createExecutionContext(
      controller,
      handler,
      buildRequest(actor, {
        params: { clinicId, inviteId: '00000000-0000-4000-8000-000000000001' },
      }),
    );
    return clinicScopeGuard.canActivate(context) && rbacGuard.canActivate(context);
  };

  it('grants the permission to DIRECTOR and, through its wildcard, SYSTEM_ADMIN only', () => {
    expect(rolesWithPermission(PERMISSIONS.CLINIC_STAFF_INVITE).sort()).toEqual(
      [UserRole.DIRECTOR, UserRole.SYSTEM_ADMIN].sort(),
    );
  });

  it.each(ISSUING_HANDLERS)('lets a director of the clinic reach %s', (handler) => {
    expect(reaches(handler, inClinic(UserRole.DIRECTOR, CLINIC_A1))).toBe(true);
  });

  it.each(ISSUING_HANDLERS)('lets a system admin reach %s in any clinic', (handler) => {
    expect(reaches(handler, SYSTEM_ADMIN, CLINIC_B1)).toBe(true);
  });

  // The route parameter is chosen by the caller. Editing it must not move a director's authority.
  it.each(ISSUING_HANDLERS)('refuses a director of another clinic on %s', (handler) => {
    expect(() => reaches(handler, inClinic(UserRole.DIRECTOR, CLINIC_A1), CLINIC_B1)).toThrow(
      ForbiddenException,
    );
  });

  it.each([UserRole.MANAGER, UserRole.DOCTOR, UserRole.VOLUNTEER, UserRole.PATIENT])(
    'refuses a %s in their own clinic',
    (role) => {
      for (const handler of ISSUING_HANDLERS) {
        expect(() => reaches(handler, inClinic(role, CLINIC_A1))).toThrow(ForbiddenException);
      }
    },
  );

  /*
    The scope widening is opt-in per handler. These are the only routes that may carry it, and the
    issuing routes must not: a director listing invitations has no business seeing other clinics.
  */
  it('widens tenant scope only on the invitee routes', () => {
    for (const handler of ISSUING_HANDLERS) {
      expect(
        reflector.getAllAndOverride(STAFF_INVITE_SCOPE_KEY, [
          ClinicStaffInvitesController.prototype[handler],
          ClinicStaffInvitesController,
        ]),
      ).toBeUndefined();
    }
    for (const handler of ['mine', 'accept'] as const) {
      expect(
        reflector.getAllAndOverride(STAFF_INVITE_SCOPE_KEY, [
          StaffInviteAcceptanceController.prototype[handler],
          StaffInviteAcceptanceController,
        ]),
      ).toBe(true);
    }
  });
});
