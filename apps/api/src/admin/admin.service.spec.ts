import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminService, type AdminActor } from './admin.service';

function buildRoleEntry(
  overrides: Partial<{
    id: string;
    clinicId: string | null;
    role: UserRole;
    clinicName: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? `${overrides.role ?? UserRole.VOLUNTEER}-role`,
    clinicId: overrides.clinicId ?? 'clinic-1',
    role: overrides.role ?? UserRole.VOLUNTEER,
    clinic: overrides.clinicId === null ? null : { name: overrides.clinicName ?? 'Clinic One' },
  };
}

function buildUser(
  overrides: Partial<{
    id: string;
    keycloakSub: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    clinicRoles: ReturnType<typeof buildRoleEntry>[];
  }> = {},
) {
  return {
    id: overrides.id ?? 'user-1',
    keycloakSub: overrides.keycloakSub ?? 'sub-1',
    displayName: overrides.displayName ?? 'Test User',
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'User',
    email: overrides.email ?? 'test@example.com',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date('2026-03-23T08:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-03-23T09:00:00.000Z'),
    clinicRoles: overrides.clinicRoles ?? [buildRoleEntry()],
  };
}

describe('AdminService', () => {
  const managerActor: AdminActor = {
    userId: 'manager-1',
    roles: [{ clinicId: 'clinic-1', role: UserRole.MANAGER }],
  };

  const directorActor: AdminActor = {
    userId: 'director-1',
    roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }],
  };

  const systemAdminActor: AdminActor = {
    userId: 'sysadmin-1',
    roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
  };

  function createService() {
    const prisma = {
      clinic: {
        findFirst: jest.fn().mockResolvedValue({ id: 'clinic-1' }),
        findUnique: jest.fn().mockResolvedValue({ name: 'Clinic One' }),
      },
      patientAccountLink: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({
          id: 'link-1',
          patientId: 'patient-1',
          keycloakSub: 'kc-1',
          createdAt: new Date('2026-04-04T12:00:00.000Z'),
        }),
      },
      patient: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'patient-1' }),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userClinicRole: {
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'patient-role-1' }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );

    const auditService = {
      logWrite: jest.fn().mockResolvedValue(undefined),
    };

    const reminderService = {
      sendNotificationNow: jest.fn().mockResolvedValue({
        id: 'delivery-1',
        status: 'QUEUED',
        failureReason: null,
        sentAt: null,
        createdAt: new Date('2026-03-21T09:00:00.000Z'),
      }),
    };

    return {
      prisma,
      auditService,
      reminderService,
      service: new AdminService(prisma as never, auditService as never, reminderService as never),
    };
  }

  it('lists clinic users with the requested status filter', async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([buildUser()]);

    await service.listClinicUsers(managerActor, 'clinic-1', 'inactive');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: false,
          clinicRoles: { some: { clinicId: 'clinic-1' } },
        }),
      }),
    );
  });

  it('returns cleanup metadata in system admin user summaries', async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([
      buildUser({
        keycloakSub: 'kc-123',
        createdAt: new Date('2026-03-20T08:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:30:00.000Z'),
      }),
    ]);

    await expect(service.listUsers(systemAdminActor, 'all')).resolves.toEqual([
      expect.objectContaining({
        keycloakSub: 'kc-123',
        createdAt: '2026-03-20T08:00:00.000Z',
        updatedAt: '2026-03-21T10:30:00.000Z',
        patientPortal: expect.objectContaining({
          status: 'NONE',
        }),
      }),
    ]);
  });

  it('reports ROLE_ONLY when a user has PATIENT access without a portal link', async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([
      buildUser({
        id: 'patient-role-only',
        clinicRoles: [buildRoleEntry({ clinicId: 'clinic-1', role: UserRole.PATIENT })],
      }),
    ]);

    await expect(service.listUsers(systemAdminActor, 'all')).resolves.toEqual([
      expect.objectContaining({
        id: 'patient-role-only',
        patientPortal: expect.objectContaining({
          status: 'ROLE_ONLY',
          patientId: null,
        }),
      }),
    ]);
  });

  it('reports LINKED when a portal-linked user also has the matching PATIENT role', async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([
      buildUser({
        id: 'linked-user',
        keycloakSub: 'linked-sub',
        clinicRoles: [buildRoleEntry({ clinicId: 'clinic-1', role: UserRole.PATIENT })],
      }),
    ]);
    prisma.patientAccountLink.findMany.mockResolvedValue([
      {
        keycloakSub: 'linked-sub',
        patient: {
          id: 'patient-1',
          patientCode: 'NKP-2026-000001',
          primaryClinicId: 'clinic-1',
          primaryClinic: { name: 'Clinic One' },
        },
      },
    ]);

    await expect(service.listUsers(systemAdminActor, 'all')).resolves.toEqual([
      expect.objectContaining({
        id: 'linked-user',
        patientPortal: expect.objectContaining({
          status: 'LINKED',
          patientId: 'patient-1',
          clinicId: 'clinic-1',
        }),
      }),
    ]);
  });

  it('allows a manager to deactivate a clinic volunteer', async () => {
    const { prisma, auditService, service } = createService();
    const target = buildUser({
      id: 'volunteer-1',
      clinicRoles: [buildRoleEntry({ role: UserRole.VOLUNTEER })],
    });
    prisma.user.findUnique.mockResolvedValue(target);
    prisma.user.update.mockResolvedValue({ ...target, isActive: false });

    const result = await service.deactivateUserInClinic(
      managerActor,
      'clinic-1',
      'volunteer-1',
      'req-1',
    );

    expect(result).toMatchObject({ id: 'volunteer-1', isActive: false });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'volunteer-1' },
        data: { isActive: false },
      }),
    );
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-1',
        action: 'USER.DEACTIVATE',
        entityId: 'volunteer-1',
      }),
    );
  });

  it('prevents a manager from deactivating a clinic manager', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue(
      buildUser({
        id: 'manager-2',
        clinicRoles: [buildRoleEntry({ role: UserRole.MANAGER })],
      }),
    );

    await expect(
      service.deactivateUserInClinic(managerActor, 'clinic-1', 'manager-2', 'req-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a director to deactivate a clinic manager', async () => {
    const { prisma, service } = createService();
    const target = buildUser({
      id: 'manager-2',
      clinicRoles: [buildRoleEntry({ role: UserRole.MANAGER })],
    });
    prisma.user.findUnique.mockResolvedValue(target);
    prisma.user.update.mockResolvedValue({ ...target, isActive: false });

    await expect(
      service.deactivateUserInClinic(directorActor, 'clinic-1', 'manager-2', 'req-3'),
    ).resolves.toMatchObject({
      id: 'manager-2',
      isActive: false,
    });
  });

  it('blocks clinic-context deactivation when the user has outside-clinic access', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue(
      buildUser({
        id: 'shared-1',
        clinicRoles: [
          buildRoleEntry({ id: 'r-1', clinicId: 'clinic-1', role: UserRole.VOLUNTEER }),
          buildRoleEntry({
            id: 'r-2',
            clinicId: 'clinic-2',
            role: UserRole.VOLUNTEER,
            clinicName: 'Clinic Two',
          }),
        ],
      }),
    );

    await expect(
      service.deactivateUserInClinic(managerActor, 'clinic-1', 'shared-1', 'req-4'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a system admin to deactivate a multi-clinic user globally', async () => {
    const { prisma, auditService, service } = createService();
    const target = buildUser({
      id: 'shared-1',
      clinicRoles: [
        buildRoleEntry({ id: 'r-1', clinicId: 'clinic-1', role: UserRole.MANAGER }),
        buildRoleEntry({
          id: 'r-2',
          clinicId: 'clinic-2',
          role: UserRole.DIRECTOR,
          clinicName: 'Clinic Two',
        }),
      ],
    });
    prisma.user.findUnique.mockResolvedValue(target);
    prisma.user.update.mockResolvedValue({ ...target, isActive: false });

    await expect(
      service.deactivateUserGlobally(systemAdminActor, 'shared-1', 'req-5'),
    ).resolves.toMatchObject({
      id: 'shared-1',
      isActive: false,
    });

    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: null,
        action: 'USER.DEACTIVATE',
      }),
    );
  });

  describe('staff lifecycle notifications', () => {
    it('emails a staff member when they are granted clinic access', async () => {
      const { prisma, reminderService, service } = createService();
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-9' }));
      prisma.userClinicRole.findFirst.mockResolvedValue(null);
      prisma.userClinicRole.create.mockResolvedValue(
        buildRoleEntry({ id: 'r-9', clinicId: 'clinic-1', role: UserRole.DOCTOR }),
      );
      prisma.clinic.findUnique.mockResolvedValue({ name: 'Cape Coast Clinic' });

      await service.assignRole(systemAdminActor, 'user-9', 'clinic-1', UserRole.DOCTOR);

      expect(reminderService.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'STAFF_ROLE_GRANTED_V1',
          recipientType: 'USER',
          recipientUserId: 'user-9',
          clinicId: 'clinic-1',
          payload: expect.objectContaining({ role: UserRole.DOCTOR, scope: 'CLINIC' }),
        }),
      );
    });

    it('sends nothing when the role was already held', async () => {
      // assignRole returns the existing grant early. Emailing on a no-op would train
      // staff to ignore these messages.
      const { prisma, reminderService, service } = createService();
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-9' }));
      prisma.userClinicRole.findFirst.mockResolvedValue(
        buildRoleEntry({ id: 'r-9', clinicId: 'clinic-1', role: UserRole.DOCTOR }),
      );

      await service.assignRole(systemAdminActor, 'user-9', 'clinic-1', UserRole.DOCTOR);

      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
      expect(reminderService.sendNotificationNow).not.toHaveBeenCalled();
    });

    it('sends nothing for a SYSTEM_ADMIN grant, which has no clinic', async () => {
      const { prisma, reminderService, service } = createService();
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'user-9' }));
      prisma.userClinicRole.findFirst.mockResolvedValue(null);
      prisma.userClinicRole.create.mockResolvedValue(
        buildRoleEntry({ id: 'r-9', clinicId: null, role: UserRole.SYSTEM_ADMIN }),
      );

      await service.assignRole(systemAdminActor, 'user-9', null, UserRole.SYSTEM_ADMIN);

      expect(reminderService.sendNotificationNow).not.toHaveBeenCalled();
    });

    it('records a global deactivation against no clinic, matching its audit event', async () => {
      // Attributing a system-wide action to one of the user's clinics would misreport
      // its scope. The clinic name is used only to address the message.
      const { prisma, reminderService, service } = createService();
      const target = buildUser({
        id: 'shared-1',
        clinicRoles: [buildRoleEntry({ id: 'r-1', clinicId: 'clinic-1', role: UserRole.MANAGER })],
      });
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: false });

      await service.deactivateUserGlobally(systemAdminActor, 'shared-1', 'req-9');

      expect(reminderService.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'STAFF_ACCOUNT_DEACTIVATED_V1',
          clinicId: null,
          payload: expect.objectContaining({ scope: 'GLOBAL' }),
        }),
      );
    });

    it('still deactivates a user who has no email on file', async () => {
      // Access management must never depend on a mailbox; the ledger records the
      // missing address instead.
      const { prisma, reminderService, service } = createService();
      // buildUser coalesces a null email back to its default, so it is set explicitly.
      const target = { ...buildUser({ id: 'no-mail' }), email: null };
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: false });

      await expect(
        service.deactivateUserGlobally(systemAdminActor, 'no-mail', 'req-10'),
      ).resolves.toMatchObject({ isActive: false });

      expect(reminderService.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({ toAddress: null }),
      );
    });
  });

  it('revokes a clinic role and emits a ROLE.REVOKE audit event', async () => {
    const { prisma, auditService, service } = createService();
    prisma.userClinicRole.findFirst.mockResolvedValue(
      buildRoleEntry({
        id: 'doctor-role-1',
        clinicId: 'clinic-1',
        role: UserRole.DOCTOR,
      }),
    );

    const result = await service.revokeClinicRole(
      managerActor,
      'clinic-1',
      'doctor-1',
      UserRole.DOCTOR,
      'req-6',
    );

    expect(result).toEqual({ deleted: true });
    expect(prisma.userClinicRole.delete).toHaveBeenCalledWith({
      where: { id: 'doctor-role-1' },
    });
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-1',
        action: 'ROLE.REVOKE',
        entityId: 'doctor-role-1',
      }),
    );
  });

  it('blocks self-deactivation and self-role-revocation', async () => {
    const { service } = createService();

    await expect(
      service.deactivateUserInClinic(managerActor, 'clinic-1', 'manager-1', 'req-7'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.revokeClinicRole(managerActor, 'clinic-1', 'manager-1', UserRole.DOCTOR, 'req-8'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('raises a conflict when deactivating an already inactive user', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue(
      buildUser({
        id: 'inactive-1',
        isActive: false,
        clinicRoles: [buildRoleEntry({ role: UserRole.VOLUNTEER })],
      }),
    );

    await expect(
      service.deactivateUserGlobally(systemAdminActor, 'inactive-1', 'req-9'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks assigning a role to an inactive user with a lifecycle message', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue(
      buildUser({
        id: 'inactive-2',
        isActive: false,
      }),
    );

    await expect(
      service.assignRole(systemAdminActor, 'inactive-2', 'clinic-1', UserRole.DOCTOR),
    ).rejects.toThrow(
      'Cannot assign roles to an inactive user. Ask the replacement user to sign in, then reassign access to the new account.',
    );
    expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
  });

  it('blocks generic PATIENT role assignment and directs admins to use portal linking', async () => {
    const { prisma, service } = createService();

    await expect(
      service.assignRole(systemAdminActor, 'user-1', 'clinic-1', UserRole.PATIENT),
    ).rejects.toThrow('Patient access must be granted from a patient record via portal link.');

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
  });
});
