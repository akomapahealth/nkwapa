import { UserRole } from '@prisma/client';
import { DisabledUserException } from './disabled-user.exception';
import { AuthController, type ReqUser } from './auth.controller';

describe('AuthController', () => {
  const clinicService = {
    findByIds: jest.fn().mockResolvedValue([
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra' },
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti' },
    ]),
  };

  const controller = new AuthController(clinicService as never);

  const reqUser: ReqUser = {
    user: {
      id: 'user-1',
      keycloakSub: 'test-sub',
      displayName: 'Test User',
      email: 'test@example.com',
    },
    roles: [
      { clinicId: 'clinic-2', role: UserRole.VOLUNTEER },
      { clinicId: 'clinic-1', role: UserRole.MANAGER },
      { clinicId: null, role: UserRole.SYSTEM_ADMIN },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the raw profile for /auth/me', () => {
    expect(controller.getProfile({ user: reqUser })).toEqual(reqUser);
  });

  it('builds bootstrap details for whoami and honors X-Clinic-Id', async () => {
    const response = await controller.whoami({
      user: reqUser,
      headers: { 'x-clinic-id': 'clinic-1' },
    });

    expect(clinicService.findByIds).toHaveBeenCalledWith(['clinic-1', 'clinic-2']);
    expect(response).toMatchObject({
      userId: 'user-1',
      keycloakSub: 'test-sub',
      displayName: 'Test User',
      activeClinicId: 'clinic-1',
      globalRoles: ['SYSTEM_ADMIN'],
    });
    expect(response.memberships).toEqual([
      {
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        roles: ['MANAGER'],
      },
      {
        clinicId: 'clinic-2',
        clinicName: 'Second Clinic',
        roles: ['VOLUNTEER'],
      },
    ]);
    expect(response.effectiveRolesForActiveClinic).toEqual([
      UserRole.MANAGER,
      UserRole.SYSTEM_ADMIN,
    ]);
    expect(response.effectivePermissionsForActiveClinic).toContain('*');
  });

  it('uses a stable disabled-user payload', () => {
    const error = new DisabledUserException();

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: 'USER_DISABLED',
      message: 'User account is deactivated',
    });
  });
});
