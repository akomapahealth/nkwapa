import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    identitySyncStatus: 'NOT_SYNCED' as const,
    identitySyncFailureReason: null,
    identitySyncRequestedAt: null,
    identitySyncedAt: null,
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

    const identitySync = {
      requestSync: jest.fn().mockResolvedValue({ status: 'PENDING', failureReason: null }),
    };

    return {
      prisma,
      identitySync,
      auditService,
      reminderService,
      service: new AdminService(
        prisma as never,
        auditService as never,
        reminderService as never,
        identitySync as never,
      ),
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

  // Idempotent (#126): a repeat changes nothing locally, sends nothing, and re-requests the
  // identity half, which is how an admin retries a disable that did not land.
  it('treats deactivating an already inactive user as a retry of the identity half', async () => {
    const { prisma, reminderService, identitySync, service } = createService();
    prisma.user.findUnique.mockResolvedValue(
      buildUser({
        id: 'inactive-1',
        isActive: false,
        clinicRoles: [buildRoleEntry({ role: UserRole.VOLUNTEER })],
      }),
    );

    await expect(
      service.deactivateUserGlobally(systemAdminActor, 'inactive-1', 'req-9'),
    ).resolves.toMatchObject({ alreadyInactive: true, identity: { status: 'PENDING' } });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(reminderService.sendNotificationNow).not.toHaveBeenCalled();
    expect(identitySync.requestSync).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'inactive-1', expectedActive: false }),
    );
  });

  describe('the sign-in identity (#126)', () => {
    it('queues the identity disable after the local block, never before', async () => {
      const { prisma, identitySync, service } = createService();
      const target = buildUser({ id: 'vol-1' });
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: false });

      const result = await service.deactivateUserGlobally(systemAdminActor, 'vol-1', 'req-10');

      expect(identitySync.requestSync).toHaveBeenCalledWith({
        userId: 'vol-1',
        expectedActive: false,
        actorUserId: systemAdminActor.userId,
        requestId: 'req-10',
      });
      expect(prisma.user.update.mock.invocationCallOrder[0]).toBeLessThan(
        identitySync.requestSync.mock.invocationCallOrder[0],
      );
      expect(result).toMatchObject({ isActive: false, identity: { status: 'PENDING' } });
    });

    // The local block is what matters for safety. A queue that cannot take the job must not
    // turn a completed deactivation into an error.
    it('keeps the local block and reports it when the identity half cannot even be queued', async () => {
      const { prisma, identitySync, service } = createService();
      const target = buildUser({ id: 'vol-2' });
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: false });
      identitySync.requestSync.mockResolvedValue({
        status: 'FAILED',
        failureReason: 'QUEUE_UNAVAILABLE',
      });

      await expect(
        service.deactivateUserGlobally(systemAdminActor, 'vol-2', 'req-11'),
      ).resolves.toMatchObject({
        isActive: false,
        identity: { status: 'FAILED', failureReason: 'QUEUE_UNAVAILABLE' },
      });
    });

    it('disables the identity when a clinic deactivation removes the last access', async () => {
      const { prisma, identitySync, service } = createService();
      const target = buildUser({ id: 'vol-3' });
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: false });

      await service.deactivateUserInClinic(managerActor, 'clinic-1', 'vol-3', 'req-12');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
      expect(identitySync.requestSync).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'vol-3', expectedActive: false }),
      );
    });

    /*
      The case the issue names: getting it backwards locks a working clinician out of a clinic
      that never asked for it. The account stays active, the identity is untouched, and only this
      clinic's roles go.
    */
    it('withdraws only this clinic when the user still works elsewhere', async () => {
      const { prisma, auditService, identitySync, service } = createService();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          id: 'doc-1',
          clinicRoles: [
            buildRoleEntry({ id: 'r-a', clinicId: 'clinic-1', role: UserRole.DOCTOR }),
            buildRoleEntry({
              id: 'r-b',
              clinicId: 'clinic-2',
              role: UserRole.DOCTOR,
              clinicName: 'Clinic Two',
            }),
          ],
        }),
      );

      const result = await service.deactivateUserInClinic(
        systemAdminActor,
        'clinic-1',
        'doc-1',
        'req-13',
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(identitySync.requestSync).not.toHaveBeenCalled();
      expect(prisma.userClinicRole.delete).toHaveBeenCalledWith({ where: { id: 'r-a' } });
      expect(prisma.userClinicRole.delete).toHaveBeenCalledTimes(1);
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE.REVOKE', entityId: 'r-a', clinicId: 'clinic-1' }),
      );
      expect(result).toMatchObject({
        isActive: true,
        accessRemaining: true,
        rolesWithdrawn: [UserRole.DOCTOR],
      });
    });

    it('reactivates globally, announces it, and re-enables the identity', async () => {
      const { prisma, auditService, reminderService, identitySync, service } = createService();
      const target = buildUser({ id: 'vol-4', isActive: false });
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: true });

      const result = await service.reactivateUserGlobally(systemAdminActor, 'vol-4', 'req-14');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER.REACTIVATE', clinicId: null }),
      );
      expect(reminderService.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'STAFF_ACCOUNT_REACTIVATED_V1' }),
      );
      expect(identitySync.requestSync).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'vol-4', expectedActive: true }),
      );
      expect(result).toMatchObject({ isActive: true, identity: { status: 'PENDING' } });
    });

    it('lets a clinic manager reactivate a volunteer they could deactivate', async () => {
      const { prisma, identitySync, service } = createService();
      const target = buildUser({ id: 'vol-5', isActive: false });
      prisma.user.findUnique.mockResolvedValue(target);
      prisma.user.update.mockResolvedValue({ ...target, isActive: true });

      await service.reactivateUserInClinic(managerActor, 'clinic-1', 'vol-5', 'req-15');

      expect(identitySync.requestSync).toHaveBeenCalledWith(
        expect.objectContaining({ expectedActive: true }),
      );
    });

    it('refuses a clinic manager reactivating someone with access elsewhere', async () => {
      const { prisma, identitySync, service } = createService();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          id: 'vol-6',
          isActive: false,
          clinicRoles: [
            buildRoleEntry({ id: 'r-1', clinicId: 'clinic-1' }),
            buildRoleEntry({ id: 'r-2', clinicId: 'clinic-2', clinicName: 'Clinic Two' }),
          ],
        }),
      );

      await expect(
        service.reactivateUserInClinic(managerActor, 'clinic-1', 'vol-6', 'req-16'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(identitySync.requestSync).not.toHaveBeenCalled();
    });

    it('treats reactivating an active user as a retry of the identity enable', async () => {
      const { prisma, reminderService, identitySync, service } = createService();
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'vol-7' }));

      await expect(
        service.reactivateUserGlobally(systemAdminActor, 'vol-7', 'req-17'),
      ).resolves.toMatchObject({ alreadyActive: true });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(reminderService.sendNotificationNow).not.toHaveBeenCalled();
      expect(identitySync.requestSync).toHaveBeenCalledWith(
        expect.objectContaining({ expectedActive: true }),
      );
    });

    it.each([
      [true, 'an active user'],
      [false, 'a deactivated user'],
    ])('syncs toward the account state for %s (%s)', async (isActive) => {
      const { prisma, identitySync, service } = createService();
      prisma.user.findUnique.mockResolvedValue(buildUser({ id: 'vol-8', isActive }));

      await service.retryIdentitySync(systemAdminActor, 'vol-8', null, 'req-18');

      expect(identitySync.requestSync).toHaveBeenCalledWith(
        expect.objectContaining({ expectedActive: isActive }),
      );
    });

    it('keeps a clinic-less identity sync to system admins', async () => {
      const { service } = createService();
      await expect(
        service.retryIdentitySync(directorActor, 'vol-9', null, 'req-19'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
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
