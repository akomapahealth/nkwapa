import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { StaffInviteService, type StaffInviteActor } from './staff-invite.service';
import {
  createKeycloakAdminServiceMock,
  provisionResult,
  type KeycloakAdminServiceMock,
} from '../testing/keycloak-admin-fixtures';

const CLINIC_A = 'aa000000-0000-4000-8000-0000000000a1';
const CLINIC_B = 'bb000000-0000-4000-8000-0000000000b1';
const INVITE_ID = 'cc000000-0000-4000-8000-0000000000c1';
const HOUR = 60 * 60 * 1000;

const directorOfA: StaffInviteActor = {
  userId: 'director-a',
  roles: [{ clinicId: CLINIC_A, role: UserRole.DIRECTOR }],
};
const systemAdmin: StaffInviteActor = {
  userId: 'sysadmin',
  roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
};
const managerOfA: StaffInviteActor = {
  userId: 'manager-a',
  roles: [{ clinicId: CLINIC_A, role: UserRole.MANAGER }],
};

function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITE_ID,
    clinicId: CLINIC_A,
    email: 'ama@clinic.org',
    role: UserRole.DOCTOR,
    status: 'PENDING',
    createdByUserId: directorOfA.userId,
    acceptedByUserId: null,
    acceptedAt: null,
    cancelledByUserId: null,
    cancelledAt: null,
    expiresAt: new Date(Date.now() + 48 * HOUR),
    createdAt: new Date(),
    updatedAt: new Date(),
    identityStatus: 'NOT_REQUESTED',
    keycloakUserId: null,
    identityProvisionedAt: null,
    identityFailureReason: null,
    ...overrides,
  };
}

