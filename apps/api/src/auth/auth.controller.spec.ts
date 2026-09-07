import { UserRole } from '@prisma/client';
import { DisabledUserException } from './disabled-user.exception';
import { AuthController, type ReqUser } from './auth.controller';

describe('AuthController', () => {
  const clinicService = {
    findByIds: jest.fn().mockResolvedValue([
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra' },
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti' },
    ]),
    listActiveSwitchableClinics: jest.fn().mockResolvedValue([
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti' },
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra' },
    ]),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    patientPortalInvite: {
      findMany: jest.fn(),
    },
  };

  const controller = new AuthController(clinicService as never, prisma as never);

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
    // One clinic zoned and one not, so the contract is exercised on both branches rather than
    // on a value that happens to be present everywhere.
    clinicService.findByIds.mockResolvedValue([
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra', zoneCode: 'coastal' },
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti', zoneCode: null },
    ]);
    clinicService.listActiveSwitchableClinics.mockResolvedValue([
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti', zoneCode: null },
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra', zoneCode: 'coastal' },
    ]);
    prisma.user.findUnique.mockResolvedValue({
      email: 'test@example.com',
      phoneE164: null,
      isActive: true,
    });
    prisma.patientPortalInvite.findMany.mockResolvedValue([]);
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
    expect(clinicService.listActiveSwitchableClinics).toHaveBeenCalledWith(undefined);
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
        zoneCode: 'coastal',
        roles: ['MANAGER'],
      },
      {
        clinicId: 'clinic-2',
        clinicName: 'Second Clinic',
        zoneCode: null,
        roles: ['VOLUNTEER'],
      },
    ]);
    expect(response.availableClinics).toEqual([
      {
        clinicId: 'clinic-2',
        clinicName: 'Second Clinic',
        zoneCode: null,
      },
      {
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        zoneCode: 'coastal',
      },
    ]);
    expect(response.effectiveRolesForActiveClinic).toEqual([
      UserRole.MANAGER,
      UserRole.SYSTEM_ADMIN,
    ]);
    expect(response.effectivePermissionsForActiveClinic).toContain('*');
  });

  it('lets global system admins with no clinic roles switch to any active clinic', async () => {
    clinicService.listActiveSwitchableClinics.mockResolvedValue([
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti', zoneCode: null },
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra', zoneCode: 'coastal' },
    ]);

    const response = await controller.whoami({
      user: {
        user: {
          id: 'admin-user-1',
          keycloakSub: 'admin-sub',
          displayName: 'System Admin',
          email: 'admin@example.com',
        },
        roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
      },
      headers: { 'x-clinic-id': 'clinic-1' },
    });

    expect(clinicService.findByIds).not.toHaveBeenCalled();
    expect(clinicService.listActiveSwitchableClinics).toHaveBeenCalledWith(undefined);
    expect(response.memberships).toEqual([]);
    expect(response.availableClinics).toEqual([
      {
        clinicId: 'clinic-2',
        clinicName: 'Second Clinic',
        zoneCode: null,
      },
      {
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        zoneCode: 'coastal',
      },
    ]);
    expect(response.activeClinicId).toBe('clinic-1');
    expect(response.effectiveRolesForActiveClinic).toEqual([UserRole.SYSTEM_ADMIN]);
    expect(response.effectivePermissionsForActiveClinic).toEqual(['*']);
  });

  it('falls back when a system admin requests a clinic that is not active', async () => {
    clinicService.listActiveSwitchableClinics.mockResolvedValue([
      { id: 'clinic-2', name: 'Second Clinic', region: 'Ashanti', zoneCode: null },
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra', zoneCode: 'coastal' },
    ]);

    const response = await controller.whoami({
      user: {
        user: {
          id: 'admin-user-1',
          keycloakSub: 'admin-sub',
          displayName: 'System Admin',
          email: 'admin@example.com',
        },
        roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
      },
      headers: { 'x-clinic-id': 'inactive-clinic' },
    });

    expect(response.activeClinicId).toBe('clinic-2');
  });

  it('only exposes active assigned clinics for non-system-admin users', async () => {
    clinicService.findByIds.mockResolvedValue([
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra', zoneCode: 'coastal' },
    ]);
    clinicService.listActiveSwitchableClinics.mockResolvedValue([
      { id: 'clinic-1', name: 'Test Clinic', region: 'Greater Accra', zoneCode: 'coastal' },
    ]);

    const response = await controller.whoami({
      user: {
        user: {
          id: 'manager-user-1',
          keycloakSub: 'manager-sub',
          displayName: 'Clinic Manager',
          email: 'manager@example.com',
        },
        roles: [
          { clinicId: 'clinic-1', role: UserRole.MANAGER },
          { clinicId: 'inactive-clinic', role: UserRole.DIRECTOR },
        ],
      },
      headers: { 'x-clinic-id': 'inactive-clinic' },
    });

    expect(clinicService.findByIds).toHaveBeenCalledWith(['clinic-1', 'inactive-clinic']);
    expect(clinicService.listActiveSwitchableClinics).toHaveBeenCalledWith([
      'clinic-1',
      'inactive-clinic',
    ]);
    expect(response.memberships).toEqual([
      {
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        zoneCode: 'coastal',
        roles: ['MANAGER'],
      },
    ]);
    expect(response.availableClinics).toEqual([
      {
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        zoneCode: 'coastal',
      },
    ]);
    expect(response.activeClinicId).toBe('clinic-1');
    expect(response.effectiveRolesForActiveClinic).toEqual([UserRole.MANAGER]);
  });

  it('uses a stable disabled-user payload', () => {
    const error = new DisabledUserException();

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: 'USER_DISABLED',
      message: 'User account is deactivated',
    });
  });

  it('returns patient-claim onboarding details for role-less users with a pending invite', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'patient@example.com',
      phoneE164: null,
      isActive: true,
    });
    prisma.patientPortalInvite.findMany.mockResolvedValue([
      {
        id: 'invite-1',
        clinicId: 'clinic-3',
        patientId: 'patient-7',
        email: 'patient@example.com',
        phoneE164: null,
        createdAt: new Date('2026-04-04T12:00:00.000Z'),
        expiresAt: null,
        clinic: {
          id: 'clinic-3',
          name: 'Patient Clinic',
        },
        patient: {
          id: 'patient-7',
          patientCode: 'NKP-2026-000007',
          firstName: 'Prince',
          lastName: 'Tuffour',
        },
      },
    ]);

    const response = await controller.whoami({
      user: {
        user: {
          id: 'patient-user-1',
          keycloakSub: 'patient-sub',
          displayName: 'Prince Tuffour',
          email: 'patient@example.com',
        },
        roles: [],
      },
      headers: {},
    });

    expect(response.onboarding).toEqual({
      state: 'PATIENT_CLAIM_REQUIRED',
      pendingInvites: [
        {
          id: 'invite-1',
          clinicId: 'clinic-3',
          clinicName: 'Patient Clinic',
          patientId: 'patient-7',
          patientName: 'Prince Tuffour',
          patientCode: 'NKP-2026-000007',
          email: 'patient@example.com',
          phoneE164: null,
          createdAt: '2026-04-04T12:00:00.000Z',
          expiresAt: null,
        },
      ],
    });
  });

  // Routing someone into /claim-record on the strength of a lapsed invite hands them a
  // form they cannot complete: they fill in a patient code and date of birth and the
  // claim endpoint refuses them, with nothing on screen explaining why. The query has to
  // carry the same expiry clause the claim endpoint uses.
  it('does not offer claim onboarding on the strength of an expired invite', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'patient@example.com',
      phoneE164: null,
      isActive: true,
    });

    await controller.whoami({
      user: {
        user: {
          id: 'patient-user-1',
          keycloakSub: 'patient-sub',
          displayName: 'Prince Tuffour',
          email: 'patient@example.com',
        },
        roles: [],
      },
      headers: {},
    });

    expect(prisma.patientPortalInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
            { OR: [{ email: { equals: 'patient@example.com', mode: 'insensitive' } }] },
          ],
        }),
      }),
    );
  });

  /*
    Claim onboarding is what routes a brand-new patient to /claim-record instead of a dashboard
    they have no roles for. Getting it wrong in either direction is bad: withhold it and a
    patient holding a real invitation is stranded on an empty screen, offer it wrongly and
    someone is sent to a form that can only refuse them.
  */
  describe('claim onboarding', () => {
    const rolelessUser: ReqUser = {
      user: {
        id: 'user-2',
        keycloakSub: 'patient-sub',
        displayName: 'New Patient',
        email: 'patient@example.com',
      },
      roles: [],
    };

    it('is not computed at all for a user who already holds a role', async () => {
      const result = await controller.whoami({ user: reqUser });

      expect(result.onboarding).toBeNull();
      // Not merely null: the query is never made, so a staff sign-in costs nothing extra.
      expect(prisma.patientPortalInvite.findMany).not.toHaveBeenCalled();
    });

    it('is withheld from a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'patient@example.com',
        phoneE164: null,
        isActive: false,
      });

      const result = await controller.whoami({ user: rolelessUser });

      expect(result.onboarding).toBeNull();
      expect(prisma.patientPortalInvite.findMany).not.toHaveBeenCalled();
    });

    /*
      An account with neither an email address nor a phone number matches no invitation by
      identity. Building the query anyway would leave an empty OR, which matches every row --
      so this early return is a tenant boundary, not an optimisation.
    */
    it('is withheld, without querying, from an account with no contact details at all', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: null,
        phoneE164: null,
        isActive: true,
      });

      const result = await controller.whoami({ user: rolelessUser });

      expect(result.onboarding).toBeNull();
      expect(prisma.patientPortalInvite.findMany).not.toHaveBeenCalled();
    });

    it('is null rather than an empty list when nothing is waiting', async () => {
      prisma.patientPortalInvite.findMany.mockResolvedValue([]);

      const result = await controller.whoami({ user: rolelessUser });

      expect(result.onboarding).toBeNull();
    });

    it('matches an invitation staged against a phone number alone', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: null,
        phoneE164: '+233240000000',
        isActive: true,
      });
      prisma.patientPortalInvite.findMany.mockResolvedValue([]);

      await controller.whoami({ user: rolelessUser });

      expect(prisma.patientPortalInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ OR: [{ phoneE164: '+233240000000' }] }]),
          }),
        }),
      );
    });

    // A retired chart's invitation must not route anyone anywhere: the claim would refuse it,
    // and the patient has no way to discover that the clinic moved their record.
    it('ignores an invitation still pointing at a merged record', async () => {
      prisma.patientPortalInvite.findMany.mockResolvedValue([]);

      await controller.whoami({ user: rolelessUser });

      expect(prisma.patientPortalInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patient: { mergedIntoPatientId: null },
          }),
        }),
      );
    });
  });
});
