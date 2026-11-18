import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import { ClinicUsersController } from './clinic-users.controller';

// A repeated query parameter (?role=A&role=B) arrives as an array; only one string names a role.
describe('role parameter on role removal', () => {
  const req = { user: { user: { id: 'admin-1' }, roles: [] }, headers: {} } as never;
  const service = { removeRole: jest.fn(), revokeClinicRole: jest.fn() };
  const admin = new AdminController(service as unknown as AdminService, {} as never, {} as never);
  const clinic = new ClinicUsersController(service as unknown as AdminService);

  beforeEach(() => jest.clearAllMocks());

  it.each([[[UserRole.VOLUNTEER, UserRole.DOCTOR]], [''], ['NOT_A_ROLE']])(
    'refuses %p before reaching the service',
    async (role) => {
      await expect(admin.removeRole('u-1', 'c-1', role as never, req)).rejects.toThrow(
        BadRequestException,
      );
      await expect(clinic.revokeClinicRole('c-1', 'u-1', role as never, req)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.removeRole).not.toHaveBeenCalled();
      expect(service.revokeClinicRole).not.toHaveBeenCalled();
    },
  );

  it('passes a single valid role through', async () => {
    await admin.removeRole('u-1', 'c-1', UserRole.VOLUNTEER, req);
    await clinic.revokeClinicRole('c-1', 'u-1', UserRole.VOLUNTEER, req);
    expect(service.removeRole).toHaveBeenCalledWith(
      expect.anything(),
      'u-1',
      'c-1',
      UserRole.VOLUNTEER,
      expect.any(String),
    );
    expect(service.revokeClinicRole).toHaveBeenCalledWith(
      expect.anything(),
      'c-1',
      'u-1',
      UserRole.VOLUNTEER,
      expect.any(String),
    );
  });
});