describe('StaffInviteService', () => {
  const OLD_ENV = process.env;
  let prisma: {
    clinic: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; findUnique: jest.Mock };
    staffInvite: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    userClinicRole: { findFirst: jest.Mock; create: jest.Mock };
  };
  let audit: { logWrite: jest.Mock };
  let reminders: { sendNotificationNow: jest.Mock };
  let keycloak: KeycloakAdminServiceMock;
  let deliverability: { assertDomainAcceptsEmail: jest.Mock };
  let service: StaffInviteService;

  beforeEach(() => {
    process.env = { ...OLD_ENV, APP_PUBLIC_URL: 'https://app.example' };
    prisma = {
      clinic: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve({ id: where.id, name: 'Accra Clinic', timezone: 'Africa/Accra' }),
          ),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ displayName: 'Dr Director' }),
      },
      staffInvite: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(inviteRow(data))),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userClinicRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'ucr-1', ...data })),
      },
    };
    audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
    reminders = {
      sendNotificationNow: jest.fn().mockResolvedValue({
        status: 'QUEUED',
        failureReason: null,
        sentAt: null,
        createdAt: new Date(),
      }),
    };
    keycloak = createKeycloakAdminServiceMock();
    deliverability = { assertDomainAcceptsEmail: jest.fn().mockResolvedValue(undefined) };
    service = new StaffInviteService(
      prisma as never,
      audit as never,
      reminders as never,
      keycloak as never,
      deliverability as never,
    );
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  const auditActions = () => audit.logWrite.mock.calls.map(([entry]) => entry.action);

  describe('issuing', () => {
    it('lets a director invite a doctor into their own clinic, account first and email second', async () => {
      const result = await service.create(directorOfA, CLINIC_A, {
        email: 'Ama@Clinic.org',
        role: UserRole.DOCTOR,
      });

      expect(prisma.staffInvite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId: CLINIC_A,
          email: 'ama@clinic.org',
          role: UserRole.DOCTOR,
          createdByUserId: directorOfA.userId,
        }),
      });
      // 72 hours by default, not the patient invitation's 14 days.
      const { expiresAt } = prisma.staffInvite.create.mock.calls[0][0].data;
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * HOUR);
      expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(72 * HOUR);

      expect(keycloak.provisionInvitedIdentity).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ama@clinic.org',
          claimRedirectUri: 'https://app.example/accept-invite?continue=1',
        }),
      );
      const provisionedAt = keycloak.provisionInvitedIdentity.mock.invocationCallOrder[0];
      const sentAt = reminders.sendNotificationNow.mock.invocationCallOrder[0];
      expect(provisionedAt).toBeLessThan(sentAt);

      expect(reminders.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: 'USER',
          recipientUserId: null,
          staffInviteId: INVITE_ID,
          toAddress: 'ama@clinic.org',
          templateKey: 'STAFF_INVITE_V1',
          payload: expect.objectContaining({
            clinicName: 'Accra Clinic',
            role: UserRole.DOCTOR,
            inviterName: 'Dr Director',
            acceptUrl: 'https://app.example/accept-invite',
            accountSetup: 'PENDING_PASSWORD',
            resend: false,
          }),
        }),
      );
      expect(auditActions()).toEqual(['STAFF.INVITE.CREATE', 'STAFF.INVITE.IDENTITY']);
      expect(result.identity.status).toBe('PROVISIONED');
      expect(result.status).toBe('PENDING');
    });

    it('lets a system admin invite into any clinic', async () => {
      await service.create(systemAdmin, CLINIC_B, {
        email: 'kofi@clinic.org',
        role: UserRole.MANAGER,
      });
      expect(prisma.staffInvite.create).toHaveBeenCalled();
    });

    it.each([UserRole.DIRECTOR, UserRole.SYSTEM_ADMIN, UserRole.PATIENT])(
      'refuses to let a director escalate by inviting a %s',
      async (role) => {
        await expect(
          service.create(directorOfA, CLINIC_A, { email: 'kofi@clinic.org', role }),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.staffInvite.create).not.toHaveBeenCalled();
      },
    );

    it('refuses a system admin a DIRECTOR invitation too; that seat stays manual', async () => {
      await expect(
        service.create(systemAdmin, CLINIC_A, {
          email: 'kofi@clinic.org',
          role: UserRole.DIRECTOR,
        }),
      ).rejects.toMatchObject({ response: { code: 'STAFF_INVITE_ROLE_NOT_INVITABLE' } });
    });

    it('refuses a director issuing into a clinic they do not direct', async () => {
      await expect(
        service.create(directorOfA, CLINIC_B, {
          email: 'kofi@clinic.org',
          role: UserRole.VOLUNTEER,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.staffInvite.create).not.toHaveBeenCalled();
    });

    it('refuses a manager, whose lifecycle authority does not extend to inviting', async () => {
      await expect(
        service.create(managerOfA, CLINIC_A, {
          email: 'kofi@clinic.org',
          role: UserRole.VOLUNTEER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a shared inbox outright', async () => {
      await expect(
        service.create(directorOfA, CLINIC_A, {
          email: 'reception@clinic.org',
          role: UserRole.VOLUNTEER,
        }),
      ).rejects.toMatchObject({ response: { code: 'STAFF_INVITE_SHARED_MAILBOX' } });
      expect(keycloak.provisionInvitedIdentity).not.toHaveBeenCalled();
    });

    describe('an address that already has an account', () => {
      it('tells the inviter when it belongs to a staff account, and sends nothing', async () => {
        prisma.user.findFirst.mockResolvedValue({
          id: 'user-9',
          isActive: true,
          clinicRoles: [{ clinicId: CLINIC_B, role: UserRole.DOCTOR }],
        });

        await expect(
          service.create(directorOfA, CLINIC_A, {
            email: 'ama@clinic.org',
            role: UserRole.VOLUNTEER,
          }),
        ).rejects.toMatchObject({ response: { code: 'STAFF_INVITE_ADDRESS_IN_USE' } });
        expect(prisma.staffInvite.create).not.toHaveBeenCalled();
        expect(reminders.sendNotificationNow).not.toHaveBeenCalled();
      });

      it('proceeds once the inviter confirms that is the person they mean', async () => {
        prisma.user.findFirst.mockResolvedValue({
          id: 'user-9',
          isActive: true,
          clinicRoles: [{ clinicId: CLINIC_B, role: UserRole.DOCTOR }],
        });

        await service.create(directorOfA, CLINIC_A, {
          email: 'ama@clinic.org',
          role: UserRole.VOLUNTEER,
          confirmExistingAccount: true,
        });

        expect(reminders.sendNotificationNow).toHaveBeenCalledWith(
          expect.objectContaining({ recipientUserId: 'user-9' }),
        );
      });

      // Telling a director that an address belongs to a patient would disclose that someone is one.
      it('says nothing when the account is only a patient account', async () => {
        prisma.user.findFirst.mockResolvedValue({
          id: 'user-10',
          isActive: true,
          clinicRoles: [{ clinicId: CLINIC_A, role: UserRole.PATIENT }],
        });

        await expect(
          service.create(directorOfA, CLINIC_A, {
            email: 'ama@clinic.org',
            role: UserRole.VOLUNTEER,
          }),
        ).resolves.toBeDefined();
      });

      it('refuses a deactivated account rather than quietly re-admitting it', async () => {
        prisma.user.findFirst.mockResolvedValue({
          id: 'user-11',
          isActive: false,
          clinicRoles: [],
        });

        await expect(
          service.create(directorOfA, CLINIC_A, {
            email: 'ama@clinic.org',
            role: UserRole.VOLUNTEER,
            confirmExistingAccount: true,
          }),
        ).rejects.toMatchObject({ response: { code: 'STAFF_INVITE_ACCOUNT_DEACTIVATED' } });
      });

      it('refuses to invite someone to a role they already hold here', async () => {
        prisma.user.findFirst.mockResolvedValue({
          id: 'user-12',
          isActive: true,
          clinicRoles: [{ clinicId: CLINIC_A, role: UserRole.DOCTOR }],
        });

        await expect(
          service.create(directorOfA, CLINIC_A, {
            email: 'ama@clinic.org',
            role: UserRole.DOCTOR,
            confirmExistingAccount: true,
          }),
        ).rejects.toMatchObject({ response: { code: 'STAFF_INVITE_ROLE_ALREADY_HELD' } });
      });
    });

    it('cancels a live invitation to the same address in the same clinic, and says why', async () => {
      prisma.staffInvite.findMany.mockResolvedValue([
        { id: 'old-invite', role: UserRole.VOLUNTEER, expiresAt: new Date() },
      ]);

      await service.create(directorOfA, CLINIC_A, {
        email: 'ama@clinic.org',
        role: UserRole.DOCTOR,
      });

      expect(prisma.staffInvite.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-invite'] }, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledByUserId: directorOfA.userId,
        }),
      });
      const superseded = audit.logWrite.mock.calls.find(
        ([entry]) => entry.entityId === 'old-invite',
      );
      expect(superseded?.[0]).toMatchObject({ action: 'STAFF.INVITE.CANCEL' });
      expect(JSON.parse(superseded?.[0].afterJson)).toMatchObject({ reason: 'superseded' });
    });

    // A clinic must be able to invite while Keycloak is down; the list says what is missing.
    it('still issues and emails the invitation when Keycloak cannot be reached', async () => {
      keycloak.provisionInvitedIdentity.mockResolvedValue(
        provisionResult({
          outcome: 'FAILED',
          keycloakUserId: null,
          failureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
        }),
      );

      const result = await service.create(directorOfA, CLINIC_A, {
        email: 'ama@clinic.org',
        role: UserRole.DOCTOR,
      });

      expect(result.identity).toMatchObject({
        status: 'FAILED',
        failureReason: 'KEYCLOAK_ADMIN_TIMEOUT',
      });
      expect(reminders.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ accountSetup: 'UNKNOWN' }) }),
      );
    });
  });

  describe('resending', () => {
    it('provisions again, which Keycloak makes idempotent, and marks the email as a reminder', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(inviteRow());
      keycloak.provisionInvitedIdentity.mockResolvedValue(
        provisionResult({ outcome: 'ALREADY_ACTIVE', actionsSent: [] }),
      );

      const result = await service.resend(directorOfA, CLINIC_A, INVITE_ID);

      expect(keycloak.provisionInvitedIdentity).toHaveBeenCalledTimes(1);
      expect(reminders.sendNotificationNow).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ resend: true, accountSetup: 'EXISTING_ACCOUNT' }),
        }),
      );
      expect(result.identity.status).toBe('ALREADY_ACTIVE');
      expect(auditActions()).toEqual(['STAFF.INVITE.RESEND', 'STAFF.INVITE.IDENTITY']);
    });

    it.each([
      ['cancelled', { status: 'CANCELLED' }],
      ['accepted', { status: 'ACCEPTED' }],
      ['lapsed', { expiresAt: new Date(Date.now() - 1000) }],
    ])('refuses a %s invitation', async (_label, overrides) => {
      prisma.staffInvite.findFirst.mockResolvedValue(inviteRow(overrides));

      await expect(service.resend(directorOfA, CLINIC_A, INVITE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(keycloak.provisionInvitedIdentity).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    it('stops a pending invitation and audits it', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(inviteRow());

      const result = await service.cancel(directorOfA, CLINIC_A, INVITE_ID);

      expect(prisma.staffInvite.updateMany).toHaveBeenCalledWith({
        where: { id: INVITE_ID, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledByUserId: directorOfA.userId,
        }),
      });
      expect(result.status).toBe('CANCELLED');
      expect(auditActions()).toEqual(['STAFF.INVITE.CANCEL']);
    });

    it('reports a race with an acceptance rather than claiming success', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(inviteRow());
      prisma.staffInvite.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel(directorOfA, CLINIC_A, INVITE_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(audit.logWrite).not.toHaveBeenCalled();
    });
  });

  describe('accepting', () => {
    const invitee = {
      id: 'invitee-1',
      email: 'ama@clinic.org',
      isActive: true,
      keycloakSub: 'kc-provisioned-1',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(invitee);
    });

    const openInvite = (overrides: Record<string, unknown> = {}) =>
      inviteRow({
        keycloakUserId: 'kc-provisioned-1',
        clinic: { id: CLINIC_A, name: 'Accra Clinic', isActive: true },
        ...overrides,
      });

    it('grants the role immediately, auditing the acceptance and the grant', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(openInvite());

      const result = await service.accept(invitee.id, INVITE_ID);

      expect(prisma.staffInvite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVITE_ID, email: 'ama@clinic.org' } }),
      );
      expect(prisma.staffInvite.updateMany).toHaveBeenCalledWith({
        where: { id: INVITE_ID, status: 'PENDING', expiresAt: { gt: expect.any(Date) } },
        data: expect.objectContaining({ status: 'ACCEPTED', acceptedByUserId: invitee.id }),
      });
      expect(prisma.userClinicRole.create).toHaveBeenCalledWith({
        data: { userId: invitee.id, clinicId: CLINIC_A, role: UserRole.DOCTOR },
      });
      expect(auditActions()).toEqual(['STAFF.INVITE.ACCEPT', 'ROLE.GRANT']);
      expect(result).toEqual({
        clinicId: CLINIC_A,
        clinicName: 'Accra Clinic',
        role: UserRole.DOCTOR,
      });
    });

    it('does not duplicate a role the invitee already holds', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(openInvite());
      prisma.userClinicRole.findFirst.mockResolvedValue({ id: 'existing-role' });

      await service.accept(invitee.id, INVITE_ID);

      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
      expect(auditActions()).toEqual(['STAFF.INVITE.ACCEPT']);
    });

    it('is idempotent for the person who already accepted it', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(
        openInvite({ status: 'ACCEPTED', acceptedByUserId: invitee.id }),
      );

      await expect(service.accept(invitee.id, INVITE_ID)).resolves.toMatchObject({
        clinicId: CLINIC_A,
      });
      expect(prisma.staffInvite.updateMany).not.toHaveBeenCalled();
      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
    });

    it.each([
      ['cancelled', { status: 'CANCELLED' }],
      ['expired', { status: 'EXPIRED' }],
      ['lapsed but unswept', { expiresAt: new Date(Date.now() - 1000) }],
    ])('refuses a %s invitation and grants nothing', async (_label, overrides) => {
      prisma.staffInvite.findFirst.mockResolvedValue(openInvite(overrides));

      await expect(service.accept(invitee.id, INVITE_ID)).rejects.toThrow(BadRequestException);
      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
    });

    it('treats an invitation to a different address as not found', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(null);

      await expect(service.accept(invitee.id, INVITE_ID)).rejects.toThrow(NotFoundException);
    });

    it('refuses an account whose email is not verified', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...invitee, email: null });

      await expect(service.accept(invitee.id, INVITE_ID)).rejects.toMatchObject({
        response: { code: 'STAFF_INVITE_EMAIL_UNVERIFIED' },
      });
      expect(prisma.staffInvite.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...invitee, isActive: false });

      await expect(service.accept(invitee.id, INVITE_ID)).rejects.toThrow(ForbiddenException);
    });

    it('refuses when the identity Keycloak provisioned is not the one signed in', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(
        openInvite({ keycloakUserId: 'someone-else' }),
      );

      await expect(service.accept(invitee.id, INVITE_ID)).rejects.toMatchObject({
        response: { code: 'STAFF_INVITE_IDENTITY_MISMATCH' },
      });
      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
    });

    it('reports a cancellation that landed first rather than granting anyway', async () => {
      prisma.staffInvite.findFirst.mockResolvedValue(openInvite());
      prisma.staffInvite.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept(invitee.id, INVITE_ID)).rejects.toThrow(ConflictException);
      expect(prisma.userClinicRole.create).not.toHaveBeenCalled();
    });
  });

  describe('listing', () => {
    it('shows cancelled and expired invitations to admins, with the effective status', async () => {
      prisma.staffInvite.findMany.mockResolvedValue([
        {
          ...inviteRow({ id: 'a', status: 'CANCELLED' }),
          reminders: [],
          createdBy: null,
          acceptedBy: null,
          cancelledBy: null,
        },
        {
          ...inviteRow({ id: 'b', expiresAt: new Date(Date.now() - 1000) }),
          reminders: [],
          createdBy: { displayName: 'Dr Director' },
          acceptedBy: null,
          cancelledBy: null,
        },
      ]);

      const result = await service.listForClinic(directorOfA, CLINIC_A);

      expect(prisma.staffInvite.findMany.mock.calls[0][0].where).toEqual({ clinicId: CLINIC_A });
      expect(result.items.map((item) => item.status)).toEqual(['CANCELLED', 'EXPIRED']);
      expect(result.items[1].invitedBy).toBe('Dr Director');
      expect(result.invitableRoles).toEqual([
        UserRole.MANAGER,
        UserRole.DOCTOR,
        UserRole.VOLUNTEER,
      ]);
    });
  });
});
