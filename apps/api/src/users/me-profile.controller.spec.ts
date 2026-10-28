import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { ReqUser } from '../auth/auth.controller';
import { MeProfileController } from './me-profile.controller';

describe('MeProfileController', () => {
  const NAME = { firstName: 'Ama', middleInitial: 'K', lastName: 'Mensah' };

  function setup(roles: ReqUser['roles']) {
    const userProfileService = { updateName: jest.fn().mockResolvedValue({}) };
    const controller = new MeProfileController(userProfileService as never);
    const req = {
      user: {
        user: { id: 'user-1', keycloakSub: 'kc-1', displayName: 'x', email: null },
        roles,
      },
      headers: { 'x-request-id': 'req-1' },
    };
    return { controller, req, userProfileService };
  }

  it('writes the caller’s own name, audited at one of their staff clinics', async () => {
    const { controller, req, userProfileService } = setup([
      { clinicId: 'clinic-p', role: UserRole.PATIENT },
      { clinicId: 'clinic-1', role: UserRole.VOLUNTEER },
    ]);

    await controller.updateName(req, NAME);

    // AuditEvent RLS refuses a null clinic from anyone but a system admin.
    expect(userProfileService.updateName).toHaveBeenCalledWith('user-1', NAME, {
      actorUserId: 'user-1',
      source: 'SELF',
      clinicId: 'clinic-1',
      requestId: 'req-1',
    });
  });

  it('audits a global-only system admin without a clinic', async () => {
    const { controller, req, userProfileService } = setup([
      { clinicId: null, role: UserRole.SYSTEM_ADMIN },
    ]);

    await controller.updateName(req, NAME);

    expect(userProfileService.updateName).toHaveBeenCalledWith(
      'user-1',
      NAME,
      expect.objectContaining({ clinicId: null }),
    );
  });

  it('refuses a patient-only account', async () => {
    const { controller, req, userProfileService } = setup([
      { clinicId: 'clinic-p', role: UserRole.PATIENT },
    ]);

    await expect(controller.updateName(req, NAME)).rejects.toBeInstanceOf(ForbiddenException);
    expect(userProfileService.updateName).not.toHaveBeenCalled();
  });
});
